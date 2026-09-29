/* login.js — P21 登录（含 2FA 第二步） */
S.router.register("login", async () => {
  const c = document.getElementById("content");
  const next = new URLSearchParams(location.search).get("next") || "/home";
  c.innerHTML = `<div class="auth-wrap">
    <img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="card">
      <h2>${S.fmt.escape(S.t("login.title"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("login.identifier"))}</span><input class="input" id="l-id" autocomplete="username"></label>
      <div class="field"><span class="lb">${S.fmt.escape(S.t("login.password"))}</span>
        <div class="pw-wrap">
          <input class="input" type="password" id="l-pw" autocomplete="current-password">
          <button type="button" class="pw-eye" id="l-eye" aria-label="${S.fmt.escape(S.t("login.showPw"))}">${S.ui.icon("eye", 18)}</button>
        </div></div>
      <button class="btn btn-primary btn-block" id="l-go">${S.fmt.escape(S.t("login.submit"))}</button>
      <div class="row between" style="margin-top:14px">
        <a class="small" href="/account/recovery">${S.fmt.escape(S.t("login.toRecovery"))}</a>
        <a class="small" href="/account/register">${S.fmt.escape(S.t("login.toRegister"))} →</a>
      </div>
      ${S.sim.footnote()}
    </div></div>`;
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
  const go = async () => {
    const btn = document.getElementById("l-go");
    busy(btn, true, "login.working");
    const r = await S.auth.login(document.getElementById("l-id").value.trim(), document.getElementById("l-pw").value);
    if (!r.ok) { busy(btn, false); S.ui.toast(r.data?.error?.message ?? S.t("login.failed"), true); return; }
    if (r.data.mfa_required) { twoFa(r.data.mfa_token); return; } /* spinner 保持到 2FA 表单就位自然替换 */
    S.ui.toast(S.t("common.opOk"));
    location.replace(next);
  };
  document.getElementById("l-go").onclick = go;
  document.getElementById("l-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  function twoFa(mfaToken) {
    c.querySelector(".card").innerHTML = `
      <h2>${S.fmt.escape(S.t("login.2faTitle"))}</h2>
      <p class="muted small">${S.fmt.escape(S.t("login.2faHint"))}</p>
      <label class="field"><span class="lb">Code</span><input class="input mono" id="l-otp" maxlength="6" inputmode="numeric" placeholder="${S.fmt.escape(S.t("login.otpPh"))}"></label>
      <button class="btn btn-primary btn-block" id="l-go2">${S.fmt.escape(S.t("login.submit"))}</button>`;
    const go2 = async () => {
      const btn2 = document.getElementById("l-go2");
      busy(btn2, true, "login.verifying");
      const r2 = await S.auth.mfa(mfaToken, document.getElementById("l-otp").value.trim());
      if (!r2.ok) { busy(btn2, false); S.ui.toast(r2.data?.error?.message ?? r2.data?.error?.code ?? S.t("login.mfaFailed"), true); return; }
      location.replace(next); /* 成功路径 spinner 保持到跳转 */
    };
    document.getElementById("l-go2").onclick = go2;
    document.getElementById("l-otp").addEventListener("keydown", (e) => { if (e.key === "Enter") go2(); });
    document.getElementById("l-otp").focus();
  }
});
