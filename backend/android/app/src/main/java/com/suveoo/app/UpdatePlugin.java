package com.suveoo.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * UpdatePlugin — 应用内检查更新（第七十二轮）：壳内「我的账户→偏好→检查更新」的原生支点。
 * ① getInfo：PackageManager 读 versionCode/versionName（不依赖 BuildConfig 开关）；
 * ② download：流式下载 APK 至 cacheDir/updates/（受既有 fileprovider 的 cache-path 覆盖），
 *    进度经 notifyListeners("update-progress") 每 ≥200ms 推送（percent/bytes/total），
 *    canceled 标志可中断（断点删除半成品）；
 * ③ install：FileProvider URI + ACTION_VIEW 唤起系统安装器；Android 8+ 未获
 *    「安装未知应用」授权时先跳该 App 的授权设置页（reject NEED_INSTALL_PERM，JS 引导重试）。
 * URL 安全校验：仅 https 且 host 必须等于 suveoo.com（拒绝 localhost/环回/私网变体）。
 * 线程约定：resolve/reject 一律 post 主线程（下载在工作线程）。 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {
    private volatile boolean canceled = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject o = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode);
            o.put("versionName", pi.versionName == null ? "" : pi.versionName);
        } catch (Exception e) {
            o.put("versionCode", -1);
            o.put("versionName", "");
        }
        JSObject fin = o;
        main.post(() -> call.resolve(fin));
    }

    /** 仅放行 https://suveoo.com（更新包固定走自家域；拒绝环回/私网/其他 host） */
    private boolean urlAllowed(String raw) {
        try {
            URL u = new URL(raw);
            if (!"https".equals(u.getProtocol())) return false;
            String h = u.getHost();
            if (h == null || h.isEmpty()) return false;
            String hl = h.toLowerCase();
            if (!hl.equals("suveoo.com") && !hl.equals("www.suveoo.com")) return false;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (url.isEmpty()) { main.post(() -> call.reject("MISSING_URL")); return; }
        if (!urlAllowed(url)) { main.post(() -> call.reject("BAD_URL")); return; }
        canceled = false;
        new Thread(() -> {
            File outFile = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                outFile = new File(dir, "suveoo-update.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("accept", "application/vnd.android.package-archive, application/octet-stream, */*");
                int status = c.getResponseCode();
                if (status != 200 && status != 206) { c.disconnect(); throw new IllegalStateException("HTTP " + status); }
                long total = c.getContentLengthLong();
                InputStream in = c.getInputStream();
                FileOutputStream out = new FileOutputStream(outFile);
                byte[] buf = new byte[16384];
                long done = 0, lastEmit = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (canceled) {
                        try { out.close(); in.close(); } catch (Exception ignore) {}
                        c.disconnect();
                        outFile.delete();
                        final File f = outFile;
                        main.post(() -> call.reject("CANCELED"));
                        return;
                    }
                    out.write(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 200) { /* ≥200ms 一帧：UI 平滑且不刷屏 */
                        lastEmit = now;
                        JSObject p = new JSObject();
                        p.put("bytes", done);
                        p.put("total", total);
                        p.put("percent", total > 0 ? (int) Math.min(100, done * 100 / total) : -1);
                        notifyListeners("update-progress", p);
                    }
                }
                out.flush();
                out.close();
                in.close();
                c.disconnect();
                if (total > 0 && done != total) { outFile.delete(); throw new IllegalStateException("TRUNCATED"); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", outFile);
                JSObject r = new JSObject();
                r.put("fileUri", uri.toString());
                r.put("bytes", done);
                main.post(() -> call.resolve(r));
            } catch (Exception e) {
                if (outFile != null) outFile.delete();
                final String msg = "DL_FAIL:" + e.getMessage();
                main.post(() -> call.reject(msg));
            }
        }).start();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        canceled = true;
        main.post(() -> call.resolve(new JSObject()));
    }

    @PluginMethod
    public void install(PluginCall call) {
        String fileUri = call.getString("fileUri", "");
        if (fileUri.isEmpty()) { main.post(() -> call.reject("MISSING_URI")); return; }
        try {
            if (Build.VERSION.SDK_INT >= 26
                && getActivity() != null
                && !getActivity().getPackageManager().canRequestPackageInstalls()) {
                /* 首次安装：引导到本 App 的「安装未知应用」授权页；用户授权后返回重试 */
                Intent s = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(s);
                main.post(() -> call.reject("NEED_INSTALL_PERM"));
                return;
            }
            Uri uri = Uri.parse(fileUri);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            main.post(() -> call.resolve(new JSObject()));
        } catch (ActivityNotFoundException e) {
            main.post(() -> call.reject("NO_INSTALLER"));
        } catch (Exception e) {
            final String msg = "INSTALL_FAIL:" + e.getMessage();
            main.post(() -> call.reject(msg));
        }
    }
}
