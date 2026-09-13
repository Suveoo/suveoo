/* funds.js — P15 全部基金 */
S.router.register("funds", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("funds.title"))}</h1>${S.sim.banner()}
    <div class="tabs" id="f-tabs"></div><div class="grid grid-2" id="grid">${S.ui.skeleton(4)}</div>`;
  const funds = (await S.fundCache()).filter(Boolean);
  let filter = "ALL";
  const render = () => {
    const list = funds.filter((f) => filter === "ALL" || Number(f.risk_level) === Number(filter));
    document.getElementById("grid").innerHTML = list.map((f) => `
      <div class="card">
        <div class="row between"><b>${S.fmt.escape(f.name)}</b>${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)}</div>
        <div class="muted small mono" style="margin:4px 0 8px">${S.fmt.escape(f.code)} · NAV ${f.nav}</div>
        <div class="row between">
          <div><div class="muted small">${S.fmt.escape(S.t("wealth.m6"))}</div><div class="fret">+${f.returns["6m"]}%</div></div>
          <div><div class="muted small">${S.fmt.escape(S.t("wealth.m12"))}</div><div class="fret">+${f.returns["1y"]}%</div></div>
          <div style="text-align:right"><div class="muted small">${S.fmt.escape(S.t("funds.minInvest"))}</div><div class="mono">${S.fmt.escape(f.min_invest)}</div></div>
        </div>
        <div class="row" style="margin-top:12px"><a class="btn btn-sm btn-light" href="/wealth/funds/${f.slug}">${S.fmt.escape(S.t("funds.detail"))}</a></div>
      </div>`).join("") || S.ui.empty(S.t("common.noData"));
  };
  document.getElementById("f-tabs").innerHTML = ["ALL", "1", "2", "3", "4", "5"].map((x) =>
    `<button class="tab${x === "ALL" ? " active" : ""}" data-f="${x}">${x === "ALL" ? S.t("common.all") : "R" + x}</button>`).join("");
  S.ui.$$("#f-tabs .tab").forEach((t) => { t.onclick = () => { filter = t.dataset.f; S.ui.$$("#f-tabs .tab").forEach((x) => x.classList.toggle("active", x === t)); render(); }; });
  render();
});
