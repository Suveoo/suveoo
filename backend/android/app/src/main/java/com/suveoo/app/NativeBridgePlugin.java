package com.suveoo.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NativeBridgePlugin — JS ↔ 原生轻量共享（第七十四轮，后台通知服务配套）。
 * WebView localStorage 原生层读不到，本插件用 SharedPreferences 作两侧最小共享面：
 * ① saveToken：登录态 token 同步（notify.js 每轮刷新；MainActivity.onPause 时若有 token
 *    即启动 NotifyService 前台轮询——后台期间 WebView 定时器暂停，通知只能原生发）；
 *    空 token=清除（登出/过期，服务侧 401 也会自停自清）。
 * ② getSyncState：服务的已读基准 svc_seen——web 回前台后与之合并（后台已弹过的通知
 *    不再重弹；本地通知同 id=服务器 id，覆盖语义天然去重）。 */
@CapacitorPlugin(name = "NativeBridge")
public class NativeBridgePlugin extends Plugin {
    static final String PREFS = "suveoo_native";
    static final String K_TOKEN = "token";
    static final String K_SEEN = "svc_seen";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean hasToken(Context c) {
        String t = prefs(c).getString(K_TOKEN, null);
        return t != null && !t.isEmpty();
    }

    @PluginMethod
    public void saveToken(PluginCall call) {
        String t = call.getString("token", "");
        SharedPreferences.Editor e = prefs(getContext()).edit();
        if (t == null || t.isEmpty()) e.remove(K_TOKEN);
        else e.putString(K_TOKEN, t);
        e.apply();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void getSyncState(PluginCall call) {
        JSObject o = new JSObject();
        o.put("seenId", prefs(getContext()).getLong(K_SEEN, 0));
        call.resolve(o);
    }
}
