package com.suveoo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * NotifyService — 前台轮询通知服务（第七十四轮，根治「后台收不到通知」）。
 * 背景：通知为 30s 轮询制（notify.js），Android WebView 在后台时 JS 定时器暂停 → 轮询停止
 * → 后台期间零通知；回前台（解锁）后轮询恢复、积压齐弹（队长实测：后台有人转账永远收不到）。
 * 本服务由 MainActivity.onPause（有 token 时）启动、onResume 停止，期间每 60s 拉最近通知，
 * 新未读按类别偏好弹系统通知：
 *  - 本地通知 id=服务器通知 id（与 web 端 notify.js 完全一致 → 同 id 覆盖，双端天然去重）；
 *  - channelId 与 web 端 ensureChannels 同五类（transfers/security/wealth/tasks/general），
 *    服务侧幂等重建（用户系统级通道设置保持）；
 *  - 偏好尊重：GET /api/notifications/prefs 缓存 5 分钟，关闭的类别不弹（与 web 同语义）；
 *  - 401/403 → 自停并清 token+svc_seen（未登录=零通知隐私律，与 web poll 行为一致）；
 *  - svc_seen 基准经 NativeBridge.getSyncState 供 web 回前台合并（后台已弹的不重弹）。
 * 常驻前台通知走独立低优先级通道 svc（无声，不扰）。 */
public class NotifyService extends Service {
    private static final long POLL_MS = 60_000L;
    private static final String BASE = "https://suveoo.com";
    private static final String SVC_CHANNEL = "svc";
    private static final int FG_ID = 900001;

    private final Handler h = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private volatile boolean running = false;
    /* 类别 → 通道映射（与 notify.js META 同源） */
    private static String chanOf(String type) {
        switch (type == null ? "" : type) {
            case "TRANSFER": return "transfers";
            case "SECURITY": return "security";
            case "WEALTH": return "wealth";
            case "TASK": return "tasks";
            default: return "general";
        }
    }

    private static int importanceOf(String chan) {
        switch (chan) {
            case "security": return 5;
            case "transfers": case "wealth": return 4;
            default: return 3;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = NativeBridgePlugin.prefs(this);
        createChannels();
        Notification fg = buildFg();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(FG_ID, fg, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(FG_ID, fg);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        pollOnce(); /* 立即首轮，随后 60s 循环 */
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() { running = false; h.removeCallbacksAndMessages(null); super.onDestroy(); }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* 单链调度：pollOnce 的每条完成路径各自 scheduleNext 一次（网络线程里调），
     * loop 仅作为延迟目标——绝不在 loop 内再 postDelayed（曾致双链轮询加速 bug） */
    private final Runnable loop = new Runnable() {
        @Override public void run() { if (running) pollOnce(); }
    };

    private void pollOnce() {
        final String token = prefs.getString(NativeBridgePlugin.K_TOKEN, null);
        if (token == null || token.isEmpty()) { stopSelf(); return; }
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/notifications?cursor=0").openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(20000);
                c.setRequestProperty("authorization", "Bearer " + token);
                int code = c.getResponseCode();
                if (code == 401 || code == 403) { /* 会话过期：自停+清档（隐私律） */
                    prefs.edit().remove(NativeBridgePlugin.K_TOKEN).remove(NativeBridgePlugin.K_SEEN).apply();
                    stopSelf();
                    return;
                }
                if (code != 200) { scheduleNext(); return; }
                String body = readAll(c.getInputStream());
                c.disconnect();
                handleFeed(body, token);
            } catch (Exception e) {
                scheduleNext(); /* 网络异常：下轮再试 */
            }
        }).start();
    }

    private void scheduleNext() { h.postDelayed(loop, POLL_MS); }

    private void handleFeed(String body, String token) {
        try {
            JSONObject root = new JSONObject(body);
            JSONArray arr = root.optJSONArray("notifications");
            if (arr == null || arr.length() == 0) { scheduleNext(); return; }
            long latest = arr.getJSONObject(0).optLong("id", 0);
            long seen = prefs.getLong(NativeBridgePlugin.K_SEEN, 0);
            if (seen <= 0) { /* 首轮只记基准（与 web poll 语义一致，不回放积压） */
                prefs.edit().putLong(NativeBridgePlugin.K_SEEN, latest).apply();
                scheduleNext();
                return;
            }
            int fired = 0;
            for (int i = 0; i < arr.length() && fired < 3; i++) { /* 同批最多 3 条防轰炸（与 web 同） */
                JSONObject n = arr.getJSONObject(i);
                long id = n.optLong("id", 0);
                if (id <= seen || n.optBoolean("read", false)) continue;
                String type = n.optString("type", "SYSTEM");
                if (prefOff(token, type)) continue;
                postOne((int) (id % 2147483647L), chanOf(type), n.optString("title", "Suveoo"), n.optString("body", ""));
                fired++;
            }
            prefs.edit().putLong(NativeBridgePlugin.K_SEEN, latest).apply();
        } catch (Exception ignore) {
            /* 解析异常忽略 */
        }
        scheduleNext();
    }

    /* 通知偏好（缓存 5 分钟）：{"WEALTH":false,...}；null/异常=全开 */
    private String prefsCache = "";
    private long prefsAt = 0;
    private boolean prefOff(String token, String type) {
        try {
            long now = System.currentTimeMillis();
            if (now - prefsAt > 300_000L || prefsCache == null) {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/notifications/prefs").openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setRequestProperty("authorization", "Bearer " + token);
                if (c.getResponseCode() == 200) {
                    JSONObject j = new JSONObject(readAll(c.getInputStream()));
                    JSONObject p = j.optJSONObject("prefs");
                    prefsCache = p == null ? "" : p.toString();
                } else prefsCache = "";
                prefsAt = now;
                c.disconnect();
            }
            if (prefsCache.isEmpty()) return false;
            JSONObject p = new JSONObject(prefsCache);
            return p.has(type) && !p.getBoolean(type);
        } catch (Exception e) {
            return false;
        }
    }

    private void postOne(int id, String chan, String title, String body) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, id, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification nb = new Notification.Builder(this, chan)
            .setSmallIcon(R.drawable.ic_stat_suveoo)
            .setColor(Color.parseColor("#1E2A78"))
            .setContentTitle(title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();
        nm.notify(id, nb);
    }

    private Notification buildFg() {
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, SVC_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_suveoo)
            .setColor(Color.parseColor("#1E2A78"))
            .setContentTitle(getString(R.string.svc_title))
            .setContentText(getString(R.string.svc_text))
            .setOngoing(true)
            .setContentIntent(pi)
            .build();
    }

    /* 与 web 端 ensureChannels 同五类（幂等重建；名称随系统语言资源）+ svc 常驻低优先级通道 */
    private void createChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        String[][] chans = {
            { "transfers", getString(R.string.ch_transfers), "4" },
            { "security", getString(R.string.ch_security), "5" },
            { "wealth", getString(R.string.ch_wealth), "4" },
            { "tasks", getString(R.string.ch_tasks), "3" },
            { "general", getString(R.string.ch_general), "3" },
            { SVC_CHANNEL, getString(R.string.ch_svc), "2" },
        };
        for (String[] ch : chans) {
            NotificationChannel nc = new NotificationChannel(ch[0], ch[1], Integer.parseInt(ch[2]));
            nc.setShowBadge(!SVC_CHANNEL.equals(ch[0]));
            nm.createNotificationChannel(nc);
        }
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }
}
