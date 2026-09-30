/* dashboard.js — P27 仪表盘（自研 SVG 图表 + AI 解读） */
S.router.register("dashboard", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="card" id="ai-read">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.trend"))}</h2></div>
    <div class="card chart-box" id="d-trend">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.cat"))}</h2></div>
    <div class="card" id="d-cat">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.inout"))}</h2></div>
    <div class="card chart-box" id="d-inout">${S.ui.skeleton(1)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("dash.anomaly"))}</h2></div>
    <div class="card" id="anomaly"></div>`;
  /* 原 ai-quick-bar 入口条与卡标题同名重复（第四十五轮）：入口并入卡标题行——
     "本月解读"胶囊发 prompt.monthlyInsight 原文；任一 API 失败也保底渲染标题+入口 */
  const rhead = () => `<div class="dash-rhead"><b>${S.fmt.escape(S.t("dash.aiRead"))}</b><button class="dash-rgo" id="dash-rgo" type="button">${S.fmt.escape(S.t("dash.readBtn"))}${S.ui.icon("enter", 14)}</button></div>`;
  const rheadOnly = () => {
    document.getElementById("ai-read").innerHTML = `<div class="insight-card rows-live"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><div>${rhead()}</div></div>`;
    document.getElementById("dash-rgo").onclick = () => S.router.ai(S.t("prompt.monthlyInsight"));
  };
  const r = await S.api.get("/api/dashboard");
  if (!r.ok) { rheadOnly(); return; }
  const d = r.data;
  const ins = await S.api.get("/api/dashboard/insight");
  document.getElementById("ai-read").innerHTML = `<div class="insight-card rows-live"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><div>${rhead()}
     ${(ins.ok ? ins.data.insights ?? [] : []).map((t) => `<p class="muted small insight-li" style="margin-top:6px" role="button" tabindex="0" data-q="${S.fmt.escape(t)}">${S.fmt.escape(t)}${S.ui.icon("enter", 14)}</p>`).join("")}</div></div>`;
  document.getElementById("dash-rgo").onclick = () => S.router.ai(S.t("prompt.monthlyInsight"));
  /* 行即入口（与 /home AI 洞察同款）：整行可点击 → 第一人称原文发 Suveoo AI */
  S.ui.$$("#ai-read .insight-li").forEach((p) => {
    const ask = () => S.router.ai(S.t("home.insightAsk", p.dataset.q));
    p.onclick = ask;
    p.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ask(); } };
  });
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
