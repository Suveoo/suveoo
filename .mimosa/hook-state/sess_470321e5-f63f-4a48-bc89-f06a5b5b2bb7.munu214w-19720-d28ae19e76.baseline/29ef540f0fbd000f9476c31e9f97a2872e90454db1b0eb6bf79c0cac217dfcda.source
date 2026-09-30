/* goal-planner.js — 目标储蓄计划器（target,current,years,rate）：每月需存 + 缺口分析 */
S.toolPages = S.toolPages ?? {};
S.toolPages["goal-planner"] = async (c, opts = {}) => {
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.goalName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.targetAmt") + "（CNY）", "target", "500000", true)}
      ${num(S.t("tc.currentSavings") + "（CNY）", "current", "100000")}
      ${num(S.t("tc.years"), "years", "5")}
      ${num(S.t("tc.rate"), "rate", "3")}
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.needMonthly"))}（CNY）</div><div class="v total" style="font-size:28px" id="r-need">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.projFv"))}</div><div class="v" id="r-fv">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.gap"))}</div><div class="v" id="r-gap">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
      <div id="r-note" style="margin-top:var(--sp-3)"></div>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  const calc = () => {
    const t = S.toolKit.num("target", c), cur = S.toolKit.num("current", c), y = S.toolKit.num("years", c), r = S.toolKit.num("rate", c);
    if ([t, cur, y, r].some((v) => v == null) || t <= 0 || cur < 0 || y <= 0 || r < 0) {
      $("tc-err").hidden = false;
      ["r-need", "r-fv", "r-gap"].forEach((id) => ($(id).textContent = "—"));
      $("r-note").innerHTML = "";
      return;
    }
    $("tc-err").hidden = true;
    const n = Math.max(1, Math.round(y * 12)), i = r / 100 / 12;
    const fv = cur * Math.pow(1 + i, n);
    const gap = t - fv;
    $("r-fv").textContent = S.toolKit.fmt(fv);
    if (gap <= 0) {
      $("r-need").textContent = S.fmt.escape(S.t("tc.reached"));
      $("r-gap").textContent = "¥ 0.00";
      $("r-note").innerHTML = `<div class="banner" style="background:var(--color-green-bg);color:var(--color-green)">${S.ui.icon("check", 16)}<div>${S.fmt.escape(S.t("tc.feasibleOk"))}</div></div>`;
      return;
    }
    const need = i === 0 ? gap / n : (gap * i) / (Math.pow(1 + i, n) - 1);
    $("r-need").textContent = S.toolKit.fmt(need);
    $("r-gap").textContent = S.toolKit.fmt(gap);
    $("r-note").innerHTML = "";
  };
  S.toolKit.bind([
    { id: "target", def: "500000" }, { id: "current", def: "100000" }, { id: "years", def: "5" }, { id: "rate", def: "3" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("goal-planner", async () => { await S.toolPages["goal-planner"](document.getElementById("content")); });
