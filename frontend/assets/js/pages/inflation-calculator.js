/* inflation-calculator.js — 通胀购买力计算器（amount,inflation,years）：购买力侵蚀曲线 */
S.router.register("inflation-calculator", async () => {
  const c = document.getElementById("content");
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.inflName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("common.total") + "（CNY）", "amount", "100000", true)}
      ${num(S.t("tc.inflation"), "inflation", "2.5")}
      ${num(S.t("tc.years"), "years", "20")}
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.futurePower"))}</div><div class="v total" style="font-size:28px" id="r-power">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.equivalent"))}</div><div class="v" id="r-eq">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.erosion"))}</div><div class="v" id="r-loss">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.powerCurve"))}</h2></div>
    <div class="card" id="curve"></div>
    ${S.sim.footnote()}`;
  const $ = (id) => document.getElementById(id);
  const calc = () => {
    const a = S.toolKit.num("amount"), x = S.toolKit.num("inflation"), y = S.toolKit.num("years");
    if ([a, x, y].some((v) => v == null) || a <= 0 || x < 0 || y <= 0) {
      $("tc-err").hidden = false;
      ["r-power", "r-eq", "r-loss"].forEach((id) => ($(id).textContent = "—"));
      $("curve").innerHTML = "";
      return;
    }
    $("tc-err").hidden = true;
    const g = Math.pow(1 + x / 100, y);
    const power = a / g;
    $("r-power").textContent = S.toolKit.fmt(power);
    $("r-eq").textContent = S.toolKit.fmt(a * g);
    $("r-loss").textContent = ((1 - 1 / g) * 100).toFixed(2) + "%（" + S.toolKit.fmt(a - power) + "）";
    const yrs = Math.max(1, Math.round(y));
    const pts = [], labels = [];
    for (let k = 0; k <= yrs; k++) { pts.push(a / Math.pow(1 + x / 100, k)); labels.push(String(k)); }
    $("curve").innerHTML = S.charts.line(pts, { color: "#C0392B", labels });
  };
  S.toolKit.bind([
    { id: "amount", def: "100000" }, { id: "inflation", def: "2.5" }, { id: "years", def: "20" },
  ], calc);
});
