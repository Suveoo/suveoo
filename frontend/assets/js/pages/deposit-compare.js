/* deposit-compare.js — 存款方案对比器（principal,months）：六方案到期本息 + 短期/长期推荐 */
S.toolPages = S.toolPages ?? {};
S.toolPages["deposit-compare"] = async (c, opts = {}) => {
  const TERM_M = { demand: 0, "notice-7d": 7 / 30, "term-3m": 3, "term-6m": 6, "term-1y": 12, "term-3y": 36 };
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.depName"))}</h1>
    <div class="card" style="max-width:520px">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.principal"))}（CNY）</span><input class="input input-lg" id="principal" value="50000" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.useMonths"))}</span><input class="input" id="months" value="12" inputmode="numeric"></label>
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.depNote"))}<br>${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card" id="reco">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.maturity"))}</h2></div>
    <div class="card" id="tbl">${S.ui.skeleton(4)}</div>
    <div class="field-err" id="tc-err" hidden style="margin-top:8px">${S.fmt.escape(S.t("tc.invalid"))}</div>`;
  const $ = (id) => c.querySelector("#" + id);
  const deps = (await S.depCache()).filter(Boolean);
  const demandRate = Number(deps.find((d) => d.slug === "demand")?.rate ?? 0);
  /* 期限（月）内滚动存满整期、剩余月数按活期计息的到期本息 */
  const horizonValue = (p, P, M) => {
    const T = TERM_M[p.slug] ?? 0;
    if (!T) return P * (1 + (p.rate / 100) * (M / 12)); // 活期随取
    if (T > M) return null;
    const n = Math.floor(M / T), rem = M - n * T;
    return P * Math.pow(1 + (p.rate / 100) * (T / 12), n) * (1 + (demandRate / 100) * (rem / 12));
  };
  const calc = () => {
    const P = S.toolKit.num("principal", c), M = S.toolKit.num("months", c);
    if (P == null || M == null || P <= 0 || M < 1) { $("tc-err").hidden = false; return; }
    $("tc-err").hidden = true;
    const rows = deps.map((d) => ({ d, fits: (TERM_M[d.slug] ?? 0) <= M, hv: horizonValue(d, P, M) }));
    /* 4 列（badge 并入方案列）：手机端 CSS 卡片化（第三十七轮修窄屏挤压——5 列在 390px 数字换行/贴边） */
    $("tbl").innerHTML = `<div class="dc-tbl"><table class="table"><thead><tr><th>${S.fmt.escape(S.t("tc.plan"))}</th><th>${S.fmt.escape(S.t("deps.term"))}</th><th>${S.fmt.escape(S.t("deps.rate"))}</th><th>${S.fmt.escape(S.t("tc.maturity"))}</th></tr></thead><tbody>
      ${rows.map(({ d, fits }) => {
        const T = TERM_M[d.slug] ?? 0;
        const mat = P * (1 + (d.rate / 100) * (T ? T / 12 : M / 12));
        const badge = fits ? `<span class="badge" style="background:var(--color-green-bg);color:var(--color-green)">${S.fmt.escape(S.t("tc.fitsIn"))}</span>` : `<span class="badge" style="background:var(--color-surface);color:var(--color-ink-2)">${S.fmt.escape(S.t("tc.overTerm"))}</span>`;
        return `<tr>
        <td class="dc-name"><b>${S.fmt.escape(d.name)}</b> ${badge}</td>
        <td data-lb="${S.fmt.escape(S.t("deps.term"))}">${S.fmt.escape(d.term)}</td>
        <td data-lb="${S.fmt.escape(S.t("deps.rate"))}" class="mono">${d.rate}%</td>
        <td data-lb="${S.fmt.escape(S.t("tc.maturity"))}" class="mono total">${S.toolKit.fmt(mat)}</td>
      </tr>`;
      }).join("")}</tbody></table></div>`;
    /* 短期推荐 = 用款期内到期本息最高；长期推荐 = 年化最高（超出用款期则标注） */
    const fitting = rows.filter((r) => r.fits && r.hv != null);
    const shortPick = fitting.slice().sort((a, b) => b.hv - a.hv)[0];
    const longPick = rows.slice().sort((a, b) => b.d.rate - a.d.rate)[0];
    $("reco").innerHTML = `
      <div class="gc-kv tk-reco"><span class="muted">${S.fmt.escape(S.t("tc.recoShort"))} · ${S.fmt.escape(S.t("tc.mFmt", Math.round(M)))}</span>
        <span class="v mono total">${S.fmt.escape(shortPick?.d.name ?? "—")} · ${shortPick ? S.toolKit.fmt(shortPick.hv) : "—"}</span></div>
      <div class="gc-kv tk-reco"><span class="muted">${S.fmt.escape(S.t("tc.recoLong"))} · ${S.fmt.escape(S.t("tc.annualized"))}</span>
        <span class="v mono">${S.fmt.escape(longPick?.d.name ?? "—")} · ${longPick ? longPick.d.rate + "%" : "—"}${longPick && !longPick.fits ? ` <span class="muted small">（${S.fmt.escape(S.t("tc.overTerm"))}）</span>` : ""}</span></div>`;
  };
  S.toolKit.bind([
    { id: "principal", def: "50000" }, { id: "months", def: "12" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("deposit-compare", async () => { await S.toolPages["deposit-compare"](document.getElementById("content")); });
