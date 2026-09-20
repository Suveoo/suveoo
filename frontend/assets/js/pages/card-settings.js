/* card-settings.js — P26 单卡设置（Debit/Credit 差异化） */
S.router.register("card-settings", async () => {
  const c = document.getElementById("content");
  const slug = (location.pathname.match(/\/account\/card\/([a-z0-9-]+)/) ?? [])[1];
  c.innerHTML = `<h1>${S.fmt.escape(S.t("card.settings"))}</h1>${S.sim.banner()}<div class="card" id="pane">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get(`/api/cards/${slug}`);
  const pane = document.getElementById("pane");
  if (!r.ok) { pane.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const cd = r.data.card;
  const isCredit = cd.kind === "credit";
  pane.innerHTML = `
    <div class="bc-main" style="margin-bottom:16px"><img class="bc-art" src="/${cd.art}" alt="">
      <div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <b class="mono" id="cs-num">${S.fmt.escape(cd.number)}</b>
          <button class="eye-toggle" id="cs-eye" title="${S.fmt.escape(S.t("cards.fullNumber"))}" aria-label="${S.fmt.escape(S.t("cards.fullNumber"))}">${S.ui.icon("eye", 18)}</button>
          <button class="btn btn-sm btn-light" id="cs-copy" hidden>${S.ui.icon("copy", 13)} ${S.fmt.escape(S.t("cards.copy"))}</button>
        </div>
        <div class="muted small">${S.fmt.escape(cd.network)} · ${S.fmt.escape(cd.alias ?? slug)}</div>
      </div></div>
    <label class="field"><span class="lb">${S.fmt.escape(S.t("card.alias"))}</span>
      <div class="row"><input class="input" id="cs-alias" value="${S.fmt.escape(cd.alias ?? "")}"><button class="btn btn-light" id="cs-alias-go" style="flex:none">${S.fmt.escape(S.t("common.save"))}</button></div></label>
    ${cd.is_default ? S.ui.badge(S.t("cards.default"), "badge-navy") : `<button class="btn btn-ghost btn-sm" id="cs-default">${S.fmt.escape(S.t("card.setDefault"))}</button>`}
    ${isCredit ? `
      <div class="section-title" style="margin-top:8px"><h3>${S.fmt.escape(S.t("card.repayInfo"))}</h3></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cs.repayCycle"))}</span><span class="v mono">${S.fmt.escape(S.t("cs.repayCycleVal"))}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cards.creditLimit"))}</span><span class="v mono">¥ ${cd.limit}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cards.outstanding"))}</span><span class="v mono">¥ ${cd.balance}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cards.creditLeft"))}</span><span class="v mono">¥ ${cd.available}</span></div>
      <button class="btn btn-primary" id="cs-repay" style="margin-top:10px">${S.ui.icon("check", 14)} ${S.fmt.escape(S.t("cards.repay"))}</button>
      <p class="muted small" style="margin-top:6px">${S.fmt.escape(S.t("cards.repayNote"))}</p>
      <h3 style="margin-top:16px">${S.fmt.escape(S.t("card.geo"))}</h3>
      <p class="muted small">${S.fmt.escape(S.t("cs.geoNote"))}</p>
      <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" id="cs-geo"><span class="tk"></span></span><span class="small">${S.fmt.escape(S.t("cs.geoLabel"))}</span></label>` : `
      <div class="section-title" style="margin-top:8px"><h3>${S.fmt.escape(S.t("limits.title"))}</h3></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("limits.single"))}</span><span class="v mono">¥ ${cd.limit_single}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("limits.daily"))}</span><span class="v mono">¥ ${cd.limit_daily}</span></div>
      <a class="btn btn-ghost btn-sm" style="margin-top:8px" href="/transfer/limits">${S.fmt.escape(S.t("limits.adjust"))}</a>`}
    <div class="row" style="margin-top:20px">
      <button class="btn btn-danger" id="cs-fz">${S.ui.icon("snow", 14)} ${S.fmt.escape(cd.status === "FROZEN" ? S.t("cards.unfreeze") : S.t("cards.freeze"))}（RED）</button>
    </div>`;
  /* 完整卡号：默认掩码；点击眼睛才调用 reveal 端点取完整 16 位，展开后可复制，再点收回 */
  const numEl = document.getElementById("cs-num");
  const eyeBtn = document.getElementById("cs-eye");
  const copyBtn = document.getElementById("cs-copy");
  let fullNumber = null, revealed = false;
  const fmtGroups = (n16) => String(n16).replace(/(\d{4})(?=\d)/g, "$1 ");
  eyeBtn.onclick = async () => {
    if (!revealed) {
      if (!fullNumber) {
        const r = await S.api.get(`/api/cards/${slug}/reveal`);
        if (!r.ok || !r.data?.number) { S.ui.toast(S.t("common.loadFailed"), true); return; }
        fullNumber = r.data.number;
      }
      numEl.textContent = fmtGroups(fullNumber);
      eyeBtn.innerHTML = S.ui.icon("eye-off", 18);
      copyBtn.hidden = false;
      revealed = true;
    } else {
      numEl.textContent = cd.number;
      eyeBtn.innerHTML = S.ui.icon("eye", 18);
      copyBtn.hidden = true;
      revealed = false;
    }
  };
  copyBtn.onclick = async () => {
    if (!fullNumber) return;
    if (await S.ui.copy(fullNumber)) S.ui.toast(S.t("cards.copied"));
    else S.ui.toast(S.t("common.opFailed"), true);
  };
  document.getElementById("cs-alias-go").onclick = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}`, { alias: document.getElementById("cs-alias").value.trim() || undefined });
    if (!r2.cancelled) S.ui.toast(r2.data?.status === "EXECUTED" ? S.t("common.opOk") : r2.data?.reason ?? "failed", r2.data?.status !== "EXECUTED");
  };
  const def = document.getElementById("cs-default");
  if (def) def.onclick = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}`, { is_default: 1 });
    if (!r2.cancelled && r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 700); }
  };
  const geo = document.getElementById("cs-geo");
  if (geo) geo.onchange = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}/limits`, { limit_single: "3500.00", limit_daily: "3500.00" });
    if (r2.cancelled) { geo.checked = !geo.checked; return; }
    S.ui.toast(r2.data?.status === "EXECUTED" ? S.t("cs.geoOn") : r2.data?.reason ?? "failed", r2.data?.status !== "EXECUTED");
    if (r2.data?.status !== "EXECUTED") geo.checked = !geo.checked;
  };
  document.getElementById("cs-fz").onclick = async () => {
    const intent = cd.status === "FROZEN" ? "unfreeze" : "freeze";
    /* 两段式走 mutate（首答 INPUT_REQUIRED → 确认卡[RED 含 OTP 输入] → 携 grant_hash+otp 二段）——
       此前裸 post {otp} 拿到 INPUT_REQUIRED 被当失败提示 "failed"（组员报告的冻结/解冻失效根因） */
    const r2 = await S.api.mutate(`/api/cards/${slug}/${intent}`, {}, { action: `card_${intent === "freeze" ? "freeze" : "unfreeze"}`, subject: cd.number });
    if (r2.cancelled) return;
    if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
    else S.ui.toast(r2.data?.reason ?? r2.data?.error?.message ?? "failed", true);
  };
  /* 立即还款：走 credit-repay 账单缴费（黄级确认卡），金额=当前欠款全额（服务端动态取） */
  const repayBtn = document.getElementById("cs-repay");
  if (repayBtn) repayBtn.onclick = async () => {
    repayBtn.disabled = true;
    const r2 = await S.api.mutate("/api/bills/credit-repay/pay", {}, { action: "bill_pay", subject: S.t("cards.repaySubject") });
    if (r2.cancelled) { repayBtn.disabled = false; return; }
    if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("cards.repaid", r2.data.result?.repaid ?? "")); setTimeout(() => location.reload(), 900); }
    else { S.ui.toast(r2.data?.error?.message ?? r2.data?.reason ?? "failed", true); repayBtn.disabled = false; }
  };
});
