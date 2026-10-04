package com.suveoo.app;

import android.Manifest;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeWebChromeClient;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

/**
 * MPA 目录路由（第五十一轮 v1.1）+ 返回手势全接管（第五十三轮 v1.2）。
 *
 * 前五版根因回顾：
 *   v1: /home 无后缀 → Capacitor html5mode 回落【根】index.html → location.replace('/home') 死循环 → 白屏。
 *   v2: 只补 <a href>，JS 拼接链接与 location.replace 未覆盖 → 404 后相对路径错位。
 *   v3: server.url 直连生产站，可用但被否决（加载感/离线不可用/3MB）。
 *   v4: 整体替换 WebViewClient 只处理目录 HTML → 静态资源全 null → 全 404 → 白屏。
 *   v5: 完整自服务文件，但 new WebResourceResponse("text/html; charset=utf-8", null, is)
 *       MIME 带 charset 且 encoding=null → WebView 按纯文本渲染（显示 HTML 源码）。
 *
 * 本版：【继承】BridgeWebViewClient 而非替换——launchIntent（外链/通知跳转）、
 * onReceivedError、bridge.reset、JS 注入等 Capacitor 行为全部保留；仅前置拦截
 * "无后缀目录路径"，从 assets/public 就近解析 index.html，其余请求（精确文件、
 * Capacitor 内部桥、外部 API suveoo.com）原样交给 Capacitor 默认本地服务。
 * MIME 用纯类型 + encoding "utf-8"（v5 教训）。
 *
 * 返回处理（第五十三轮，队长 31 场景验收表）：
 *   sc:1-7  页面级返回 = WebView 历史栈 goBack（MPA 每跳入栈；无后缀 URL 由三 pass 解析）。
 *   sc:8    登录后不回登录页 = login.js location.replace（不入栈，前端既有实现）。
 *   sc:9-26 浮层/搜索/AI = JS 层 __suveooBack（assets/js/core/back-button.js，构建时注入）。
 *   sc:27/28 退出 = 无历史时 Toast"再按一次退出"，2s 窗口内第二次 finish()。
 */
public class MainActivity extends BridgeActivity {

    private long lastBackAt = 0L;

    /* ===== 第六十六轮：生物识别锁屏（场景①冷启动/进程重建 + ②后台>60s 回前台） =====
     * 覆盖层为原生全屏 View（navy 品牌底+解锁按钮），显示即自动弹 BiometricPrompt；
     * 验证通过移除覆盖层；取消/失败留在覆盖层等待重试。设备未登记任何生物识别/锁屏凭据时
     * 不上锁（增强不设门槛——真机首启未设指纹的窗口期不困住用户）。 */
    private static final long RELOCK_AFTER_MS = 60_000L;
    private View lockView = null;
    private long pausedAtMs = 0L;
    private boolean bioPromptActive = false;

