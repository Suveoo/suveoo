/* deposits.js — P17 全部存款方案（六方案卡片 + 本金联动到期本息对比表，复用 deposit-compare 口径） */
S.router.register("deposits", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("deps.title"))}</h1>${S.sim.banner()}<div class="grid grid-2" id="grid">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("deps.compare"))}</h2><a class="more" href="/wealth/tools/deposit-compare">${S.fmt.escape(S.t("tc.depName"))} →</a></div>
    <div class="card">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.principal"))}（CNY）</span><input class="input input-lg" id="d-cmp-p" value="50000" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.useMonths"))}</span><input class="input" id="d-cmp-m" value="12" inputmode="numeric"></label>
      <div id="d-cmp-tbl"></div>
      <div class="field-err" id="d-cmp-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
    </div>`;
  const deps = (await Promise.all(["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)))).filter(Boolean);
  const grid = document.getElementById("grid");
  if (!deps.length) { grid.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  grid.innerHTML = deps.map((d) => `
    <div class="card">
      <div class="row between"><b>${S.fmt.escape(d.name)}</b><span class="fret">${d.rate}%</span></div>
      <div class="muted small" style="margin:6px 0">${S.fmt.escape(S.t("deps.term"))}：${S.fmt.escape(d.term)} · ${S.fmt.escape(S.t("deps.minFrom", d.min))}</div>
      <div class="muted small">${S.fmt.escape(d.rules)}</div>
      <a class="btn btn-sm btn-light" style="margin-top:10px" href="/wealth/deposits/${d.slug}">${S.fmt.escape(S.t("deps.detail"))}</a>
    </div>`).join("");
  /* 对比表：与 deposit-compare 工具同口径（期限内滚动存满整期 + 剩余按活期） */
  const TERM_M = { demand: 0, "notice-7d": 7 / 30, "term-3m": 3, "term-6m": 6, "term-1y": 12, "term-3y": 36 };
  const demandRate = Number(deps.find((d) => d.slug === "demand")?.rate ?? 0);
  const horizonValue = (p, P, M) => {
    const T = TERM_M[p.slug] ?? 0;
    if (!T) return P * (1 + (p.rate / 100) * (M / 12));
    if (T > M) return null;
    const n = Math.floor(M / T), rem = M - n * T;
    return P * Math.pow(1 + (p.rate / 100) * (T / 12), n) * (1 + (demandRate / 100) * (rem / 12));
  };
  const calc = () => {
    const P = Number(document.getElementById("d-cmp-p").value) || 0;
    const M = Number(document.getElementById("d-cmp-m").value) || 0;
    const err = document.getElementById("d-cmp-err");
    if (P <= 0 || M < 1) { err.hidden = false; document.getElementById("d-cmp-tbl").innerHTML = ""; return; }
    err.hidden = true;
    document.getElementById("d-cmp-tbl").innerHTML = `<table class="table"><thead><tr>
      <th>${S.fmt.escape(S.t("tc.plan"))}</th><th>${S.fmt.escape(S.t("deps.rate"))}</th><th>${S.fmt.escape(S.t("tc.maturity"))}</th><th></th></tr></thead><tbody>
      ${deps.map((d) => {
        const T = TERM_M[d.slug] ?? 0;
        const fits = T <= M;
        const hv = horizonValue(d, P, M);
        return `<tr><td>${S.fmt.escape(d.name)}</td><td class="mono">${d.rate}%</td>
          <td class="mono total">${fits && hv != null ? S.fmt.moneyPlain(hv) : "—"}</td>
          <td>${fits ? `<span class="badge" style="background:var(--color-green-bg);color:var(--color-green)">${S.fmt.escape(S.t("tc.fitsIn"))}</span>` : `<span class="badge" style="background:var(--color-surface);color:var(--color-ink-2)">${S.fmt.escape(S.t("tc.overTerm"))}</span>`}</td></tr>`;
      }).join("")}</tbody></table>`;
  };
  document.getElementById("d-cmp-p").oninput = calc;
  document.getElementById("d-cmp-m").oninput = calc;
  calc();
});
