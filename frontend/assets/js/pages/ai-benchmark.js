/* ai-benchmark.js — P14 SuveooBench 评测看板（免登录） */
S.router.register("ai-benchmark", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("bench.title"))}</h1>${S.sim.banner()}
    <div class="banner">${S.ui.icon("chart", 16)}<div>${S.fmt.escape(S.t("bench.note"))}</div></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.metrics"))}</h2><span class="muted small" id="gen-at"></span></div>
    <div class="card">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.ablation"))}</h2></div>
    <div class="card">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.dataset"))}</h2></div>
    <div class="card" id="ds"></div>`;
  const d = await S.api.json("/assets/data/benchmark.json");
  if (!d) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  document.getElementById("gen-at").textContent = d.generated_at;
  c.querySelectorAll(".card")[0].innerHTML = `<div class="table-wrap"><table class="table"><thead><tr>
    <th>${S.fmt.escape(S.t("bench.metric"))}</th><th>${S.fmt.escape(S.t("bench.baseline"))}</th><th>${S.fmt.escape(S.t("bench.ours"))}</th></tr></thead><tbody>
    ${d.metrics.map((m) => `<tr><td>${S.fmt.escape(m.name)}</td>
      <td class="mono">${(m.baseline * 100).toFixed(1)}%</td>
      <td class="mono" style="color:${m.ours <= m.baseline ? "var(--color-green)" : "var(--color-red)"};font-weight:600">${(m.ours * 100).toFixed(1)}%</td></tr>`).join("")}
    </tbody></table></div>`;
  const series = [{ name: "Baseline", values: d.ablation.map((x) => +(x.baseline * 100).toFixed(1)) }, { name: "Ours", values: d.ablation.map((x) => +(x.ours * 100).toFixed(1)) }];
  c.querySelectorAll(".card")[1].innerHTML = S.charts.bar(series, { labels: d.ablation.map((x) => x.model) });
  document.getElementById("ds").innerHTML = `
    <div class="grid grid-4">
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.cases}</div><div class="muted small">${S.fmt.escape(S.t("bench.cases"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.human_curated}</div><div class="muted small">${S.fmt.escape(S.t("bench.human"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.attack_cases}</div><div class="muted small">${S.fmt.escape(S.t("bench.attack"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">12</div><div class="muted small">${S.fmt.escape(S.t("bench.metricsN"))}</div></div>
    </div>`;
});
