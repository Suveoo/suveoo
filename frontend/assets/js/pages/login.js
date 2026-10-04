/* login.js — P21 登录（含 2FA 第二步）
 * 第六十九轮：①表单化（<form>+submit+autocomplete=one-time-code，浏览器密码管理器可保存/填充）；
 * ②账户记忆（登录成功记 localStorage，回来自动预填、只输密码——密码永不由站点存储）；
 * ③会话过期提示（api.js 401 跳转时置位 sessionStorage，本页一次性消费后显示 amber 提示行）。 */
S.router.register("login", async () => {
  const c = document.getElementById("content");
  const next = new URLSearchParams(location.search).get("next") || "/home";
  const HINT_KEY = "suveoo_login_hint";
  const expired = sessionStorage.getItem("suveoo_session_expired");
  if (expired) sessionStorage.removeItem("suveoo_session_expired");
  c.innerHTML = `<div class="auth-wrap">
    <img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="card">
      <h2>${S.fmt.escape(S.t("login.title"))}</h2>
      ${expired ? `<div class="l-expired">${S.ui.icon("info", 14)}<span>${S.fmt.escape(S.t("login.expired"))}</span></div>` : ""}
      <form id="l-form" novalidate>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("login.identifier"))}</span><input class="input" id="l-id" autocomplete="username"></label>
        <div class="field"><span class="lb">${S.fmt.escape(S.t("login.password"))}</span>
          <div class="pw-wrap">
            <input class="input" type="password" id="l-pw" autocomplete="current-password">
            <button type="button" class="pw-eye" id="l-eye" aria-label="${S.fmt.escape(S.t("login.showPw"))}">${S.ui.icon("eye", 18)}</button>
          </div></div>
        <button type="submit" class="btn btn-primary btn-block" id="l-go">${S.fmt.escape(S.t("login.submit"))}</button>
      </form>
      <div class="row between" style="margin-top:14px">
        <a class="small" href="/account/recovery">${S.fmt.escape(S.t("login.toRecovery"))}</a>
        <a class="small" href="/account/register">${S.fmt.escape(S.t("login.toRegister"))} →</a>
      </div>
      ${S.sim.footnote()}
    </div></div>`;
  /* 账户记忆预填：Web 与 Android 壳统一（壳内生物识别解密成功后会覆盖为完整账密——biometric-shell.js）。
   * 换账户 = 直接改输入框（可编辑即切换）；不记忆密码。 */
  const hint = localStorage.getItem(HINT_KEY);
  if (hint) document.getElementById("l-id").value = hint;
  (hint ? document.getElementById("l-pw") : document.getElementById("l-id")).focus();
  /* 密码可见性切换 */
  document.getElementById("l-eye").onclick = () => {
    const pw = document.getElementById("l-pw");
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    document.getElementById("l-eye").innerHTML = S.ui.icon(show ? "eye-off" : "eye", 18);
  };
  /* 提交期间按钮进入 spinner 态：disabled 灰样式 + 旋转指示 + "正在登录/验证"文案——
     2FA 用户服务端往返更久，静止的灰按钮易被误认为卡死（队长第三十轮反馈） */
  const busy = (btn, on, textKey) => {
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>${S.fmt.escape(S.t(textKey))}`; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.label ?? btn.innerHTML; btn.disabled = false; }
  };
  const remember = (id) => { try { localStorage.setItem(HINT_KEY, id); } catch { /* 隐私模式禁写忽略 */ } };
  const go = async () => {
    const btn = document.getElementById("l-go");
    const id = document.getElementById("l-id").value.trim();
    busy(btn, true, "login.working");
    const r = await S.auth.login(id, document.getElementById("l-pw").value);
    if (!r.ok) { busy(btn, false); S.ui.toast(r.data?.error?.message ?? S.t("login.failed"), true); return; }
    if (r.data.mfa_required) { twoFa(r.data.mfa_token, id, r.data.otp); return; } /* spinner 保持到 2FA 表单就位自然替换 */
    remember(id);
    S.ui.toast(S.t("common.opOk"));
    location.replace(next);
  };
  /* 表单化提交：Enter（账户/密码框内）与按钮点击统一走原生 submit（第六十九轮前是密码框专属 keydown） */
  document.getElementById("l-form").addEventListener("submit", (e) => { e.preventDefault(); go(); });
  /* 第八十三轮：壳内指纹快捷重登（2FA 账户）——biometric-shell 的 quickLogin 已消费登录第一步
   * （mfa_token 在手），派发 suveoo:mfa-ready 让本页直接进入第二步输码；此前只预填账密，用户
   * 手动点登录=60s 内第二次请求撞服务端冷却（红色「请 60 秒后再试」）。Web 无事件源=零影响。
   * 具名+先移除：i18n 即时切换会重跑本 controller，防监听器叠加。 */
  if (window.__svMfaReady) window.removeEventListener("suveoo:mfa-ready", window.__svMfaReady);
  window.__svMfaReady = (e) => {
    const d = e.detail ?? {};
    if (d.mfaToken) twoFa(String(d.mfaToken), String(d.email ?? document.getElementById("l-id")?.value.trim() ?? ""), d.otp ?? null);
  };
  window.addEventListener("suveoo:mfa-ready", window.__svMfaReady);
  function twoFa(mfaToken, idf, otpInfo = null) {
    /* 第九十四轮：提示文本动态化（此前硬编码"已发送至邮箱"——手机号通道时显示错误） */
    const hintTxt = otpInfo && otpInfo.masked
      ? S.t("ph.sentTo") + " " + otpInfo.masked + "（10 " + S.t("ph.minutes") + "）"
      : S.t("login.2faHint");
    c.querySelector(".card").innerHTML = `
      <h2>${S.fmt.escape(S.t("login.2faTitle"))}</h2>
      <p class="muted small" id="l-2fa-hint">${S.fmt.escape(hintTxt)}</p>
      <form id="l-form2" novalidate>
        <label class="field"><span class="lb">Code</span><input class="input mono" id="l-otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="${S.fmt.escape(S.t("login.otpPh"))}"></label>
        <button type="submit" class="btn btn-primary btn-block" id="l-go2">${S.fmt.escape(S.t("login.submit"))}</button>
      </form>`;
    /* 第九十四轮：切换条直接替换静态提示行（一处信息源，不再"邮箱+手机号"两条叠加混淆） */
    if (otpInfo && otpInfo.alt) {
      const sw = S.phone.otpSwitcher(otpInfo, "login2fa", { mfa_token: mfaToken });
      if (sw) {
        const hintP = c.querySelector("#l-2fa-hint");
        if (hintP) hintP.replaceWith(sw); else c.querySelector(".card").prepend(sw);
      }
    }
    const go2 = async () => {
      const btn2 = document.getElementById("l-go2");
      busy(btn2, true, "login.verifying");
      const r2 = await S.auth.mfa(mfaToken, document.getElementById("l-otp").value.trim());
      if (!r2.ok) { busy(btn2, false); S.ui.toast(r2.data?.error?.message ?? r2.data?.error?.code ?? S.t("login.mfaFailed"), true); return; }
      remember(idf); /* 2FA 完成=登录成功，同样记忆账户 */
      location.replace(next); /* 成功路径 spinner 保持到跳转 */
    };
    document.getElementById("l-form2").addEventListener("submit", (e) => { e.preventDefault(); go2(); });
    document.getElementById("l-otp").focus();
  }
});
