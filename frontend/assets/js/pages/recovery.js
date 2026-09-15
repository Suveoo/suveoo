/* recovery.js — P23 找回密码（三步流程可视化：验证身份 → 设置新密码 → 完成） */
S.router.register("recovery", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="auth-wrap"><img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="card">
      <h2>${S.fmt.escape(S.t("rec.title"))}</h2>
      <div class="rec-steps" aria-hidden="true">
        ${[S.t("rec.step1"), S.t("rec.step2"), S.t("rec.step3")].map((s, i) => `
          <div class="rec-step" data-step="${i + 1}"><span class="rs-dot">${i + 1}</span><span class="rs-label">${S.fmt.escape(s)}</span></div>`).join("")}
      </div>
      <div id="rec-form">
        <label class="field"><span class="lb">Email</span><input class="input" id="v-email" type="email"></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.passport"))}</span><input class="input" id="v-pass">
          <div class="field-hint">${S.fmt.escape(S.t("rec.passportHint"))}</div></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("reg.code"))}</span>
          <div class="row"><input class="input mono" id="v-code" maxlength="6" inputmode="numeric"><button class="btn btn-light" id="v-send" style="flex:none">${S.fmt.escape(S.t("reg.getCode"))}</button></div></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.newPass"))}</span><input class="input" type="password" id="v-pw"></label>
        <button class="btn btn-primary btn-block" id="v-go">${S.fmt.escape(S.t("rec.submit"))}</button>
      </div>
      <div id="rec-done" hidden>
        <div class="center" style="padding:20px 0">
          <span class="avatar" style="width:56px;height:56px;background:var(--color-green-bg);color:var(--color-green)">${S.ui.icon("check", 26)}</span>
          <h3 style="margin-top:12px">${S.fmt.escape(S.t("rec.ok"))}</h3>
          <p class="muted small">${S.fmt.escape(S.t("rec.doneHint"))}</p>
          <a class="btn btn-primary" href="/account/login">${S.fmt.escape(S.t("login.title"))}</a>
        </div>
      </div>
      <p class="center small" style="margin-top:12px"><a href="/account/login">${S.ui.icon("arrow-left", 12)} ${S.fmt.escape(S.t("login.title"))}</a></p>
      ${S.sim.footnote()}
    </div></div>`;
  /* 步骤指示器：1 验证身份（表单填写中）→ 2 设置新密码（点击提交后）→ 3 完成 */
  const setStep = (n) => S.ui.$$(".rec-step").forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle("on", s <= n);
    el.classList.toggle("now", s === n);
  });
  setStep(1);
  document.getElementById("v-email").addEventListener("input", () => setStep(document.getElementById("v-email").value && document.getElementById("v-code").value ? 2 : 1));
  document.getElementById("v-send").onclick = async () => {
    const email = document.getElementById("v-email").value.trim();
    const r = await S.api.post("/api/auth/email-code", { scene: "recovery", email });
    S.ui.toast(r.status === 429 ? (r.data?.error?.message ?? "too fast") : S.t("consent.codeSent"), r.status === 429);
    if (r.ok) { document.getElementById("v-send").disabled = true; setTimeout(() => (document.getElementById("v-send").disabled = false), 60000); }
  };
  document.getElementById("v-go").onclick = async () => {
    const pw = document.getElementById("v-pw").value;
    setStep(2);
    const r = await S.api.post("/api/auth/recover", {
      email: document.getElementById("v-email").value.trim(),
      code: document.getElementById("v-code").value.trim(),
      new_password: pw,
    });
    if (r.ok) {
      setStep(3);
      document.getElementById("rec-form").hidden = true;
      document.getElementById("rec-done").hidden = false;
    } else S.ui.toast(r.data?.error?.message ?? r.data?.error?.code ?? "failed", true);
  };
});
