/* dashboard.js — P27 仪表盘（自研 SVG 图表 + AI 解读） */
S.router.register("dashboard", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="ai-quick-bar" id="ai-bar"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><span class="grow">${S.fmt.escape(S.t("dash.aiRead"))}</span><span class="go">${S.ui.icon("arrow-right", 16)}</span></div>
    <div class="card" id="ai-read">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.trend"))}</h2></div>
    <div class="card chart-box" id="d-trend">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.cat"))}</h2></div>
    <div class="card" id="d-cat">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.inout"))}</h2></div>
    <div class="card chart-box" id="d-inout">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.anomaly"))}</h2></div>
    <div class="card" id="anomaly"></div>`;
  document.getElementById("ai-bar").onclick = () => S.router.ai(S.t("prompt.monthlyInsight"));
  const r = await S.api.get("/api/dashboard");
  if (!r.ok) return;
  const d = r.data;
  const ins = await S.api.get("/api/dashboard/insight");
  document.getElementById("ai-read").innerHTML = ins.ok
    ? `<div class="insight-card"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><div><b>${S.fmt.escape(S.t("dash.aiRead"))}</b>
       ${(ins.data.insights ?? []).map((t) => `<p class="muted small" style="margin-top:4px">· ${S.fmt.escape(t)}</p>`).join("")}</div></div>` : "";
  /* 支出分类 → 桑基 */
  const palette = ["#1E2A78", "#3A4FA5", "#5B7C99", "#7A6A53", "#2C6E63", "#A44A3F", "#666B8F", "#8C8C9A"];
  const cats = (d.by_category ?? []).map((x, i) => ({ label: x.category, value: Number(x.total) / 100, color: palette[i % 8] }));
  document.getElementById("d-cat").innerHTML = S.charts.donut(cats);
  /* 月度收支 → 柱状 */
  const months = {};
  for (const row of d.monthly ?? []) (months[row.m] ??= { in: 0, out: 0 })[row.direction === "IN" ? "in" : "out"] = Number(row.total) / 100;
  const mKeys = Object.keys(months).sort();
  document.getElementById("d-inout").innerHTML = S.charts.bar(
    [{ name: "IN", values: mKeys.map((m) => months[m].in) }, { name: "OUT", values: mKeys.map((m) => months[m].out) }],
    { labels: mKeys.map((m) => m.slice(2)) });
  /* 资产趋势（近似：按月净流入累加，起点取 overview） */
  const ov = await S.api.get("/api/overview");
  let base = Number(ov.data?.total_assets ?? 1e6);
  const series = [];
  for (let i = mKeys.length - 1; i >= 0; i--) { series.unshift(base); base -= months[mKeys[i]].in - months[mKeys[i]].out; }
  document.getElementById("d-trend").innerHTML = S.charts.line(series, { labels: mKeys.map((m) => m.slice(2)) });
  /* 异常 */
  document.getElementById("anomaly").innerHTML = (d.anomalies ?? []).map((t) => `
    <div class="list-row">${S.ui.badge("!", "badge-red")}
      <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "")}</b><div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.category ?? "")}</div></div>
      <div class="amt mono">¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div></div>`).join("") || `<div class="muted small">—</div>`;
});
