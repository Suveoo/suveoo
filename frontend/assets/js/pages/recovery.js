/* recovery.js — P23 找回密码 */
S.router.register("recovery", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="auth-wrap"><img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="card">
      <h2>${S.fmt.escape(S.t("rec.title"))}</h2>
      <label class="field"><span class="lb">Email</span><input class="input" id="v-email" type="email"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.passport"))}</span><input class="input" id="v-pass">
        <div class="field-hint">${S.fmt.escape(S.t("rec.passportHint"))}</div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("reg.code"))}</span>
        <div class="row"><input class="input mono" id="v-code" maxlength="6" inputmode="numeric"><button class="btn btn-light" id="v-send" style="flex:none">${S.fmt.escape(S.t("reg.getCode"))}</button></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.newPass"))}</span><input class="input" type="password" id="v-pw"></label>
      <button class="btn btn-primary btn-block" id="v-go">${S.fmt.escape(S.t("rec.submit"))}</button>
      <p class="center small" style="margin-top:12px"><a href="/account/login">${S.ui.icon("arrow-left", 12)} ${S.fmt.escape(S.t("login.title"))}</a></p>
      ${S.sim.footnote()}
    </div></div>`;
  document.getElementById("v-send").onclick = async () => {
    const email = document.getElementById("v-email").value.trim();
    const r = await S.api.post("/api/auth/email-code", { scene: "recovery", email });
    S.ui.toast(r.status === 429 ? (r.data?.error?.message ?? "too fast") : S.t("consent.codeSent"), r.status === 429);
    if (r.ok) { document.getElementById("v-send").disabled = true; setTimeout(() => (document.getElementById("v-send").disabled = false), 60000); }
  };
  document.getElementById("v-go").onclick = async () => {
    const r = await S.api.post("/api/auth/recover", {
      email: document.getElementById("v-email").value.trim(),
      code: document.getElementById("v-code").value.trim(),
      new_password: document.getElementById("v-pw").value,
    });
    if (r.ok) { S.ui.toast(S.t("rec.ok")); setTimeout(() => (location.href = "/account/login"), 900); }
    else S.ui.toast(r.data?.error?.message ?? r.data?.error?.code ?? "failed", true);
  };
});
