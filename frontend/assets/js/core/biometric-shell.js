/* biometric-shell.js — Android 壳内生物识别（第六十六轮场景③；第六十九轮徽标+hint；第七十一轮正规开通流程）。
 * 仅由 build-apk.mjs 注入 APK 产物（Web HTML 不引用 → 网页版零加载零影响）。
 *
 * 链路：登录成功（含 2FA 完成后）→ 【第七十一轮】显式询问"是否启用指纹快捷登录"再加密存凭据
 * （此前是无上下文静默 storeCredentials——弹出的 Keystore 指纹令人莫名其妙，一旦被忽略/取消
 * 凭据就没存上，自动登出后快捷登录静默失效，且已开通用户每次登录都被迫重验指纹）。
 * 启用 → 此刻弹指纹加密（用户已有预期）→ 成功 toast；暂不 → 记 declined 永不再问；
 * 已开通设备登录后不再重弹——凭据更新走自愈闭环（quickLogin 遇 PASSWORD 失败自动清档 →
 * 下次登录 hasStored=false → 重新询问开通）。
 * 登录页且无会话 → 有存档即自动发起指纹解密 → 走正常 /api/auth/login（服务端零改动）；
 * 2FA 账户 → 解密成功后只预填账号密码并提示继续两步验证（不绕过第二因子——边界约定）；
 * 手动登出 → 清除存档（下次不再自动快捷登录）；密码变更 → 自愈清除并重新询问。 */
