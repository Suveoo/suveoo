/* retirement.js — 退休规划器（age,retire,spend,rate,inflation）：所需退休金 + 每月应储蓄 */
S.toolPages = S.toolPages ?? {};
S.toolPages["retirement"] = async (c, opts = {}) => {
  const num = (label, id, val, lg = false) =>
    `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input${lg ? " input-lg" : ""}" id="${id}" value="${val}" inputmode="decimal"></label>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.retireName"))}</h1>
    <div class="card" style="max-width:520px">
      ${num(S.t("tc.ageNow"), "age", "30")}
      ${num(S.t("tc.ageRetire"), "retire", "60")}
      ${num(S.t("tc.monthSpend") + "（CNY）", "spend", "6000", true)}
      ${num(S.t("tc.rate"), "rate", "5")}
      ${num(S.t("tc.inflation"), "inflation", "2.5")}
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.retireAssume"))}<br>${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.needCorpus"))}</div><div class="v total" style="font-size:28px" id="r-corpus">—</div></div>
        <div class="kv"><div class="lb">${S.fmt.escape(S.t("tc.needSave"))}（CNY）</div><div class="v total" style="font-size:28px" id="r-save">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.ageInvalid"))}</div>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  const calc = () => {
    const age = S.toolKit.num("age", c), retire = S.toolKit.num("retire", c), spend = S.toolKit.num("spend", c), rate = S.toolKit.num("rate", c), infl = S.toolKit.num("inflation", c);
    if ([age, retire, spend, rate, infl].some((v) => v == null) || age <= 0 || retire <= age || spend <= 0 || rate < 0 || infl < 0) {
      $("tc-err").hidden = false;
      $("r-corpus").textContent = "—"; $("r-save").textContent = "—";
      return;
    }
    $("tc-err").hidden = true;
    const N = Math.round((retire - age) * 12); // 积累期月数
    const W = 300; // 支取 25 年
    const i = rate / 100 / 12, f = infl / 100 / 12;
    /* 退休时点所需本金：未来 300 个月按今日价月支出随通胀增长支取，支取期月度收益 i */
    let corpus = 0;
    for (let k = 1; k <= W; k++) corpus += (spend * Math.pow(1 + f, k)) / Math.pow(1 + i, k);
    /* 每月储蓄：普通年金终值 = corpus */
    const monthly = i === 0 ? corpus / N : (corpus * i) / (Math.pow(1 + i, N) - 1);
    $("r-corpus").textContent = S.toolKit.fmt(corpus);
    $("r-save").textContent = S.toolKit.fmt(monthly);
  };
  S.toolKit.bind([
    { id: "age", def: "30" }, { id: "retire", def: "60" }, { id: "spend", def: "6000" }, { id: "rate", def: "5" }, { id: "inflation", def: "2.5" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("retirement", async () => { await S.toolPages["retirement"](document.getElementById("content")); });
