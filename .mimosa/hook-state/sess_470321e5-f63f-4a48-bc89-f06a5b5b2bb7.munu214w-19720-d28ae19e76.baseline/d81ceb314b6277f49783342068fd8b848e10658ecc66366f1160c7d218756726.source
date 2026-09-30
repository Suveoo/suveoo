/* credit-payoff.js — 信用卡还款计算器（debt,apr,monthly 或 months 反推） */
S.toolPages = S.toolPages ?? {};
S.toolPages["credit-payoff"] = async (c, opts = {}) => {
  const num = (label, id, val, lg = false, hint = "") =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal" ${hint ? `placeholder="${S.fmt.escape(hint)}"` : ""}></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.creditName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.debt") + "（CNY）", "debt", "12000", true)}
      ${num(S.t("tc.apr"), "apr", "18")}
      ${num(S.t("tc.payMonthly") + "（CNY）", "monthly", "1200")}
      ${num(S.t("tc.orMonths"), "months", "", false, "12")}
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.reverseHint"))}<br>${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.payoffMonths"))}</div><div class="v total" style="font-size:28px" id="r-months">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.payMonthly"))}</div><div class="v" id="r-pay">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.totalInterest"))}</div><div class="v" id="r-int">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
      <div id="r-warn" style="margin-top:var(--sp-3)"></div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.progress"))}</h2></div>
    <div class="card">
      <div class="tc-bar"><i class="p-p" id="bar-p" style="width:0%"></i><i class="p-i" id="bar-i" style="width:0%"></i></div>
      <div class="row between">
        <span class="small"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-navy);margin-right:6px"></i>${S.fmt.escape(S.t("tc.principalPart"))} <b class="mono" id="v-p">—</b></span>
        <span class="small"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#B7C0E8;margin-right:6px"></i>${S.fmt.escape(S.t("tc.interestPart"))} <b class="mono" id="v-i">—</b></span>
      </div>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  const simulate = (debt, i, pay) => { // 返回 {months,totalInterest} 或 null（永远还不清）
    let bal = debt, int = 0;
    for (let m = 1; m <= 1200; m++) {
      const add = bal * i;
      int += add;
      bal = bal + add - pay;
      if (bal <= 0.005) return { months: m, totalInterest: int };
    }
    return null;
  };
  const calc = () => {
    const d = S.toolKit.num("debt", c), apr = S.toolKit.num("apr", c), mPay = S.toolKit.num("monthly", c), mTar = S.toolKit.num("months", c);
    if (d == null || apr == null || d <= 0 || apr < 0) { $("tc-err").hidden = false; reset(); return; }
    if (mPay != null && mPay < 0) { $("tc-err").hidden = false; reset(); return; }
    if (mTar != null && mTar <= 0) { $("tc-err").hidden = false; reset(); return; }
    if (mPay == null && mTar == null) { $("tc-err").hidden = false; reset(); return; }
    $("tc-err").hidden = true;
    const i = apr / 100 / 12;
    let pay, res;
    if (mPay != null && mPay > 0) {
      pay = mPay;
      res = simulate(d, i, pay);
    } else {
      pay = i === 0 ? d / mTar : (d * i) / (1 - Math.pow(1 + i, -mTar));
      res = simulate(d, i, pay);
    }
    $("r-warn").innerHTML = "";
    if (!res) {
      $("r-months").textContent = "—";
      $("r-pay").textContent = S.toolKit.fmt(pay);
      $("r-int").textContent = "—";
      $("r-warn").innerHTML = `<div class="tc-warn">${S.ui.icon("info", 16)}<div>${S.fmt.escape(S.t("tc.minPayWarn", S.toolKit.fmt(d * i)))}</div></div>`;
      $("bar-p").style.width = "0%"; $("bar-i").style.width = "0%";
      $("v-p").textContent = "—"; $("v-i").textContent = "—";
      return;
    }
    const totalPaid = d + res.totalInterest;
    $("r-months").textContent = S.t("tc.monthsFmt", res.months, (res.months / 12).toFixed(1));
    $("r-pay").textContent = S.toolKit.fmt(pay);
    $("r-int").textContent = S.toolKit.fmt(res.totalInterest);
    $("bar-p").style.width = ((d / totalPaid) * 100).toFixed(1) + "%";
    $("bar-i").style.width = ((res.totalInterest / totalPaid) * 100).toFixed(1) + "%";
    $("v-p").textContent = S.toolKit.fmt(d);
    $("v-i").textContent = S.toolKit.fmt(res.totalInterest);
  };
  const reset = () => {
    ["r-months", "r-pay", "r-int", "v-p", "v-i"].forEach((id) => ($(id).textContent = "—"));
    $("bar-p").style.width = "0%"; $("bar-i").style.width = "0%"; $("r-warn").innerHTML = "";
  };
  S.toolKit.bind([
    { id: "debt", def: "12000" }, { id: "apr", def: "18" }, { id: "monthly", def: "1200" }, { id: "months", def: "" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("credit-payoff", async () => { await S.toolPages["credit-payoff"](document.getElementById("content")); });
