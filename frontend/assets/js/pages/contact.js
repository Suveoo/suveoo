/* contact.js — P33 联系我们（第十轮改版：渐变 Hero + 登录预填 + 行内校验 + 成功态面板 + 双邮箱直达卡 + FAQ 速查） */
S.router.register("contact", async () => {
  const c = document.getElementById("content");
  const sess = S.auth._session ?? (await S.auth.session().catch(() => null));
  const email = typeof sess?.email === "string" ? sess.email : "";
  c.innerHTML = `
    <section class="ct-hero bg-grad-navy">
      <div class="ab-hero-txt" style="padding-right:0">
        <h1>${S.fmt.escape(S.t("contact.title"))}</h1>
        <p>${S.fmt.escape(S.t("contact.heroSub"))}</p>
      </div>
      <img class="ab-hero-art" src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt="">
    </section>
    <div class="ct-grid">
      <div class="card ct-form-card" id="ct-card">
        <div id="ct-form">
          <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.name"))}</span><input class="input" id="ct-name" autocomplete="name"></label>
          <label class="field"><span class="lb">Email <i class="ct-req">*</i></span><input class="input" id="ct-email" type="email" value="${S.fmt.escape(email)}" autocomplete="email">
            ${email ? `<span class="ct-prefilled">${S.ui.icon("check", 12)} ${S.fmt.escape(S.t("contact.prefilled"))}</span>` : ""}</label>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.category"))}</span><span id="ct-cat"></span></label>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.message"))} <i class="ct-req">*</i>
            <span class="ct-count mono" id="ct-count"></span></span>
            <textarea class="input" id="ct-msg" rows="6" maxlength="2000"></textarea>
            <span class="ct-err" id="ct-err-msg" hidden></span></label>
          <span class="ct-err" id="ct-err-email" hidden></span>
          <button class="btn btn-primary btn-block" id="ct-go">${S.fmt.escape(S.t("contact.submit"))}</button>
        </div>
        <div class="ct-done" id="ct-done" hidden>
          <span class="ct-done-ic">${S.ui.icon("check", 26)}</span>
          <b>${S.fmt.escape(S.t("contact.successTitle"))}</b>
          <p class="muted small">${S.fmt.escape(S.t("contact.successBody"))}</p>
          <button class="btn btn-light btn-sm" id="ct-again">${S.fmt.escape(S.t("contact.again"))}</button>
        </div>
      </div>
      <div class="ct-side">
        <div class="card card-surface" style="padding:14px 16px">
          <h3>${S.fmt.escape(S.t("contact.emails"))}</h3>
          <a class="ab-ct-row" href="mailto:support@suveoo.com">${S.ui.icon("ic-doc-navy", 30)}<span class="ab-ct-txt"><b>${S.fmt.escape(S.t("contact.supTitle"))}</b><span class="small muted">${S.fmt.escape(S.t("contact.supDesc"))}</span><span class="mono small">support@suveoo.com</span></span></a>
          <a class="ab-ct-row" href="mailto:security@suveoo.com" style="margin-top:8px">${S.ui.icon("ic-shield-rose", 30)}<span class="ab-ct-txt"><b>${S.fmt.escape(S.t("contact.secTitle"))}</b><span class="small muted">${S.fmt.escape(S.t("contact.secDesc"))}</span><span class="mono small">security@suveoo.com</span></span></a>
        </div>
        <a class="card card-surface ct-faq" href="/help">${S.ui.icon("help", 16)}<span class="grow">${S.fmt.escape(S.t("contact.faqHint"))}</span>${S.ui.icon("chevron", 14)}</a>
      </div>
    </div>`;
  const catKeys = ["catAccount", "catTransfer", "catWealth", "catSecurity", "catOther"];
  const catSel = S.ctl.select({ label: S.t("contact.category"), options: catKeys.map((k) => ({ v: S.t("contact." + k), label: S.t("contact." + k) })) });
  catSel.id = "ct-cat";
  document.getElementById("ct-cat").replaceWith(catSel);
  const $ = (id) => document.getElementById(id);
  /* 字数计数（maxlength 2000 前后端同限） */
  const msg = $("ct-msg"), count = $("ct-count");
  const syncCount = () => { count.textContent = msg.value.length ? `${msg.value.length} / 2000` : ""; };
  msg.addEventListener("input", syncCount);
  syncCount();
  /* 行内校验：Email 格式与留言必填（红边+行内错误文本），提交时统一检查 */
  const errEmail = $("ct-err-email"), errMsg = $("ct-err-msg");
  const setErr = (el, input, on) => { el.hidden = !on; input.classList.toggle("ct-bad", on); };
  const validate = () => {
    const em = $("ct-email").value.trim();
    /* 掩码邮箱（登录态预填 de**@suveoo.com）视作有效——提交时传空，服务端以 JWT 内真实邮箱为准 */
    const badEmail = !em.includes("*") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
    const badMsg = !msg.value.trim();
    setErr(errEmail, $("ct-email"), badEmail);
    errEmail.textContent = badEmail ? S.t("contact.errEmail") : "";
    setErr(errMsg, msg, badMsg);
    errMsg.textContent = badMsg ? S.t("contact.errMsg") : "";
    return !badEmail && !badMsg;
  };
  $("ct-email").addEventListener("input", () => { if (!$("ct-email").classList.contains("ct-bad") || validate()) setErr(errEmail, $("ct-email"), false); });
  msg.addEventListener("input", () => { if (msg.classList.contains("ct-bad") && msg.value.trim()) setErr(errMsg, msg, false); });
  /* 提交三态：默认 → 发送中（禁用）→ 成功态面板（翻转整卡） */
  const go = $("ct-go");
  go.onclick = async () => {
    if (!validate()) return;
    go.disabled = true;
    go.textContent = S.t("contact.sending");
    const r = await S.api.post("/api/contact", {
      name: $("ct-name").value.trim(),
      /* 掩码邮箱不上送（服务端以 JWT 真实邮箱为准）——否则邮件"来自 de**@…"不可回复 */
      email: $("ct-email").value.trim().includes("*") ? "" : $("ct-email").value.trim(),
      category: catSel.value,
      message: msg.value.trim(),
    });
    if (r.ok) {
      $("ct-form").hidden = true;
      $("ct-done").hidden = false;
    } else {
      go.disabled = false;
      go.textContent = S.t("contact.submit");
      S.ui.toast(r.data?.error?.message ?? "failed", true);
    }
  };
  /* 再写一条：整卡回到表单态（清留言，保留姓名/邮箱/类别） */
  $("ct-again").onclick = () => {
    msg.value = "";
    syncCount();
    $("ct-done").hidden = true;
    $("ct-form").hidden = false;
    go.disabled = false;
    go.textContent = S.t("contact.submit");
  };
});