(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Biometric) return;
  const Bio = window.Capacitor.Plugins.Biometric;
  const of = window.fetch;
  const loginUrl = () => (window.S && S.api && S.api.base ? S.api.base : "") + "/api/auth/login";
  const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
  const toast = (m, e) => { try { S.ui.toast(m, e); } catch { /* 页面早期无 UI 忽略 */ } };
  const DECLINE_KEY = "suveoo_bio_declined";

  /* —— 开通询问（第七十一轮）：登录成功后、跳转前阻塞式询问 —— */
  const askEnable = () => new Promise((resolve) => {
    let decided = false;
    const finish = (v) => { if (decided) return; decided = true; try { m.close(); } catch {} resolve(v); };
    const m = S.ui.modal(`
      <h3 style="font-size:17px">${S.fmt.escape(t("bio.enableTitle", "启用指纹快捷登录？"))}</h3>
      <p class="muted" style="font-size:13px;line-height:1.65;margin:10px 0 0">${S.fmt.escape(t("bio.enableBody", "会话过期后无需重输账号密码，验证指纹即可快捷回到 App。登录凭据仅以加密形式保存在本机。"))}</p>
      <div class="row" style="gap:10px;margin-top:18px">
        <button type="button" class="btn" id="bio-en-no" style="flex:1">${S.fmt.escape(t("bio.enableLater", "暂不"))}</button>
        <button type="button" class="btn btn-primary" id="bio-en-yes" style="flex:2">${S.fmt.escape(t("bio.enableNow", "立即启用"))}</button>
      </div>`, { onClose: () => finish(false) }); /* 点遮罩=暂不 */
    m.el.querySelector("#bio-en-yes").onclick = () => finish(true);
    m.el.querySelector("#bio-en-no").onclick = () => finish(false);
  });

  const maybeEnroll = async (creds) => {
    try {
      if (localStorage.getItem(DECLINE_KEY)) return; /* 曾明确拒绝：永不再问（清 App 数据可重置） */
      const st = await Bio.isAvailable().catch(() => null);
      if (!st || !st.strong) return; /* 加密凭据须 STRONG 传感器（弱传感器设备保持静默） */
      if (st.hasStored) return; /* 已开通：不重弹不重存——更新走 PASSWORD 自愈闭环 */
      if (!await askEnable()) { try { localStorage.setItem(DECLINE_KEY, "1"); } catch {} return; }
      try {
        await Bio.storeCredentials(creds); /* 用户已确认：此刻的 Keystore 指纹在预期内 */
        /* 自检（第七十三轮）：resolve 后立即复核存档确已落盘——历史上 storeCredentials 曾
           "指纹 UI 通过但密文未落盘"（reject 被吞），自检让这类失败当场可见 */
        const chk = await Bio.isAvailable().catch(() => null);
        if (chk && chk.hasStored) { toast(t("bio.enabled", "已启用指纹快捷登录")); showBadge(); }
        else { console.error("[bio] enroll verify failed: hasStored=false after resolve"); toast(t("bio.enrollFail", "启用未完成，可下次登录后再试"), true); }
      } catch (e) {
        const m = String(e?.message ?? "");
        console.error("[bio] storeCredentials reject:", m); /* 诊断通道：真机上 adb logcat 可见 */
        if (!m.includes("AUTH_CANCEL")) toast(t("bio.enrollFail", "启用未完成，可下次登录后再试"), true); /* 用户主动取消不扰 */
      }
    } catch { /* 开通流程任何异常不影响登录主流程 */ }
  };

  /* 登录页"已启用指纹快捷登录"徽标（第六十九轮）：设备快捷登录是否在位的肉眼判据 */
  const showBadge = () => {
    const btn = document.getElementById("l-go");
    if (btn && !document.getElementById("bio-avail")) {
      const el = document.createElement("div");
      el.id = "bio-avail";
      el.style.cssText = "margin-top:10px;font-size:12px;color:#4a55a2;text-align:center";
      el.textContent = t("bio.availableHint", "已启用指纹快捷登录");
      btn.insertAdjacentElement("afterend", el);
    }
  };

  /* —— 登录/登出拦截：成功后询问开通、登出清除、凭据失效自愈 ——
     2FA 两步：第一步 /api/auth/login 只回 mfa_required（不存档，记住凭据）；
     第二步 /api/auth/mfa 成功回 token 时用第一步记住的凭据走开通询问。 */
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
          try { localStorage.setItem("suveoo_login_hint", c.email); } catch { /* 隐私模式忽略 */ }
          /* 必须 await：询问/指纹完成、页面拿到响应后才跳转——登录成功即问的银行惯例。
             用户暂不或任何异常都不影响：maybeEnroll 内部全兜底，最坏也立即放行。 */
          await maybeEnroll(c);
        }
      }
      if (url.includes("/api/auth/logout") && res.ok) {
        pendingCreds = null;
        try { localStorage.removeItem(DECLINE_KEY); } catch {}
        Bio.clearCredentials().catch(() => {});
      }
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
    try { creds = await Bio.quickLogin(); }
    catch (e) {
      /* 第七十七轮：指纹后失败必须可见（此前静默=用户困惑"按了指纹还要输密码"的来源）。
       * 用户取消（AUTH_CANCEL）不扰；解密/绑定异常给一句提示，logcat 留 [bio] 详情。 */
      const m = String(e?.message ?? "");
      console.error("[bio] quickLogin reject:", m);
      if (!m.includes("AUTH_CANCEL")) toast(t("bio.quickFail", "指纹验证后未能取得已存登录信息，请手动登录"), true);
      return false;
    }
    if (!creds || !creds.email) return false;
    /* 指纹已通过但登录请求在途（1-3s）——此前画面完全静止易焦虑（第八十一轮）：
       指纹通过的瞬间即上磨砂处理层（全站统一 proc 语言），2FA 预填/任何失败即撤 */
    let proc = null;
    try { proc = S.ui.proc({ key: "bio.entering", hint: "bio.enterHint" }); } catch { /* UI 未就绪忽略 */ }
    const done = () => { try { proc?.close(); } catch {} };
    try {
      const res = await of(loginUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: creds.email, password: creds.password }),
      });
      const j = await res.json().catch(() => null);
      if (j && j.token) {
        localStorage.setItem("suveoo_token", j.token);
        try { localStorage.setItem("suveoo_login_hint", creds.email); } catch { /* 隐私模式忽略 */ }
        const next = new URLSearchParams(location.search).get("next");
        location.replace(next || "/home"); /* 页面替换即卸载 proc，无需 close */
        return true;
      }
      if (j && j.mfa_required) {
        done();
        /* 2FA 账户（边界）：指纹只做预填便利，两步验证一步不少。
         * 第八十三轮关键修复：quickLogin 已消费登录第一步（mfa_token 在手）——此前只预填账密就丢弃
         * mfa_token，用户手动点登录=60s 内第二次 login 请求撞冷却（队长实测红色「请 60 秒后再试」）。
         * 现直接派发事件驱动登录页进入第二步输码（login.js 监听），第一步不再被重复消费。 */
        const waitEl = async (id, ms) => {
          for (let i = 0; i < ms / 200; i++) { const el = document.getElementById(id); if (el) return el; await new Promise((r) => setTimeout(r, 200)); }
          return null;
        };
        const e = await waitEl("l-id", 5000), p = document.getElementById("l-pw") ?? (e ? await waitEl("l-pw", 1000) : null);
        if (e) e.value = creds.email;
        if (p) p.value = creds.password; /* 事件未被监听（异常路径）时的兜底：至少预填，用户手动走 */
        toast(t("bio.prefilled", "已验证并填好账号密码，请继续两步验证"));
        window.dispatchEvent(new CustomEvent("suveoo:mfa-ready", { detail: { mfaToken: String(j.mfa_token ?? ""), email: creds.email, otp: j.otp ?? null } }));
        return true;
      }
      done();
      const c = String(j?.error?.code ?? "");
      console.error("[bio] quickLogin login resp:", res.status, c);
      if (/PASSWORD|CREDENTIAL/.test(c)) {
        Bio.clearCredentials().catch(() => {});
        toast(t("bio.credsChanged", "已保存的登录信息已失效，请重新登录"), true);
      } else if (c) {
        toast(t("bio.quickFail", "指纹验证后未能取得已存登录信息，请手动登录"), true);
      }
    } catch (e) { done(); console.error("[bio] quickLogin fetch fail:", e); /* 网络异常：留在登录页手动登录 */ }
    return false;
  };

  const boot = async () => {
    try {
      if (!location.pathname.startsWith("/account/login")) return;
      if (localStorage.getItem("suveoo_token")) return;
      const st = await Bio.isAvailable().catch(() => null);
      if (st && st.hasStored) {
        setTimeout(() => {
          if (localStorage.getItem("suveoo_token")) return;
          showBadge();
          quickLogin();
        }, 600);
      }
    } catch { /* 插件异常静默——完整登录永远可用 */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
