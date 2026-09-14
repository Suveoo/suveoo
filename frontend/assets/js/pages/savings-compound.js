/* savings-compound.js — 复利储蓄计算器（principal,rate,years,monthly,freq） */
S.router.register("savings-compound", async () => {
  const c = document.getElementById("content");
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.savingsName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.principal") + "（CNY）", "principal", "100000", true)}
      ${num(S.t("tc.rate"), "rate", "3")}
      ${num(S.t("tc.years"), "years", "5")}
      ${num(S.t("tc.monthlyAdd") + "（CNY）", "monthly", "2000")}
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.freq"))}</span>
        <select class="input" id="freq">
          <option value="12" selected>${S.fmt.escape(S.t("tc.freqMonth"))}</option>
          <option value="4">${S.fmt.escape(S.t("tc.freqQuarter"))}</option>
          <option value="1">${S.fmt.escape(S.t("tc.freqYear"))}</option>
        </select></label>
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.finalValue"))}</div><div class="v total" style="font-size:28px" id="r-fv">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.totalInterest"))}</div><div class="v" id="r-int">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.totalIn"))}</div><div class="v" id="r-in">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.curve"))}</h2></div>
    <div class="card" id="curve"></div>
    ${S.sim.footnote()}`;
  const $ = (id) => document.getElementById(id);
  const calc = () => {
    const p = S.toolKit.num("principal"), r = S.toolKit.num("rate"), y = S.toolKit.num("years"), m = S.toolKit.num("monthly");
    const f = Number($("freq").value) || 12;
    if ([p, r, y, m].some((v) => v == null) || p < 0 || r < 0 || y < 0 || m < 0 || f < 1) {
      $("tc-err").hidden = false;
      ["r-fv", "r-int", "r-in"].forEach((id) => ($(id).textContent = "—"));
      $("curve").innerHTML = "";
      return;
    }
    $("tc-err").hidden = true;
    const months = Math.max(1, Math.round(y * 12));
    const step = 12 / f; // 每个复利周期的月数
    const g = 1 + r / 100 / f;
    let bal = p;
    const series = [p];
    for (let k = 1; k <= months; k++) {
      bal += m; // 月初追加
      if (k % step === 0) bal *= g; // 周期末结息
      series.push(bal);
    }
    const totalIn = p + m * months;
    $("r-fv").textContent = S.toolKit.fmt(bal);
    $("r-int").textContent = S.toolKit.fmt(bal - totalIn);
    $("r-in").textContent = S.toolKit.fmt(totalIn);
    /* 采样到 ≤121 点，横轴按年标注 */
    const take = Math.max(1, Math.ceil(series.length / 121));
    const pts = series.filter((_, i) => i % take === 0 || i === series.length - 1);
    const labels = pts.map((_, i) => `${Math.round((i * take) / 12)}`);
    $("curve").innerHTML = S.charts.line(pts, { color: "#1E2A78", labels });
  };
  S.toolKit.bind([
    { id: "principal", def: "100000" }, { id: "rate", def: "3" }, { id: "years", def: "5" },
    { id: "monthly", def: "2000" }, { id: "freq", def: "12" },
  ], calc);
});
