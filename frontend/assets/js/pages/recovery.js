/* recovery.js — P23 找回密码（三步流程可视化：验证身份 → 设置新密码 → 完成）
 * 红线：本页与 /api/auth/recover 流程绝不出现"旧密码/当前密码"字段（忘记密码的人无法提供旧密码）。
 * 2026-09 任务 A：补确认密码框（bindEyes 双框），两次不一致本地拦截；重置成功后服务端下线全部旧会话。 */
S.router.register("recovery", async () => {
  const c = document.getElementById("content");
  const pwInput = (id) => `<span class="pw-field"><input class="input" id="${id}" type="password" autocomplete="new-password">
      <button type="button" class="eye-toggle" data-eye="${id}" aria-label="${S.fmt.escape(S.t("common.showPass"))}" title="${S.fmt.escape(S.t("common.showPass"))}">${S.ui.icon("eye", 18)}</button></span>`;
  c.innerHTML = `<div class="auth-wrap"><img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="card">
      <h2>${S.fmt.escape(S.t("rec.title"))}</h2>
      <div class="rec-steps" aria-hidden="true">
        ${[S.t("rec.step1"), S.t("rec.step2"), S.t("rec.step3")].map((s, i) => `
          <div class="rec-step" data-step="${i + 1}"><span class="rs-dot">${i + 1}</span><span class="rs-label">${S.fmt.escape(s)}</span></div>`).join("")}
      </div>
      <div id="rec-form">
        <label class="field"><span class="lb">${S.fmt.escape(S.t("ph.idLabel", "绑定邮箱或手机号"))}</span><input class="input" id="v-email" autocomplete="username"></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.passport"))}</span><input class="input" id="v-pass">
          <div class="field-hint">${S.fmt.escape(S.t("rec.passportHint"))}</div></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("reg.code"))}</span>
          <div class="row"><input class="input mono" id="v-code" maxlength="6" inputmode="numeric"><button class="btn btn-light" id="v-send" style="flex:none">${S.fmt.escape(S.t("reg.getCode"))}</button></div></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("rec.newPass"))}</span>${pwInput("v-pw")}</label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("common.confirmPass"))}</span>${pwInput("v-pw2")}</label>
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
  S.ui.bindEyes(c);
  document.getElementById("v-email").addEventListener("input", () => setStep(document.getElementById("v-email").value && document.getElementById("v-code").value ? 2 : 1));
  document.getElementById("v-send").onclick = async () => {
    /* 第八十五轮：支持手机号找回——标识按形态分流（裸 11 位手机号→phone 通道；其余按邮箱）。
     * 第九十五轮：服务端按账户默认通道分流（绑手机号且偏好短信→邮箱标识也发短信），
     * 响应带 channel/masked/alt——提示实际接收方并挂切换条（两通道码均算数）。 */
    const ident = document.getElementById("v-email").value.trim();
    const isPhone = /^1[3-9]\d{9}$/.test(ident.replace(/[\s-]/g, "").replace(/^(\+86|0086)/, ""));
    const r = await S.api.post("/api/auth/email-code", isPhone ? { scene: "recovery", channel: "phone", phone: ident } : { scene: "recovery", email: ident });
    S.ui.toast(r.status === 429 ? (r.data?.error?.message ?? "too fast") : S.t("consent.codeSent"), r.status === 429);
    if (r.ok) {
      const holder = document.getElementById("v-send").closest(".row");
      document.querySelector(".ph-switch[data-rec]")?.remove();
      const sw = S.phone.otpSwitcher(r.data, "recovery", { email: ident });
      if (sw) { sw.dataset.rec = "1"; holder.after(sw); }
      document.getElementById("v-send").disabled = true;
      setTimeout(() => (document.getElementById("v-send").disabled = false), 60000);
    }
  };
  document.getElementById("v-go").onclick = async () => {
    const pw = document.getElementById("v-pw").value;
    const pw2 = document.getElementById("v-pw2").value;
    /* 本地校验：格式 → 两次一致（不一致不发请求，停留本页） */
    if (!/^\S{8,32}$/.test(pw)) { S.ui.toast(S.t("reg.pwRule"), true); document.getElementById("v-pw").focus(); return; }
    if (pw !== pw2) { S.ui.toast(S.t("common.pwMismatch"), true); document.getElementById("v-pw2").focus(); return; }
    setStep(2);
    const r = await S.api.post("/api/auth/recover", {
      email: document.getElementById("v-email").value.trim(),
      /* 手机号找回：服务端按绑定账户双通道校验（hRecover 已支持 phone 字段） */
      ...(S.phone.normCN(document.getElementById("v-email").value) ? { phone: S.phone.normCN(document.getElementById("v-email").value) } : {}),
      code: document.getElementById("v-code").value.trim(),
      new_password: pw,
    });
    if (r.ok) {
      setStep(3);
      document.getElementById("rec-form").hidden = true;
      document.getElementById("rec-done").hidden = false;
    } else S.ui.toast(r.data?.error?.message ?? r.data?.error?.code ?? S.t("common.opFailed"), true);
  };
});
