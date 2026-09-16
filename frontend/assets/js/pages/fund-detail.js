/* fund-detail.js — P16 基金详情（16 个静态页共用）
 * 数据来自 /assets/data/funds/{slug}.json：4-12 年月度净值（锚定真实行情的多因子模型）、
 * 基准对比、风险指标（自序列反算）、10 年蒙特卡洛预测、行业/区域/持仓/费率结构。 */
S.router.register("fund-detail", async () => {
  const c = document.getElementById("content");
  const slug = S.fundSlug();
  const f = await S.api.json(`/assets/data/funds/${slug}.json`);
  if (!f) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }

  const NAV = f.nav_history ?? [];
  const BCH = f.benchmark_history ?? NAV;
  const DATES = f.nav_dates ?? [];
  const st = f.stats ?? {};
  const up = Number(f.day_change) >= 0;

  /* 区间切片（月数），默认 1Y */
  const RANGES = [["6m", 6], ["1y", 12], ["3y", 36], ["5y", 60], ["all", NAV.length]];
  let range = Math.min(12, NAV.length - 1);
  const slice = (arr) => arr.slice(-Math.min(range + 1, arr.length));
  const sliceDates = () => DATES.slice(-Math.min(range + 1, DATES.length));
  const labelOf = (d) => (typeof d === "string" ? d.slice(2).replace("-", "/") : "");
  /* 归一化对比：以区间起点为 1，看相对表现 */
  const norm = (arr) => { const b = arr[0] || 1; return arr.map((v) => +(v / b).toFixed(4)); };

  c.innerHTML = `<div class="row between wrap"><h1>${S.fmt.escape(f.name)}</h1>${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)}</div>
    ${S.sim.banner(S.fmt.escape(S.t("funds.riskWarn")))}
    <div class="card">
      <div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("funds.nav"))}</div>
        <div class="total mono" style="font-size:32px;font-weight:700">${f.nav}</div>
        <div class="small" style="color:${up ? "var(--color-green)" : "var(--color-red)"}">${up ? "+" : ""}${f.day_change}% · ${S.fmt.escape(S.t("fd.dayChange"))}</div></div>
        <div class="small" style="text-align:right;color:var(--color-ink-2)">
          <div class="mono">${S.fmt.escape(f.code)}</div>
          <div>${S.fmt.escape(S.t("funds.since"))} ${f.inception}</div>
          <div>${S.fmt.escape(f.asset_class ?? "")}</div>
          <div>${S.fmt.escape(f.manager?.aum ?? "")}</div></div></div>
      <div class="tabs" id="fd-ranges" style="margin-top:12px"></div>
      <div class="row small" style="gap:14px;margin:8px 0 2px;flex-wrap:wrap">
        <span class="row" style="gap:5px"><i style="width:16px;height:2px;background:#1E2A78;display:inline-block"></i>${S.fmt.escape(S.t("fd.thisFund"))}</span>
        <span class="row" style="gap:5px"><i style="width:16px;height:2px;border-top:2px dashed #A44A3F;display:inline-block"></i>${S.fmt.escape(S.t("fd.benchmark"))}</span>
      </div>
      <div class="chart-box" id="fd-chart"></div>
    </div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("funds.perf"))}</h2></div>
    <div class="card"><table class="table"><thead><tr><th>1M</th><th>3M</th><th>6M</th><th>1Y</th><th>3Y</th><th>5Y</th><th>${S.fmt.escape(S.t("funds.since"))}</th></tr></thead>
      <tbody><tr>${["1m", "3m", "6m", "1y", "3y", "5y", "since"].map((k) => `<td class="mono">${f.returns?.[k] == null ? "—" : "+" + f.returns[k] + "%"}</td>`).join("")}</tr></tbody></table>
      <div class="row between small" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <span class="muted">${S.fmt.escape(S.t("funds.minInvest"))} <b class="mono">${S.fmt.escape(f.min_invest)}</b></span>
        <span class="muted">${S.fmt.escape(S.t("funds.fee"))} <b class="mono">${S.fmt.escape(f.fee?.total ?? "")}</b></span>
        <span class="muted">${S.fmt.escape(S.t("fd.benchmarkLabel"))} <b>${S.fmt.escape(f.benchmark ?? "—")}</b></span></div>
    </div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.stats"))}</h2></div>
    <div class="card"><div class="grid grid-3" id="fd-stats"></div></div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.projection"))}</h2></div>
    <div class="card">
      <div class="chart-box">${S.charts.fan(f.projection, { labels: f.projection.years.map((y) => (y % 2 === 0 ? `Y${y}` : "")) })}</div>
      <div class="row between small" style="margin-top:8px;flex-wrap:wrap;gap:8px">
        <span class="muted">${S.fmt.escape(S.t("fd.projNote1", f.projection.assumptions.exp_return, f.projection.assumptions.exp_vol))}</span>
      </div>
      <table class="table" style="margin-top:10px"><thead><tr><th></th><th>P10</th><th>P25</th><th>P50</th><th>P75</th><th>P90</th></tr></thead>
        <tbody><tr><td class="muted">10${S.fmt.escape(S.t("fd.yearsUnit"))}</td>
          ${["p10", "p25", "p50", "p75", "p90"].map((k) => `<td class="mono">${f.projection[k][10].toFixed(2)}</td>`).join("")}</tr></tbody></table>
      <div class="muted small" style="margin-top:8px">${S.fmt.escape(S.t("fd.projNote2"))}</div>
    </div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.strategy"))}</h2></div>
    <div class="card"><p class="small" style="margin:0;line-height:1.7">${S.fmt.escape(f.strategy ?? "")}</p></div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.alloc"))}</h2></div>
    <div class="card">${S.charts.donut((f.sectors ?? []).slice(0, 6).map((x, i) => ({ label: x.name, value: x.weight, color: ["#1E2A78", "#3A4FA5", "#5B7C99", "#7A6A53", "#2C6E63", "#A44A3F"][i] })))}</div>
    <div class="card card-surface" style="margin-top:16px"><b class="small">${S.fmt.escape(S.t("fd.regions"))}</b>
      <div id="fd-regions" style="margin-top:10px"></div></div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.topHoldings"))}</h2></div>
    <div class="card"><table class="table"><thead><tr><th>${S.fmt.escape(S.t("fd.holding"))}</th><th style="text-align:right">${S.fmt.escape(S.t("fd.weight"))}</th></tr></thead>
      <tbody>${(f.holdings ?? []).map((h) => `<tr><td>${S.fmt.escape(h.name)}</td>
        <td class="mono" style="text-align:right"><div class="row" style="justify-content:flex-end;gap:8px;align-items:center">
          <i style="width:${Math.min(90, Math.abs(h.weight) * 6)}px;height:6px;background:${h.weight < 0 ? "var(--color-red)" : "var(--color-primary-tint)"};border:1px solid ${h.weight < 0 ? "var(--color-red)" : "var(--color-primary)"};display:inline-block"></i>${h.weight}%</div></td></tr>`).join("")}</tbody></table></div>

    <div class="section-title"><h2>${S.fmt.escape(S.t("fd.fees"))}</h2></div>
    <div class="card"><table class="table"><tbody>
      <tr><td class="muted">${S.fmt.escape(S.t("fd.mgmt"))}</td><td class="mono" style="text-align:right">${f.fee?.mgmt ?? "—"}%/${S.fmt.escape(S.t("fd.perYear"))}</td></tr>
      <tr><td class="muted">${S.fmt.escape(S.t("fd.custody"))}</td><td class="mono" style="text-align:right">${f.fee?.custody ?? "—"}%/${S.fmt.escape(S.t("fd.perYear"))}</td></tr>
      <tr><td class="muted">${S.fmt.escape(S.t("fd.sales"))}</td><td class="mono" style="text-align:right">${f.fee?.sales ?? "—"}%/${S.fmt.escape(S.t("fd.perYear"))}</td></tr>
      <tr><td><b>${S.fmt.escape(S.t("fd.total"))}</b></td><td class="mono" style="text-align:right"><b>${S.fmt.escape(f.fee?.total ?? "—")}</b></td></tr>
      <tr><td class="muted">${S.fmt.escape(S.t("fd.dividend"))}</td><td style="text-align:right">${S.fmt.escape(f.dividend_policy ?? "—")}</td></tr></tbody></table></div>

    <div class="card card-surface" style="margin-top:16px"><div class="row"><span class="avatar">${S.fmt.escape((f.manager?.name ?? "S").slice(0, 1))}</span>
      <div class="grow"><b>${S.fmt.escape(f.manager?.name ?? "")}</b>
        <div class="muted small">${S.fmt.escape(S.t("fd.tenure", f.manager?.tenure_years ?? 0))} · ${S.fmt.escape(f.manager?.style ?? "")} · ${S.fmt.escape(f.manager?.aum ?? "")}</div></div></div></div>

    <div class="row" style="margin-top:16px">
      <button class="btn btn-primary" id="buy">${S.fmt.escape(S.t("wealth.purchase"))}（RED）</button>
      <button class="ai-chip" id="ask">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("funds.askFit"))}</button>
    </div>
    <p class="muted small" style="margin-top:12px">${S.fmt.escape(f.notice ?? "")}</p>`;

  const renderChart = () => {
    document.getElementById("fd-chart").innerHTML = S.charts.multi([
      { points: norm(slice(NAV)), color: "#1E2A78" },
      { points: norm(slice(BCH)), color: "#A44A3F", dash: true },
    ], { labels: sliceDates().map(labelOf) });
  };
  document.getElementById("fd-ranges").innerHTML = RANGES.map(([k, n]) =>
    `<button class="tab${range === Math.min(n, NAV.length - 1) ? " active" : ""}" data-r="${k}">${S.t(k === "all" ? "fd.rangeAll" : "fd.range" + k)}</button>`).join("");
  S.ui.$$("#fd-ranges .tab").forEach((t) => {
    t.onclick = () => {
      range = Math.min(RANGES.find(([k]) => k === t.dataset.r)[1], NAV.length - 1);
      S.ui.$$("#fd-ranges .tab").forEach((x) => x.classList.toggle("active", x === t));
      renderChart();
    };
  });
  renderChart();

  document.getElementById("fd-stats").innerHTML = [
    [S.t("fd.annReturn"), (st.ann_return ?? "—") + "%"],
    [S.t("fd.annVol"), (st.ann_vol ?? "—") + "%"],
    [S.t("fd.sharpe"), st.sharpe ?? "—"],
    [S.t("fd.maxDrawdown"), (st.max_drawdown ?? "—") + "%"],
    [S.t("fd.bestMonth"), "+" + (st.best_month ?? "—") + "%"],
    [S.t("fd.worstMonth"), (st.worst_month ?? "—") + "%"],
  ].map(([lb, v]) => `<div><div class="muted small">${S.fmt.escape(String(lb))}</div><div class="mono" style="font-size:18px;font-weight:600;margin-top:2px">${S.fmt.escape(String(v))}</div></div>`).join("");

  const maxReg = Math.max(...(f.regions ?? []).map((r) => r.weight), 1);
  document.getElementById("fd-regions").innerHTML = (f.regions ?? []).map((r) => `
    <div class="row between small" style="margin-bottom:8px"><span>${S.fmt.escape(r.name)}</span><span class="mono">${r.weight}%</span></div>
    <i style="display:block;height:6px;width:${(r.weight / maxReg) * 100}%;background:var(--color-primary-tint);border-left:2px solid var(--color-primary);margin-bottom:10px"></i>`).join("");

  document.getElementById("buy").onclick = () => S.purchaseModal(f);
  document.getElementById("ask").onclick = () => S.router.ai(S.t("prompt.fundSuit", f.name, f.risk_level));
});
