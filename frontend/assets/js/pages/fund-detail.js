/* fund-detail.js — P16 基金详情（8 个静态页共用） */
S.router.register("fund-detail", async () => {
  const c = document.getElementById("content");
  const slug = S.fundSlug();
  const f = await S.api.json(`/assets/data/funds/${slug}.json`);
  if (!f) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  c.innerHTML = `<div class="row between wrap"><h1>${S.fmt.escape(f.name)}</h1>${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)}</div>
    ${S.sim.banner(S.fmt.escape(S.t("funds.riskWarn")))}
    <div class="card">
      <div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("funds.nav"))}</div>
        <div class="total mono" style="font-size:32px;font-weight:700">${f.nav}</div></div>
        <div class="muted small">${S.fmt.escape(f.code)} · ${S.fmt.escape(S.t("funds.since"))} ${f.inception}</div></div>
      <div class="chart-box" style="margin-top:12px">${S.charts.line(f.nav_history, { labels: f.nav_history.map((_, i) => `M${i + 1}`) })}</div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("funds.perf"))}</h2></div>
    <div class="card"><table class="table"><thead><tr><th>1M</th><th>3M</th><th>6M</th><th>1Y</th><th>${S.fmt.escape(S.t("funds.fee"))}</th><th>${S.fmt.escape(S.t("funds.minInvest"))}</th></tr></thead>
      <tbody><tr><td class="mono">+${f.returns["1m"]}%</td><td class="mono">+${f.returns["3m"]}%</td><td class="mono">+${f.returns["6m"]}%</td><td class="mono">+${f.returns["1y"]}%</td>
      <td class="mono">${S.fmt.escape(f.fee)}</td><td class="mono">${S.fmt.escape(f.min_invest)}</td></tr></tbody></table></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("funds.holdingsSim"))}</h2></div>
    <div class="card">${S.charts.donut(f.holdings.slice(0, 6).map((h, i) => ({ label: h.name, value: h.weight, color: ["#1E2A78", "#3A4FA5", "#5B7C99", "#7A6A53", "#2C6E63", "#A44A3F"][i] })))}</div>
    <div class="card card-surface" style="margin-top:16px"><div class="row"><span class="avatar">${S.fmt.escape(f.manager.name.slice(0, 1))}</span>
      <div class="grow"><b>${S.fmt.escape(f.manager.name)}</b><div class="muted small">${S.fmt.escape(f.manager.aum)}</div></div></div></div>
    <div class="row" style="margin-top:16px">
      <button class="btn btn-primary" id="buy">${S.fmt.escape(S.t("wealth.purchase"))}（RED）</button>
      <button class="ai-chip" id="ask">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("funds.askFit"))}</button>
    </div>`;
  document.getElementById("buy").onclick = () => S.purchaseModal(f);
  document.getElementById("ask").onclick = () => S.router.ai(S.t("prompt.fundSuit", f.name, f.risk_level));
});
