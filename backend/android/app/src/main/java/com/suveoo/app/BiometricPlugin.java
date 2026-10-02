package com.suveoo.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 第六十六轮：生物识别插件（仅 Android 壳，Web 零感知）。
 *
 * 三类能力：
 * ① verify()：无密码学绑定的一次性在场校验（黄级确认卡执行前调用；指纹/面部/设备密码均可）。
 *    设备未登记任何生物识别/凭据时返回 skipped:true（JS 放行——生物识别是增强而非门槛，绝不因
 *    其缺失阻断业务；插件异常同样放行，可用性优先）。
 * ② storeCredentials/quickLogin()：登录凭据用 Android Keystore「须本人验证才能用」的 AES/GCM
 *    密钥加密存本机（SharedPreferences 仅存密文+IV）；quickLogin 验证通过后解密回传，JS 走正常
 *    /api/auth/login——服务端零改动，红级邮件 OTP 不受影响（叠加不替换）。
 * ③ clearCredentials()：登出/密码变更时清除（手动登出后不再自动快捷登录）。
 *
 * 场景③解密要求 BIOMETRIC_STRONG（或 API 30+ 设备凭据）；不支持时 JS 收 NO_STRONG 回落完整登录。
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    private static final String KEY_ALIAS = "suveoo_bio_key";
    private static final String PREFS = "suveoo_bio";
    private static final String PREF_CT = "creds_ct";
    private static final String PREF_IV = "creds_iv";

    /* ---------- 可用性 ---------- */

    private int canAuthWeak() {
        return BiometricManager.from(getContext()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
    }

    /** 凭据加解密须 STRONG 指纹或（API 30+）设备凭据——弱生物（如仅 2D 面部）不绑定 CryptoObject */
    private boolean canAuthStrong() {
        int s = BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (s == BiometricManager.BIOMETRIC_SUCCESS) return true;
        return Build.VERSION.SDK_INT >= 30 && BiometricManager.from(getContext()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", canAuthWeak() == BiometricManager.BIOMETRIC_SUCCESS);
        o.put("strong", canAuthStrong());
        o.put("hasStored", hasStored());
        call.resolve(o);
    }

    /* ---------- ① 在场校验（黄级确认卡） ---------- */

    @PluginMethod
    public void verify(PluginCall call) {
        Activity act = getActivity();
        if (canAuthWeak() != BiometricManager.BIOMETRIC_SUCCESS || !(act instanceof FragmentActivity)) {
            JSObject skip = new JSObject();
            skip.put("ok", true);
            skip.put("skipped", true); // 无生物识别/无凭据/宿主异常：放行（增强不设门槛）
            call.resolve(skip);
            return;
        }
        Executor ex = ContextCompat.getMainExecutor(getContext());
        act.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Suveoo")
                .setSubtitle(act.getString(R.string.bio_prompt_sub))
                .setDeviceCredentialAllowed(true)
                .build();
            new BiometricPrompt((FragmentActivity) act, ex, new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject o = new JSObject();
                    o.put("ok", true);
                    call.resolve(o);
                }
                @Override public void onAuthenticationError(int code, CharSequence errString) {
                    JSObject o = new JSObject();
                    o.put("ok", false);
                    o.put("code", code);
                    call.resolve(o);
                }
            }).authenticate(info);
        });
    }

    /* ---------- ② 凭据加密存取（Keystore 绑定密钥） ---------- */

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private boolean hasStored() { return prefs().contains(PREF_CT) && prefs().contains(PREF_IV); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        SecretKey k = (SecretKey) ks.getKey(KEY_ALIAS, null);
        if (k != null) return k;
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true); // 每次使用须本人验证（默认有效期 -1）
        if (Build.VERSION.SDK_INT >= 30) {
            b.setUserAuthenticationParameters(0,
                KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        }
        kg.init(b.build());
        kg.generateKey();
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    /** 在场验证（CryptoObject）后回调 use(cipher)——cipher 由 onAuthenticationSucceeded 返回（已绑定本次验证） */
    private void withCryptoCipher(int mode, PluginCall call, java.util.function.Consumer<Cipher> use) {
        Activity act = getActivity();
        if (!(act instanceof FragmentActivity)) { call.reject("NO_ACTIVITY"); return; }
        if (!canAuthStrong()) { call.reject("NO_STRONG"); return; }
        try {
            SecretKey k = key();
            final Cipher cipher;
            if (mode == Cipher.ENCRYPT_MODE) {
                cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, k);
            } else {
                byte[] iv = Base64.decode(prefs().getString(PREF_IV, ""), Base64.NO_WRAP);
                cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, iv));
            }
            Executor ex = ContextCompat.getMainExecutor(getContext());
            act.runOnUiThread(() -> {
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Suveoo")
                    .setSubtitle(act.getString(R.string.bio_prompt_sub))
                    .setDeviceCredentialAllowed(true)
                    .build();
                new BiometricPrompt((FragmentActivity) act, ex, new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        try {
                            BiometricPrompt.CryptoObject co = result.getCryptoObject();
                            Cipher c = co != null ? co.getCipher() : cipher;
                            if (mode == Cipher.DECRYPT_MODE) c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(prefs().getString(PREF_IV, ""), Base64.NO_WRAP)));
                            use.accept(c);
                        } catch (Exception e) { call.reject("CIPHER_FAIL:" + e.getMessage()); }
                    }
                    @Override public void onAuthenticationError(int code, CharSequence errString) {
                        call.reject("AUTH_CANCEL:" + code);
                    }
                }).authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            });
        } catch (Exception e) {
            call.reject("KEY_FAIL:" + e.getMessage());
        }
    }

    @PluginMethod
    public void storeCredentials(PluginCall call) {
        String email = call.getString("email", "");
        String password = call.getString("password", "");
        if (email.isEmpty() || password.isEmpty()) { call.reject("MISSING"); return; }
        withCryptoCipher(Cipher.ENCRYPT_MODE, call, cipher -> {
            try {
                byte[] ct = cipher.doFinal((email + "\n" + password).getBytes(StandardCharsets.UTF_8));
                prefs().edit()
                    .putString(PREF_CT, Base64.encodeToString(ct, Base64.NO_WRAP))
                    .putString(PREF_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
                call.resolve(new JSObject());
            } catch (Exception e) { call.reject("ENC_FAIL:" + e.getMessage()); }
        });
    }

    @PluginMethod
    public void quickLogin(PluginCall call) {
        if (!hasStored()) { call.reject("NO_CREDS"); return; }
        withCryptoCipher(Cipher.DECRYPT_MODE, call, cipher -> {
            try {
                byte[] ct = Base64.decode(prefs().getString(PREF_CT, ""), Base64.NO_WRAP);
                String plain = new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
                int i = plain.indexOf('\n');
                if (i <= 0) { call.reject("BAD_FORMAT"); return; }
                JSObject o = new JSObject();
                o.put("email", plain.substring(0, i));
                o.put("password", plain.substring(i + 1));
                call.resolve(o);
            } catch (Exception e) {
                /* 密文损坏/密钥失效（如清除凭据后重录）——自愈式清除并上报明确语义 */
                prefs().edit().remove(PREF_CT).remove(PREF_IV).apply();
                call.reject("DEC_FAIL");
            }
        });
    }

    @PluginMethod
    public void clearCredentials(PluginCall call) {
        prefs().edit().remove(PREF_CT).remove(PREF_IV).apply();
        call.resolve(new JSObject());
    }
}
