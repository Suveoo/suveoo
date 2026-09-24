/* funds.js — P15 全部基金（搜索 + 排序 + 风险 tab；E：近12月收益率大数字主视觉，字段零删减） */
S.router.register("funds", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("funds.title"))}</h1>
    <div class="tabs" id="f-tabs"></div>
    <div class="row" style="gap:8px;margin:12px 0;flex-wrap:wrap">
      <input class="input" id="f-q" placeholder="${S.fmt.escape(S.t("funds.searchPh"))}" style="max-width:260px" aria-label="${S.fmt.escape(S.t("funds.searchPh"))}">
      <span id="f-sort"></span>
    </div><div class="grid grid-2" id="grid">${S.ui.skeleton(4)}</div>`;
  const funds = (await S.fundCache()).filter(Boolean);
  let filter = "ALL";
  let sort = "default";
  const sortSel = S.ctl.select({
    label: S.t("funds.sort"),
    options: [
      { v: "default", label: S.t("funds.sortDefault") },
      { v: "ret6", label: S.t("funds.sort6m") },
      { v: "risk", label: S.t("funds.sortRisk") },
    ],
    value: "default",
    onChange: (v) => { sort = v; render(); },
  });
  sortSel.id = "f-sort";
  document.getElementById("f-sort").replaceWith(sortSel);
  /* E：主数字 = 近12月收益率（大数字+单位小字+涨跌色）；6M/3Y/起购/NAV/资产类别全部保留为次级层级 */
  const card = (f) => {
    const r12 = Number(f.returns["1y"]);
    const up = r12 >= 0;
    return `
    <div class="card fund-card2">
      <div class="row between fc-top"><span class="fc-name"><b>${S.fmt.escape(f.name)}</b>${f.asset_class ? S.ui.badge(f.asset_class, "badge-gray fc-cat") : ""}</span>${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)}</div>
      <div class="muted small mono" style="margin:4px 0 10px">${S.fmt.escape(f.code)} · NAV ${f.nav}</div>
      <div class="fc-hero bg-tint-gold">
        <img class="fc-art" src="/assets/images/illustrations/cat-fund.svg?v=${S.ui.v()}" alt="" loading="lazy">
        <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("wealth.m12"))}${S.fmt.escape(S.t("funds.yield"))}</span>
          <span class="n ${up ? "trend-up" : "trend-down"}">${up ? "+" : ""}${f.returns["1y"]}</span><span class="u ${up ? "trend-up" : "trend-down"}">%</span></div>
        <div class="fc-hero-sub">
          <span>${S.fmt.escape(S.t("wealth.m6"))} <b class="mono ${Number(f.returns["6m"]) >= 0 ? "trend-up" : "trend-down"}">+${f.returns["6m"]}%</b></span>
          ${f.returns["3y"] != null ? `<span>${S.fmt.escape(S.t("funds.m36"))} <b class="mono ${Number(f.returns["3y"]) >= 0 ? "trend-up" : "trend-down"}">+${f.returns["3y"]}%</b></span>` : ""}
          <span>${S.fmt.escape(S.t("funds.minInvest"))} <b class="mono">${S.fmt.escape(f.min_invest)}</b></span>
        </div>
      </div>
      <div class="row" style="margin-top:12px"><a class="btn btn-sm btn-accent-gold" href="/wealth/funds/${f.slug}">${S.fmt.escape(S.t("funds.detail"))}</a></div>
    </div>`;
  };
  const render = () => {
    const q = document.getElementById("f-q").value.trim().toLowerCase();
    let list = funds.filter((f) => filter === "ALL" || Number(f.risk_level) === Number(filter));
    if (q) list = list.filter((f) => `${f.name} ${f.code}`.toLowerCase().includes(q));
    if (sort === "ret6") list = list.slice().sort((a, b) => Number(b.returns["6m"]) - Number(a.returns["6m"]));
    else if (sort === "risk") list = list.slice().sort((a, b) => Number(a.risk_level) - Number(b.risk_level));
    document.getElementById("grid").innerHTML = list.map(card).join("") || S.ui.empty(q ? S.t("funds.noMatch") : S.t("common.noData"));
  };
  document.getElementById("f-tabs").innerHTML = ["ALL", "1", "2", "3", "4", "5"].map((x) =>
    `<button class="tab${x === "ALL" ? " active" : ""}" data-f="${x}">${x === "ALL" ? S.t("common.all") : "R" + x}</button>`).join("");
  S.ui.$$("#f-tabs .tab").forEach((t) => { t.onclick = () => { filter = t.dataset.f; S.ui.$$("#f-tabs .tab").forEach((x) => x.classList.toggle("active", x === t)); render(); }; });
  document.getElementById("f-q").oninput = render;
  render();
});
