/* ai-benchmark.js — P14 SuveooBench 评测看板（免登录；含评测方法章节，事实以 docs/test-cases.md 与 benchmark.json 为准） */
S.router.register("ai-benchmark", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("bench.title"))}</h1>
    <div class="banner" style="margin-top:14px">${S.ui.icon("chart", 16)}<div>${S.fmt.escape(S.t("bench.note"))}</div></div>
    <div class="section-title" style="flex-wrap:wrap;row-gap:4px"><h2>${S.fmt.escape(S.t("bench.metrics"))}</h2><span class="muted small" id="gen-at" style="flex:none;max-width:100%;overflow:hidden;text-overflow:ellipsis"></span></div>
    <div class="card">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.ablation"))}</h2></div>
    <div class="card">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.dataset"))}</h2></div>
    <div class="card" id="ds"></div>
    <p class="muted small" id="ds-note" style="display:none;margin:8px 0 10px"></p>
    <div class="section-title"><h2>${S.fmt.escape(S.t("bench.method"))}</h2></div>
    <div class="card" id="method"></div>`;
  const d = await S.api.json("/assets/data/benchmark.json");
  if (!d) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  document.getElementById("gen-at").textContent = d.generated_at;
  /* 当前生产模型徽标：以 /api/version 实时为准（第十一期模型档位切换后静态 benchmark.json 的 production 字段会滞后）；
     历史接入日期仍取 production.since；version 拉取失败回落静态字段（随机参数防 HTTP 启发式缓存） */
  const v = await S.api.json(`/api/version?r=${Date.now()}`);
  const liveModel = v?.model ?? d.production?.model ?? null;
  if (liveModel) document.getElementById("gen-at").insertAdjacentHTML("beforebegin",
    `<span class="prod-badge">${S.fmt.escape(liveModel)}<span class="muted" style="font-weight:400"> · ${S.fmt.escape(S.t("bench.prodNow"))}${d.production?.since ? `（${S.fmt.escape(d.production.since)} 接入）` : ""}</span></span>`);
  c.querySelectorAll(".card")[0].innerHTML = `<div class="table-wrap"><table class="table"><thead><tr>
    <th>${S.fmt.escape(S.t("bench.metric"))}</th><th>${S.fmt.escape(S.t("bench.baseline"))}</th><th>${S.fmt.escape(S.t("bench.ours"))}</th></tr></thead><tbody>
    ${d.metrics.map((m) => `<tr><td>${S.fmt.escape(m.name)}</td>
      <td class="mono">${(m.baseline * 100).toFixed(1)}%</td>
      <td class="mono" style="color:${m.ours <= m.baseline ? "var(--color-green)" : "var(--color-red)"};font-weight:600">${(m.ours * 100).toFixed(1)}%</td></tr>`).join("")}
    </tbody></table></div>`
    /* 生产模型 GLM 实测基线（production.bench，2026-09-21 ai-bench 真跑数据；缺字段时不渲染） */
    + (d.production?.bench ? `<p class="muted small" style="margin:10px 0 0">${S.ui.icon("chart", 13)} ${S.fmt.escape(S.t("bench.prodBench", d.production.bench.cases, d.production.bench.first_token_median_s, d.production.bench.p95_s, d.production.bench.passed))}</p>` : "");
  const series = [{ name: "Baseline", values: d.ablation.map((x) => +(x.baseline * 100).toFixed(1)) }, { name: "Ours", values: d.ablation.map((x) => +(x.ours * 100).toFixed(1)) }];
  c.querySelectorAll(".card")[1].innerHTML = S.charts.bar(series, { labels: d.ablation.map((x) => x.model) })
    + (d.production?.note ? `<p class="muted small" style="margin:10px 0 0">${S.fmt.escape(d.production.note)}</p>` : "");
  document.getElementById("ds").innerHTML = `
    <div class="grid grid-4">
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.cases}</div><div class="muted small">${S.fmt.escape(S.t("bench.cases"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.human_curated}</div><div class="muted small">${S.fmt.escape(S.t("bench.human"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.dataset.attack_cases}</div><div class="muted small">${S.fmt.escape(S.t("bench.attack"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.metrics.length}</div><div class="muted small">${S.fmt.escape(S.t("bench.metricsN"))}</div></div>
    </div>`;
  /* "程序化生成"说明移出数据卡（卡内只留四个大数字）——置卡下方独立一行 */
  const dsNote = document.getElementById("ds-note");
  dsNote.textContent = S.t("bench.dsNote", d.dataset.cases - d.dataset.human_curated - d.dataset.attack_cases);
  dsNote.style.display = "";
  /* 评测方法：条目卡阵列（手机单列 / 平板起两列）——此前 kv 键值横排长文本在窄屏拥挤换行 */
  document.getElementById("method").innerHTML = `
    <div class="bench-method">
      ${[
        ["chart", S.t("bench.mDs"), S.t("bench.mDsBody", d.dataset.cases, d.dataset.human_curated, d.dataset.attack_cases)],
        ["shield", S.t("bench.mAttack"), S.t("bench.mAttackBody", d.dataset.attack_cases)],
        ["scale", S.t("bench.mControl"), S.t("bench.mControlBody")],
        ["info", S.t("bench.mScope"), S.t("bench.mScopeBody")],
      ].map(([ic, h, body]) => `<div class="bm-item"><span class="bm-ico">${S.ui.icon(ic, 16)}</span><div><b>${S.fmt.escape(h)}</b><p class="muted small" style="margin:4px 0 0">${S.fmt.escape(body)}</p></div></div>`).join("")}
    </div>
    <p class="muted small" style="margin:10px 0 0">${S.fmt.escape(d.note ?? "")}</p>`;
});
