/* ai-benchmark.js — P14 SuveooBench 评测看板（免登录）
 * schema v2：九项安全/业务指标实测 + 四模型消融矩阵 + 真实口径数据集；
 * 事实以 docs/test-cases.md、README 指标表与 docs/benchmarks/ 证据库为准。
 * 旧 schema（客户端快照 / 部署窗口）走 renderLegacy 降级路径，保证任何 JSON 代际下页面自洽。 */
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
  document.getElementById("gen-at").textContent = d.generated_at ?? "";
  const v = await S.api.json(`/api/version?r=${Date.now()}`).catch(() => null);
  if (d.schema === 2) renderV2(c, d, v); else renderLegacy(c, d, v);
});

/* 生产模型徽标：以 /api/version 实时为准；仅当实时模型与档案 production.model 一致时才展示接入日期，
 * 不一致时改显档案基线——避免「DeepSeek 徽标 + GLM 接入日期」的张冠李戴（2026-10-22 切档教训） */
function prodBadge(d, v) {
  /* 比对与展示都用 profile（档位名）：/api/version 的 model 字段是底层模型名（deepseek-flash），
   * 与档案 production.model（档位名 deepseek-v4.1-flash）不同串，用 model 比对会误触档案分支 */
  const live = v?.profile ?? v?.model ?? d.production?.model ?? null;
  if (!live) return "";
  const since = d.production?.since;
  const same = !d.production?.model || live === d.production.model;
  const tail = same && since
    ? ` · ${S.fmt.escape(S.t("bench.prodNow"))}（${S.fmt.escape(S.t("bench.prodSince", since))}）`
    : ` · ${S.fmt.escape(S.t("bench.prodNow"))}`;
  const archive = !same && d.production?.model
    ? `<span class="muted small" style="margin-right:10px">${S.fmt.escape(S.t("bench.modelBaseline"))}：${S.fmt.escape(d.production.model)}${since ? `（${S.fmt.escape(S.t("bench.prodSince", since))}）` : ""}</span>`
    : "";
  return `<span class="prod-badge">${S.fmt.escape(live)}${tail}</span>${archive}`;
}

const REPO = "https://github.com/Suveoo/suveoo";
const eviLink = (p) => `<a class="mono" style="font-size:11px;word-break:break-all" href="${REPO}/tree/main/${String(p).replace(/\/+$/, "")}" target="_blank" rel="noopener">${S.fmt.escape(p)}</a>`;
/* 结果列配色：percent===100 绿；null（记录型）中性；其余红（当前数据集不出现，规则兜底）。
 * 分数行 nowrap 防止 "24/24" 被拆行；P3 延迟串（含空格）自然换行，否则会把整列撑宽 */
const resultCell = (m) => `<td class="mono" style="${m.percent === 100 ? "color:var(--color-green);font-weight:600;white-space:nowrap" : m.percent == null ? "font-weight:600" : "color:var(--color-red);font-weight:600;white-space:nowrap"}">${S.fmt.escape(m.result)}</td>`;
/* name/method/note 为 {zh,en}，zh-TW 回落 zh */
const pick = (o) => (!o ? "" : S.i18n.lang === "en-US" ? (o.en ?? o.zh ?? "") : (o.zh ?? o.en ?? ""));

