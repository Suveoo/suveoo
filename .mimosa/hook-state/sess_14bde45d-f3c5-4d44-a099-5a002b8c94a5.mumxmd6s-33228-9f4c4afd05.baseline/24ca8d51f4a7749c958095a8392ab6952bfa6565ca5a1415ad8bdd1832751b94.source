/* loan-compare.js — 贷款对比计算器（amount,rate,years）：等额本息 vs 等额本金 */
S.router.register("loan-compare", async () => {
  const c = document.getElementById("content");
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.loanName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.loanAmount") + "（CNY）", "amount", "1000000", true)}
      ${num(S.t("tc.rate"), "rate", "3.1")}
      ${num(S.t("tc.years"), "years", "30")}
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="tc-duo">
      <div class="card">
        <h2 style="font-size:var(--fs-16);margin-bottom:var(--sp-3)">${S.fmt.escape(S.t("tc.annuity"))}</h2>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.monthPay"))}</span><span class="v mono total" style="font-size:22px;font-weight:700" id="a-pay">—</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.totalInterest"))}</span><span class="v mono" id="a-int">—</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.totalRepay"))}</span><span class="v mono" id="a-total">—</span></div>
      </div>
      <div class="card">
        <h2 style="font-size:var(--fs-16);margin-bottom:var(--sp-3)">${S.fmt.escape(S.t("tc.straight"))}</h2>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.firstMonth"))}</span><span class="v mono total" style="font-size:22px;font-weight:700" id="s-first">—</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.lastMonth"))}</span><span class="v mono" id="s-last">—</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.totalInterest"))}</span><span class="v mono" id="s-int">—</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.totalRepay"))}</span><span class="v mono" id="s-total">—</span></div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--sp-4)">
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.interestDiff"))}（${S.fmt.escape(S.t("tc.annuity"))}）</span><span class="v mono" id="diff" style="color:var(--color-red)">—</span></div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.payCurve"))}</h2></div>
    <div class="tc-duo">
      <div class="card" id="curve-a"></div>
      <div class="card" id="curve-s"></div>
    </div>
    ${S.sim.footnote()}`;
  const $ = (id) => document.getElementById(id);
  const calc = () => {
    const A = S.toolKit.num("amount"), r = S.toolKit.num("rate"), y = S.toolKit.num("years");
    if ([A, r, y].some((v) => v == null) || A <= 0 || r < 0 || y <= 0) {
      $("tc-err").hidden = false;
      ["a-pay", "a-int", "a-total", "s-first", "s-last", "s-int", "s-total", "diff"].forEach((id) => ($(id).textContent = "—"));
      $("curve-a").innerHTML = ""; $("curve-s").innerHTML = "";
      return;
    }
    $("tc-err").hidden = true;
    const n = Math.max(1, Math.round(y * 12)), i = r / 100 / 12;
    /* 等额本息 */
    const annPay = i === 0 ? A / n : (A * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    const annTotal = annPay * n;
    /* 等额本金 */
    const prin = A / n;
    const first = prin + A * i, last = prin + prin * i;
    const sIntTotal = A * i * (n + 1) / 2;
    $("a-pay").textContent = S.toolKit.fmt(annPay);
    $("a-int").textContent = S.toolKit.fmt(annTotal - A);
    $("a-total").textContent = S.toolKit.fmt(annTotal);
    $("s-first").textContent = S.toolKit.fmt(first);
    $("s-last").textContent = S.toolKit.fmt(last);
    $("s-int").textContent = S.toolKit.fmt(sIntTotal);
    $("s-total").textContent = S.toolKit.fmt(A + sIntTotal);
    $("diff").textContent = S.toolKit.fmt(annTotal - A - sIntTotal);
    /* 两条月供曲线（采样到 ≤121 点） */
    const take = Math.max(1, Math.ceil(n / 120));
    const aSeries = [], sSeries = [], labels = [];
    for (let k = 1; k <= n; k += take) {
      aSeries.push(annPay);
      sSeries.push(prin + (A - (k - 1) * prin) * i);
      labels.push(String(Math.round(k / 12)));
    }
    $("curve-a").innerHTML = S.charts.line(aSeries, { color: "#1E2A78", labels });
    $("curve-s").innerHTML = S.charts.line(sSeries, { color: "#1F7A4D", labels });
  };
  S.toolKit.bind([
    { id: "amount", def: "1000000" }, { id: "rate", def: "3.1" }, { id: "years", def: "30" },
  ], calc);
});