    /* 麦克风 WebView 权限（第六十二轮）：MicWebChromeClient 用独立 launcher，不共用
     * Capacitor 的共享 permissionListener 单槽；已授予时免对话框免往返直接 grant */
    private ActivityResultLauncher<String[]> micPermLauncher;
    private PermissionRequest pendingMicWebRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* 第六十六轮补修：生物识别插件必须在 super.onCreate 之前注册——BridgeActivity.onCreate
         * 内部即完成桥构建，JSExport.getPluginJS 会在那一刻生成 window.Capacitor.Plugins.<id>
         * 注入脚本；此前放在 super 之后调 bridge.registerPlugin 只进了运行时 map、没进注入脚本，
         * JS 侧 Plugins.Biometric 恒 undefined → 黄级确认卡守卫静默跳过（队长双机实测复现）。
         * registerPlugin(Class)（BridgeActivity 方法）进 bridgeBuilder，桥构建时合并——双端可见。 */
        registerPlugin(BiometricPlugin.class);
        /* 第七十二轮：应用内检查更新（getInfo/download/install）——同铁律：必须 super 之前注册 */
        registerPlugin(UpdatePlugin.class);
        /* 第七十四轮：后台通知服务的 JS↔原生共享面（token 同步/已读基准合并） */
        registerPlugin(NativeBridgePlugin.class);
        micPermLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            granted -> {
                PermissionRequest req = pendingMicWebRequest;
                pendingMicWebRequest = null;
                if (req == null) return;
                if (!granted.containsValue(false)) {
                    try { req.grant(req.getResources()); } catch (IllegalStateException ignored) { /* 已处理 */ }
                } else {
                    try { req.deny(); } catch (IllegalStateException ignored) { /* 已处理 */ }
                }
            });
        super.onCreate(savedInstanceState);
        Bridge bridge = this.getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.setWebViewClient(new MpaWebViewClient(bridge));
            /* 第一百零二轮：键盘/系统栏 insets 统一接管（修复"键盘唤起后输入框跑出屏幕"）。
             *
             * 根因：Capacitor SystemBars 插件在 WebView≥140 + viewport-fit=cover 的 passthrough 路径里，
             * 键盘弹出时仍把 DecorView 底部 pad 掉 IME 高度（窗口变矮）；而 Chromium 140+ 同时把键盘
             * 计入 env(safe-area-inset-bottom) 并自行滚动可视视口——双重让位过冲，焦点输入框（尤其
             * position:fixed 弹窗内）被顶出屏幕。前端 CSS 全部使用原生 env(safe-area-inset-*)，
             * 已具备切换到纯 Chromium 原生让位的条件，故 capacitor.config 里 SystemBars.insetsHandling=disable。
             *
             * 本接管（装在 DecorView，SystemBars 已禁用无槽位冲突）：
             *  - WebView 主版本 ≥144（safe-area 含 IME 的正确上报起点）：不 pad——系统栏与键盘
             *    全部交给 Chromium env()（与 Chrome 浏览器同路径，单一位移，fixed 弹窗/底部输入条
             *    用 env() 自然上移）；
             *  - <144 旧 WebView：复刻传统行为（DecorView pad 系统栏；键盘可见时 pad IME 高度）——
             *    窗口级单一 resize，历史上无顶飞问题；env() 在旧内核不上报，无双重让位。
             * 全版本显式 setDecorFitsSystemWindows(false)：edge-to-edge 语义统一（targetSdk 36 强制，
             * 旧系统显式声明），保证 insets 原始值可靠到达本 listener。 */
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            View decor = getWindow().getDecorView();
            ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
                boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
                if (webViewMajor() >= 144) {
                    /* Chromium 原生让位：DecorView 不 pad，insets 原样下发给 WebView——
                     * Chromium 据此计算 env(safe-area-inset-*)（含 IME），键盘弹出时自行
                     * 滚动可视视口（单一位移，与 Chrome 浏览器同路径）。 */
                    v.setPadding(0, 0, 0, 0);
                    return insets;
                }
                /* 旧 WebView：DecorView pad 系统栏/键盘（窗口级 resize）；把 systemBars 归零后
                 * 下发，防止 Chromium 再把系统栏计入 env() 造成双重让位（与 Capacitor 传统
                 * 非 passthrough 路径同构）。 */
                Insets sb = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                v.setPadding(sb.left, sb.top, sb.right, imeVisible ? ime.bottom : sb.bottom);
                WindowInsetsCompat zeroed = new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.of(0, 0, 0, 0))
                    .build();
                return zeroed;
            });
            /* 麦克风 getUserMedia：确定性放行（第六十轮，修复"系统已允许仍 NotAllowedError"）。
             * 继承 BridgeWebChromeClient——JS 对话框/文件选择器等其余行为全部保留。 */
            bridge.getWebView().setWebChromeClient(new MicWebChromeClient(bridge));
            /* 第六十二轮：插件 load() 每次启动自建 id="default" 的 Default 通道（App Info 的
             * Notification Categories 里多出无用类别）——我们的通知全部走五类专属通道，启动即删。
             * 系统面类别只保留：转账/安全/理财/任务/系统（名称按手机语言，见 notify.js ensureChannels）。 */
            try {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.deleteNotificationChannel("default");
            } catch (Throwable ignored) { /* 低于 Android 8 无通道概念 */ }
            /* 返回键/手势全接管：OnBackPressedDispatcher（AppCompat 1.7 桥接 predictive back，
             * Android 16 真机预测性返回与传统返回两种模式下回调均可达） */
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    handleBack(bridge);
                }
            });
        }
        /* 场景①（第六十六轮）：冷启动/进程重建一律上锁（WebView 资产本地秒载，覆盖层之下已就绪） */
        showLock();
    }

    /* ===== 场景②：后台>60s 回前台重锁 ===== */
    @Override
    public void onPause() {
        super.onPause();
        if (!bioPromptActive) pausedAtMs = SystemClock.elapsedRealtime();
        /* 第七十四轮：后台通知服务——离开前台且有登录态即启动（WebView 后台定时器暂停，
         * 通知只能原生轮询）；回前台即停（前台由 web 端 30s 轮询负责）。 */
        try {
            if (NativeBridgePlugin.hasToken(this)) {
                androidx.core.content.ContextCompat.startForegroundService(
                    this, new android.content.Intent(this, NotifyService.class));
            }
        } catch (Throwable ignored) { /* 受限环境启动失败不致崩 */ }
    }

    @Override
    public void onResume() {
        super.onResume();
        try { stopService(new android.content.Intent(this, NotifyService.class)); } catch (Throwable ignored) {}
        long was = pausedAtMs;
        pausedAtMs = 0L;
        if (!bioPromptActive && lockView == null && was > 0
            && SystemClock.elapsedRealtime() - was > RELOCK_AFTER_MS) {
            showLock();
        }
    }

    /** 原生全屏锁屏覆盖层（navy 品牌底 + Suveoo 字标 + 副文案 + 解锁按钮），显示即自动验证一次 */
    private void showLock() {
        if (lockView != null) return;
        if (BiometricManager.from(this).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            != BiometricManager.BIOMETRIC_SUCCESS) {
            return; /* 未登记任何生物识别/锁屏凭据：不上锁（增强不设门槛） */
        }
        ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(0xFF1E2A78);

        TextView brand = new TextView(this);
        brand.setText("Suveoo");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(34);
        brand.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        TextView sub = new TextView(this);
        sub.setText(getString(R.string.lock_subtitle));
        sub.setTextColor(0xB3FFFFFF);
        sub.setTextSize(15);
        sub.setPadding(0, dp(8), 0, 0);
        Button btn = new Button(this);
        btn.setText(getString(R.string.lock_unlock));
        btn.setTextColor(Color.WHITE);
        btn.setBackgroundColor(0x33FFFFFF);
        btn.setPadding(dp(28), dp(10), dp(28), dp(10));
        btn.setOnClickListener(v -> bioAuthenticate());

        LinearLayout.LayoutParams wrap = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        box.addView(brand, wrap);
        box.addView(sub, wrap);
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = dp(32);
        box.addView(btn, btnLp);

        root.addView(box, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        lockView = box;
        bioAuthenticate();
    }

    private void removeLock() {
        if (lockView == null) return;
        ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
        root.removeView(lockView);
        lockView = null;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /** WebView 主版本（判定 Chromium 是否具备"safe-area 含 IME"的原生让位能力，阈值 144）。
     *  取当前 WebView 提供方包（Google/华为/AOSP 三家兜底）的 versionName 首段；取不到按 0（走传统 pad 分支）。 */
    private int webViewMajor() {
        if (webViewMajorCached != null) return webViewMajorCached;
        int major = 0;
        String[] pkgs = { "com.google.android.webview", "com.android.webview", "com.huawei.webview" };
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            for (String pn : pkgs) {
                try {
                    PackageInfo pi = pm.getPackageInfo(pn, 0);
                    if (pi.versionName != null) {
                        major = Integer.parseInt(pi.versionName.split("\\.")[0]);
                        break;
                    }
                } catch (Exception ignored) { /* 该提供方不存在，试下一家 */ }
            }
        } catch (Throwable ignored) { }
        webViewMajorCached = major;
        return major;
    }
    private Integer webViewMajorCached = null;

    /** 弹系统 BiometricPrompt（指纹/面部/设备密码均可）；成功移除覆盖层，取消/失败留在覆盖层待重试 */
    private void bioAuthenticate() {
        Executor ex = ContextCompat.getMainExecutor(this);
        bioPromptActive = true;
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Suveoo")
            .setSubtitle(getString(R.string.bio_prompt_sub))
            .setDeviceCredentialAllowed(true)
            .build();
        new BiometricPrompt(this, ex, new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                bioPromptActive = false;
                removeLock();
            }
            @Override public void onAuthenticationError(int code, CharSequence errString) {
                bioPromptActive = false;
                /* 用户取消/超时：覆盖层保留，点"解锁"重试 */
            }
        }).authenticate(info);
    }

    /** 返回键统一入口：先问 JS（浮层/AI 特殊态），未消费则历史回退，栈底双击退出 */
    private void handleBack(Bridge bridge) {
        WebView w = bridge.getWebView();
        w.evaluateJavascript("(window.__suveooBack ? window.__suveooBack() : false)", result -> {
            if (Boolean.parseBoolean(result)) return; /* sc:9-26 JS 已消费（关浮层/停流/清输入等） */
            if (w.canGoBack()) { w.goBack(); return; } /* sc:1-7 页面级返回 */
            exitTwice(); /* sc:27/28 */
        });
    }

    /** sc:27/28 再按一次退出：2 秒窗口内第二次返回才 finish；Toast 只在栈底出现（有浮层时到不了这里） */
    private void exitTwice() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastBackAt < 2000L) { finish(); return; }
        lastBackAt = now;
        Toast.makeText(this, getString(R.string.back_exit), Toast.LENGTH_SHORT).show();
    }

    /**
     * 麦克风 WebView 权限（第六十轮）。原病灶：Capacitor BridgeWebChromeClient 对
     * AUDIO_CAPTURE 请求 [MODIFY_AUDIO_SETTINGS, RECORD_AUDIO] 且"任一 false 即 deny"
     * —— MODIFY_AUDIO_SETTINGS 未在 manifest 声明时系统对该项直接返回拒绝（无弹窗），
     * 用户在系统弹窗点了"允许"也恒 NotAllowedError。现 manifest 已补声明；本类再上双保险：
     * 原生权限已授予 → 免对话框免 ActivityResult 往返直接 grant（第二次点击起零延迟）；
     * 未授予 → 走本类独立 launcher（不与 Capacitor 共享 permissionListener 单槽竞争）。
     * 仅接管 AUDIO_CAPTURE；其余资源（相机等）原样交给父类默认逻辑。
     */
    private class MicWebChromeClient extends BridgeWebChromeClient {
        MicWebChromeClient(Bridge bridge) { super(bridge); }
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            List<String> resources = Arrays.asList(request.getResources());
            if (!resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                super.onPermissionRequest(request);
                return;
            }
            boolean micGranted = ContextCompat.checkSelfPermission(getApplicationContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(getApplicationContext(), Manifest.permission.MODIFY_AUDIO_SETTINGS) == PackageManager.PERMISSION_GRANTED;
            if (micGranted) {
                runOnUiThread(() -> {
                    try { request.grant(request.getResources()); } catch (IllegalStateException ignored) { /* 已处理 */ }
                });
                return;
            }
            pendingMicWebRequest = request;
            micPermLauncher.launch(new String[]{ Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS });
        }
    }

    static class MpaWebViewClient extends BridgeWebViewClient {
        private final Bridge bridge;
        private final AssetManager assets;
        /* 目录路由缓存（path → asset 或 ""表示无解）；APK 内资产不可变，可安全常驻 */
        private final Map<String, String> routeCache = new ConcurrentHashMap<>();

        MpaWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
            this.assets = bridge.getContext().getAssets();
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (bridge.getServerUrl() == null
                    && "https".equals(url.getScheme())
                    && "localhost".equalsIgnoreCase(url.getHost())) {
                String path = url.getPath();
                if (path == null || path.isEmpty()) path = "/";
                String last = url.getLastPathSegment();
                boolean hasExt = last != null && last.indexOf('.') >= 0;
                /* 只接管目录形路径；/api/ 前缀永不返回 HTML（防兜底页污染 JSON 调用方） */
                if (!hasExt && !path.startsWith("/api/")) {
                    String asset = resolveIndex(path);
                    if (asset != null) {
                        try {
                            InputStream is = bridge.getLocalServer().getJavaScriptInjectedStream(assets.open(asset));
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "no-cache");
                            return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers, is);
                        } catch (IOException ignored) {
                            /* 打开失败回落 Capacitor 默认处理 */
                        }
                    }
                }
            }
            return super.shouldInterceptRequest(view, request);
        }

        /**
         * /account → public/account/index.html；逐级向上回退最近存在的 index.html
         * （/ai/s/{sid} 动态会话 URL → public/ai/index.html，URL 原样保留供前端解析 sid）。
         *
         * 第五十二轮：动态 slug 在路径中间时（/account/card/{slug}/settings），
         * 逐级上回会跳过模板页（account/card/settings/index.html）落到 /account/index.html。
         * 新增"跳过中间段"pass：对每个中间段，尝试去掉它并拼接父路径+尾段，
         * 若存在 index.html 则命中（去掉 debit-card-1 → /account/card/settings → 命中）。
         */
        private String resolveIndex(String path) {
            String cached = routeCache.get(path);
            if (cached != null) return cached.isEmpty() ? null : cached;
            String resolved = null;

            /* Pass 1：精确匹配 */
            if (assetExists("public" + withSlash(path) + "index.html")) {
                resolved = "public" + withSlash(path) + "index.html";
            }

            /* Pass 2：跳过中间段（动态 slug）：去掉第 i 段，拼接前缀+后缀 */
            if (resolved == null) {
                String[] segs = path.replaceAll("^/+", "").replaceAll("/+$", "").split("/");
                for (int skip = 0; skip < segs.length - 1 && resolved == null; skip++) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < segs.length; i++) {
                        if (i == skip) continue; /* 跳过这一段 */
                        if (sb.length() > 0) sb.append('/');
                        sb.append(segs[i]);
                    }
                    String candidate = "public/" + sb + "/index.html";
                    if (assetExists(candidate)) {
                        resolved = candidate;
                        break;
                    }
                }
            }

            /* Pass 3：逐级上回（/ai/s/{sid} → /ai；兜底 / → index.html） */
            if (resolved == null) {
                String p = path;
                while (true) {
                    if (assetExists("public" + withSlash(p) + "index.html")) {
                        resolved = "public" + withSlash(p) + "index.html";
                        break;
                    }
                    int cut = p.lastIndexOf('/');
                    if (cut <= 0) {
                        if (assetExists("public/index.html")) resolved = "public/index.html";
                        break;
                    }
                    p = p.substring(0, cut);
                }
            }

            routeCache.put(path, resolved == null ? "" : resolved);
            return resolved;
        }

        private String withSlash(String p) {
            return p.endsWith("/") ? p : p + "/";
        }

        private boolean assetExists(String asset) {
            try (InputStream is = assets.open(asset)) {
                return true;
            } catch (IOException e) {
                return false;
            }
        }
    }
}