function renderV2(c, d, v) {
  /* ── A 指标实测（四列：指标 | 结果 | 测试方法 | 证据）── */
  const rows = d.metrics.map((m) => `<tr>
    <td><b>${S.fmt.escape(pick(m.name))}</b>${pick(m.note) ? `<div class="muted small" style="margin-top:3px">${S.fmt.escape(pick(m.note))}</div>` : ""}</td>
    ${resultCell(m)}
    <td class="muted small">${S.fmt.escape(pick(m.method))}</td>
    <td>${eviLink(m.evidence)}</td>
  </tr>`).join("");
  c.querySelectorAll(".card")[0].innerHTML = `<div class="table-wrap"><table class="table bench-table bench-metrics"><thead><tr>
    <th>${S.fmt.escape(S.t("bench.metric"))}</th><th>${S.fmt.escape(S.t("bench.result"))}</th><th>${S.fmt.escape(S.t("bench.methodCol"))}</th><th>${S.fmt.escape(S.t("bench.evidence"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + (d.production?.bench ? `<p class="muted small" style="margin:10px 0 0">${S.ui.icon("chart", 13)} ${S.fmt.escape(S.t("bench.prodBench2",
      d.production.bench.source, d.production.bench.date, d.production.bench.cases,
      d.production.bench.first_token_median_s, d.production.bench.total_median_s, d.production.bench.passed))}</p>` : "");

  /* ── B 四模型消融矩阵 ── */
  const models = (d.ablation ?? []).map((x) => x.model);
  const R = { vitest: S.t("bench.rVitest"), s3: S.t("bench.rS3"), s1_auto: S.t("bench.rS1a"), s1_manual: S.t("bench.rS1m"), b1: S.t("bench.rB1") };
  const guardRows = Object.keys(R).map((k) => `<tr><td>${S.fmt.escape(R[k])}</td>
    ${d.ablation.map((x) => `<td class="mono" style="color:var(--color-green);font-weight:600">${S.fmt.escape(x.rows?.[k] ?? "—")}</td>`).join("")}
    <td class="small" style="color:var(--color-green);font-weight:600">${S.fmt.escape(S.t("bench.consistentH"))}</td></tr>`).join("");
  const latRow = (key, label) => `<tr><td>${S.fmt.escape(label)}</td>
    ${d.ablation.map((x) => `<td class="mono">${x[key] != null ? `${Number(x[key]).toFixed(1)}s` : "—"}</td>`).join("")}
    <td class="muted small">${S.fmt.escape(S.t("bench.modelAttr"))}</td></tr>`;
  c.querySelectorAll(".card")[1].innerHTML = `<div class="table-wrap"><table class="table bench-table bench-abl"><thead><tr>
    <th>${S.fmt.escape(S.t("bench.dim"))}</th>${models.map((m) => `<th>${S.fmt.escape(m)}</th>`).join("")}<th>${S.fmt.escape(S.t("bench.consistentH"))}</th></tr></thead><tbody>
    ${guardRows}
    ${latRow("ttft_p50_s", S.t("bench.rTtft"))}
    ${latRow("total_p50_s", S.t("bench.rTotal"))}
  </tbody></table></div>
  <p class="muted small" style="margin:10px 0 0">${S.fmt.escape(S.t("bench.ablNote", d.ablation_meta?.date ?? ""))} <a href="${REPO}/tree/main/${S.fmt.escape((d.ablation_meta?.artifacts ?? "docs/benchmarks/").replace(/\/+$/, ""))}" target="_blank" rel="noopener">${S.fmt.escape(d.ablation_meta?.artifacts ?? "")}</a></p>
  <p style="margin:10px 0 0;font-weight:600">${S.fmt.escape(S.t("bench.ablClaim"))}</p>
  <p style="margin:4px 0 0;font-weight:600;color:var(--color-navy)">${S.fmt.escape(S.t("bench.ablClaim2"))}</p>
  <p class="muted small" style="margin:8px 0 0">${S.fmt.escape(S.t("bench.noGuardArm"))}</p>`;

  /* ── C 测试集规模 ── */
  const s = d.suite ?? {};
  document.getElementById("ds").innerHTML = `
    <div class="grid grid-4">
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${s.files ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.suiteFiles"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${s.cases ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.suiteCases"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${s.attack_assertions ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.suiteAttack"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${s.live_total ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.suiteLive"))}</div></div>
    </div>`;
  const dsNote = document.getElementById("ds-note");
  dsNote.textContent = S.t("bench.suiteNote", s.live_blocking ?? 0, s.live_accuracy ?? 0, s.live_total ?? 0);
  dsNote.style.display = "";

  /* ── D 评测方法 ── */
  document.getElementById("method").innerHTML = `
    <div class="bench-method">
      ${[
        ["chart", S.t("bench.mDs"), `${s.files ?? "—"} ${S.t("bench.suiteFiles")} · ${s.cases ?? "—"} ${S.t("bench.suiteCases")}（unit / integration / attack）`],
        ["shield", S.t("bench.mAttack"), S.t("bench.mAttackBody2", s.attack_assertions ?? 0)],
        ["scale", S.t("bench.mControl"), S.t("bench.mControlBody")],
        ["info", S.t("bench.mScope"), S.t("bench.mScopeBody")],
      ].map(([ic, h, body]) => `<div class="bm-item"><span class="bm-ico">${S.ui.icon(ic, 16)}</span><div><b>${S.fmt.escape(h)}</b><p class="muted small" style="margin:4px 0 0">${S.fmt.escape(body)}</p></div></div>`).join("")}
    </div>
    ${d.production?.note ? `<p class="muted small" style="margin:10px 0 0">${S.fmt.escape(d.production.note)}</p>` : ""}
    ${d.note ? `<p class="muted small" style="margin:6px 0 0">${S.fmt.escape(d.note)}</p>` : ""}`;

  /* 徽标插到指标标题行（gen-at 前） */
  document.getElementById("gen-at").insertAdjacentHTML("beforebegin", prodBadge(d, v));
}

/* ── 旧 schema 降级路径：客户端快照 / 部署窗口的旧 benchmark.json 仍可渲染 ── */
function renderLegacy(c, d, v) {
  const rows = (d.metrics ?? []).map((m) => {
    const safe = m.baseline != null && m.ours != null;
    const color = !safe ? "" : m.ours <= m.baseline ? "var(--color-green)" : "var(--color-red)";
    return `<tr><td>${S.fmt.escape(m.name ?? "")}</td>
      <td class="mono">${safe ? (m.baseline * 100).toFixed(1) : "—"}%</td>
      <td class="mono"${color ? ` style="color:${color};font-weight:600"` : ""}>${safe ? (m.ours * 100).toFixed(1) : "—"}%</td></tr>`;
  }).join("");
  c.querySelectorAll(".card")[0].innerHTML = (d.metrics?.length ? `<div class="table-wrap"><table class="table"><thead><tr>
    <th>${S.fmt.escape(S.t("bench.metric"))}</th><th>${S.fmt.escape(S.t("bench.baseline"))}</th><th>${S.fmt.escape(S.t("bench.ours"))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : S.ui.empty(S.t("common.loadFailed")))
    + (d.production?.bench ? `<p class="muted small" style="margin:10px 0 0">${S.ui.icon("chart", 13)} ${S.fmt.escape(S.t("bench.prodBench", d.production.bench.cases, d.production.bench.first_token_median_s, d.production.bench.p95_s, d.production.bench.passed))}</p>` : "");
  const abl = d.ablation ?? [];
  const series = [{ name: "Baseline", values: abl.map((x) => +((x.baseline ?? 0) * 100).toFixed(1)) }, { name: "Ours", values: abl.map((x) => +((x.ours ?? 0) * 100).toFixed(1)) }];
  c.querySelectorAll(".card")[1].innerHTML = (abl.length ? S.charts.bar(series, { labels: abl.map((x) => x.model) }) : "")
    + (d.production?.note ? `<p class="muted small" style="margin:10px 0 0">${S.fmt.escape(d.production.note)}</p>` : "");
  const ds = d.dataset ?? {};
  document.getElementById("ds").innerHTML = `
    <div class="grid grid-4">
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${ds.cases ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.cases"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${ds.human_curated ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.human"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${ds.attack_cases ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.attack"))}</div></div>
      <div class="center"><div class="mono" style="font-size:28px;font-weight:700">${d.metrics?.length ?? "—"}</div><div class="muted small">${S.fmt.escape(S.t("bench.metricsN"))}</div></div>
    </div>`;
  const dsNote = document.getElementById("ds-note");
  if (ds.cases != null && ds.human_curated != null && ds.attack_cases != null) {
    dsNote.textContent = S.t("bench.dsNote", ds.cases - ds.human_curated - ds.attack_cases);
    dsNote.style.display = "";
  }
  document.getElementById("method").innerHTML = `
    <div class="bench-method">
      ${[
        ["chart", S.t("bench.mDs"), S.t("bench.mDsBody", ds.cases ?? 0, ds.human_curated ?? 0, ds.attack_cases ?? 0)],
        ["shield", S.t("bench.mAttack"), S.t("bench.mAttackBody", ds.attack_cases ?? 0)],
        ["scale", S.t("bench.mControl"), S.t("bench.mControlBody")],
        ["info", S.t("bench.mScope"), S.t("bench.mScopeBody")],
      ].map(([ic, h, body]) => `<div class="bm-item"><span class="bm-ico">${S.ui.icon(ic, 16)}</span><div><b>${S.fmt.escape(h)}</b><p class="muted small" style="margin:4px 0 0">${S.fmt.escape(body)}</p></div></div>`).join("")}
    </div>
    <p class="muted small" style="margin:10px 0 0">${S.fmt.escape(d.note ?? "")}</p>`;
  document.getElementById("gen-at").insertAdjacentHTML("beforebegin", prodBadge(d, v));
}
