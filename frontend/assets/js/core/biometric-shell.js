/* biometric-shell.js — Android 壳内生物识别（第六十六轮，场景③会话过期快捷重登）。
 * 仅由 build-apk.mjs 注入 APK 产物（Web HTML 不引用 → 网页版零加载零影响）。
 *
 * 链路：登录成功（含 2FA 完成后）→ 插件以 Android Keystore「须本人验证」密钥加密存凭据；
 * 登录页且无会话 → 自动发起指纹解密 → 走正常 /api/auth/login（服务端零改动、不改任何会话语义）；
 * 2FA 账户 → 解密成功后只预填账号密码并提示继续两步验证（不绕过第二因子——边界约定）；
 * 手动登出 → 清除存档（下次不再自动快捷登录）；密码变更导致登录失败 → 自动清除并提示重登。 */
(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Biometric) return;
  const Bio = window.Capacitor.Plugins.Biometric;
  const of = window.fetch;
  const loginUrl = () => (window.S && S.api && S.api.base ? S.api.base : "") + "/api/auth/login";
  const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
  const toast = (m, e) => { try { S.ui.toast(m, e); } catch { /* 页面早期无 UI 忽略 */ } };

  /* —— 登录/登出拦截：成功存档、登出清除、凭据失效自愈 ——
     2FA 两步：第一步 /api/auth/login 只回 mfa_required（不存档，记住凭据）；
     第二步 /api/auth/mfa 成功回 token 时用第一步记住的凭据存档。 */
  let pendingCreds = null;
  window.fetch = async (...a) => {
    const input = a[0], init = a[1] || {};
    let body = null;
    try {
      if (String(input).includes("/api/auth/login") && typeof init.body === "string") body = JSON.parse(init.body);
    } catch { /* 非本插件发起的畸形体忽略 */ }
    if (body && body.identifier && body.password) pendingCreds = { email: String(body.identifier), password: String(body.password) };
    const res = await of(...a);
    try {
      const url = String(input);
      if (res.ok && (url.includes("/api/auth/login") || url.includes("/api/auth/mfa"))) {
        const j = await res.clone().json().catch(() => null);
        if (j && j.token && pendingCreds) {
          const c = pendingCreds;
          pendingCreds = null;
          Bio.storeCredentials(c).catch(() => {});
        }
      }
      if (url.includes("/api/auth/logout") && res.ok) { pendingCreds = null; Bio.clearCredentials().catch(() => {}); }
      if (body && !res.ok && url.includes("/api/auth/login")) {
        const j = await res.clone().json().catch(() => null);
        const c = String(j?.error?.code ?? "");
        if (/PASSWORD|CREDENTIAL/.test(c)) {
          pendingCreds = null;
          Bio.clearCredentials().catch(() => {});
          toast(t("bio.credsChanged", "已保存的登录信息已失效，请重新登录"), true);
        }
      }
    } catch { /* 拦截层任何异常不影响原请求 */ }
    return res;
  };

  /* —— 登录页自动快捷登录 —— */
  const quickLogin = async () => {
    let creds;
    try { creds = await Bio.quickLogin(); } catch { return false; } /* 取消/无档/解密失败 */
    if (!creds || !creds.email) return false;
    try {
      const res = await of(loginUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: creds.email, password: creds.password }),
      });
      const j = await res.json().catch(() => null);
      if (j && j.token) {
        localStorage.setItem("suveoo_token", j.token);
        const next = new URLSearchParams(location.search).get("next");
        location.replace(next || "/home");
        return true;
      }
      if (j && j.mfa_required) {
        /* 2FA 账户（边界）：指纹只做预填便利，两步验证一步不少 */
        const e = document.getElementById("l-id"), p = document.getElementById("l-pw");
        if (e) e.value = creds.email;
        if (p) p.value = creds.password;
        toast(t("bio.prefilled", "已验证并填好账号密码，请继续两步验证"));
        return true;
      }
      const c = String(j?.error?.code ?? "");
      if (/PASSWORD|CREDENTIAL/.test(c)) {
        Bio.clearCredentials().catch(() => {});
        toast(t("bio.credsChanged", "已保存的登录信息已失效，请重新登录"), true);
      }
    } catch { /* 网络异常：留在登录页手动登录 */ }
    return false;
  };

  const boot = async () => {
    try {
      if (!location.pathname.startsWith("/account/login")) return;
      if (localStorage.getItem("suveoo_token")) return;
      const st = await Bio.isAvailable().catch(() => null);
      if (st && st.hasStored) {
        setTimeout(() => { if (!localStorage.getItem("suveoo_token")) quickLogin(); }, 600);
      }
    } catch { /* 插件异常静默——完整登录永远可用 */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
