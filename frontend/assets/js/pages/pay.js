/* pay.js — P02 收付总览 */
S.router.register("pay", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `
    <div class="ai-quick-bar" id="ai-bar"><img src="/assets/images/suveoo-ai-logo.svg" alt=""><span class="grow">${S.fmt.escape(S.t("pay.aiTry"))}</span><span class="go">${S.ui.icon("arrow-right", 16)}</span></div>
    <div class="pay-actions">
      <a class="pay-action" href="/transfer/intrabank"><span class="pi">${S.ui.icon("bank", 26)}</span>${S.fmt.escape(S.t("pay.intrabank"))}</a>
      <div class="pay-action disabled" id="dis-cross"><span class="pi">${S.ui.icon("exchange", 26)}</span>${S.fmt.escape(S.t("home.crossBank"))}</div>
      <div class="pay-action disabled" id="dis-border"><span class="pi">${S.ui.icon("globe2", 26)}</span>${S.fmt.escape(S.t("home.crossBorder"))}</div>
    </div>
    <div class="section-title"><h2></h2></div>
    <div class="mini-actions">
      <a class="mini-action" href="/transfer/intrabank-scheduled">${S.ui.icon("clock", 16)}${S.fmt.escape(S.t("pay.scheduled"))}</a>
      <a class="mini-action" href="/transfer/history">${S.ui.icon("list", 16)}${S.fmt.escape(S.t("pay.history"))}</a>
      <a class="mini-action" href="/transfer/limits">${S.ui.icon("lock", 16)}${S.fmt.escape(S.t("pay.limits"))}</a>
      <a class="mini-action" href="/pay/bills">${S.ui.icon("doc", 16)}${S.fmt.escape(S.t("pay.billsEntry"))}</a>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("pay.payees"))}</h2><a class="more" href="/transfer/payees">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="hscroll payees" id="payees">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("pay.recent"))}</h2><a class="more" href="/transfer/history">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="card" id="recent">${S.ui.skeleton(3)}</div>`;
  document.getElementById("ai-bar").onclick = () => S.router.ai(S.t("prompt.hotpotAA"));
  const showDis = () => S.ui.modal(`<h2>${S.fmt.escape(S.t("common.more"))}</h2><p class="muted">${S.fmt.escape(S.t("home.crossDisabled"))}</p>${S.sim.footnote()}`);
  document.getElementById("dis-cross").onclick = showDis;
  document.getElementById("dis-border").onclick = showDis;
  const pr = await S.api.get("/api/payees");
  if (pr.ok) {
    const el = document.getElementById("payees");
    el.className = "hscroll payees";
    el.innerHTML = (pr.data.payees ?? []).slice(0, 6).map((p) => `
      <div class="fund-card" style="min-width:200px">
        <div class="row"><span class="avatar">${S.fmt.escape(p.name.slice(0, 1))}</span><b>${S.fmt.escape(p.name)}</b></div>
        <div class="muted small mono" style="margin:8px 0">**** ${S.fmt.escape(String(p.account).slice(-4))}</div>
        <button class="btn btn-sm btn-light pay-now" data-id="${p.id}" data-name="${S.fmt.escape(p.name)}">${S.fmt.escape(S.t("payees.transfer"))}</button>
      </div>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".pay-now").forEach((b) => { b.onclick = () => (location.href = `/transfer/intrabank?payee=${b.dataset.id}`); });
  }
  const tr = await S.api.get("/api/transfers");
  if (tr.ok) {
    document.getElementById("recent").innerHTML = (tr.data.txs ?? []).slice(0, 5).map((t) => `
      <div class="list-row"><img src="/assets/images/suveoo-logo-circular.svg" width="32" height="32" alt="">
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b><div class="muted small">${S.fmt.datetime(t.ts)}</div></div>
        <div style="text-align:right"><div class="amt">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
        <div class="muted small">${S.fmt.escape(t.status ?? "")}</div></div>
      </div>`).join("") || S.ui.empty(S.t("common.emptyTx"));
  }
});
