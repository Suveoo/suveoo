/* budget-allocator.js — 预算分配器（income,needs,wants,save）：50/30/20 三区分配 + 环形图 */
S.toolPages = S.toolPages ?? {};
S.toolPages["budget-allocator"] = async (c, opts = {}) => {
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.budgetName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.income") + "（CNY）", "income", "12000", true)}
      <div class="row" style="gap:var(--sp-3)">
        <div class="grow">${num(S.t("tc.needsRatio"), "needs", "50")}</div>
        <div class="grow">${num(S.t("tc.wantsRatio"), "wants", "30")}</div>
        <div class="grow">${num(S.t("tc.saveRatio"), "save", "20")}</div>
      </div>
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.budgetNote"))}<br>${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.needsAmt"))}</div><div class="v total" style="font-size:28px" id="r-needs">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.wantsAmt"))}</div><div class="v" id="r-wants">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.saveAmt"))}</div><div class="v" id="r-save">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.ratioWarn", "—"))}</div>
      <div id="donut" style="margin-top:var(--sp-4)"></div>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  const calc = () => {
    const inc = S.toolKit.num("income", c), n = S.toolKit.num("needs", c), w = S.toolKit.num("wants", c), s = S.toolKit.num("save", c);
    const sum = n != null && w != null && s != null ? Math.round((n + w + s) * 10) / 10 : null;
    if (inc == null || sum == null || inc <= 0 || n < 0 || w < 0 || s < 0) {
      $("tc-err").hidden = false; $("tc-err").textContent = S.t("tc.invalid");
      ["r-needs", "r-wants", "r-save"].forEach((id) => ($(id).textContent = "—"));
      $("donut").innerHTML = "";
      return;
    }
    if (sum !== 100) {
      $("tc-err").hidden = false; $("tc-err").textContent = S.t("tc.ratioWarn", sum);
      ["r-needs", "r-wants", "r-save"].forEach((id) => ($(id).textContent = "—"));
      $("donut").innerHTML = "";
      return;
    }
    $("tc-err").hidden = true;
    const needs = (inc * n) / 100, wants = (inc * w) / 100, save = (inc * s) / 100;
    $("r-needs").textContent = S.toolKit.fmt(needs);
    $("r-wants").textContent = S.toolKit.fmt(wants);
    $("r-save").textContent = S.toolKit.fmt(save);
    $("donut").innerHTML = S.charts.donut([
      { label: S.t("tc.needsAmt"), value: needs, color: "#1E2A78" },
      { label: S.t("tc.wantsAmt"), value: wants, color: "#B7C0E8" },
      { label: S.t("tc.saveAmt"), value: save, color: "#1F7A4D" },
    ], { size: 200 });
  };
  S.toolKit.bind([
    { id: "income", def: "12000" }, { id: "needs", def: "50" }, { id: "wants", def: "30" }, { id: "save", def: "20" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("budget-allocator", async () => { await S.toolPages["budget-allocator"](document.getElementById("content")); });
