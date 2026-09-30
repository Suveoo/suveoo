/* fx-convert.js — 外汇兑换计算器（dir=buy/sell,ccy,amount）：十币种买卖价双向换算 + 点差 */
S.toolPages = S.toolPages ?? {};
S.toolPages["fx-convert"] = async (c, opts = {}) => {
  const fx = (await (await fetch("/api/fx")).json().catch(() => null)) ?? { quotes: [] }; /* 实时牌价（服务端带静态回退） */
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.fxName"))}</h1>
    <div class="card" style="max-width:520px">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.direction"))}</span>
        <span id="dir"></span></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.currency"))}</span><span id="ccy"></span></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.amount"))}</span><input class="input input-lg" id="amount" value="1000" inputmode="decimal"></label>
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tools.result"))}</h2></div>
    <div class="card">
      <div class="tc-result">
        <div class="kv"><div class="lb" id="r-label">${S.fmt.escape(S.t("tc.fxResult"))}</div><div class="v total" style="font-size:28px" id="r-out">—</div></div>
      </div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.rateUsed"))}</span><span class="v mono" id="r-rate">—</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tc.spread"))}</span><span class="v mono" id="r-spread">—</span></div>
      <p class="muted small" style="margin:12px 0 0">${S.fmt.escape(S.t("tc.spreadNote"))}${fx.quotes.some((q) => q.code === "JPY") ? " " + S.fmt.escape(S.t("tc.fxNote100")) : ""}</p>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  const dirSel = S.ctl.select({ label: S.t("tc.direction"), options: [{ v: "buy", label: S.t("tc.fxDirBuy") }, { v: "sell", label: S.t("tc.fxDirSell") }], value: "buy" });
  dirSel.id = "dir";
  $("dir").replaceWith(dirSel);
  const ccySel = S.ctl.select({ label: S.t("tc.currency"), options: fx.quotes.map((q) => ({ v: q.code, label: `${q.name}（${q.code}）` })), value: "USD" });
  ccySel.id = "ccy";
  $("ccy").replaceWith(ccySel);
  const calc = () => {
    const dir = $("dir").value, code = $("ccy").value, amt = S.toolKit.num("amount", c);
    const q = fx.quotes.find((x) => x.code === code);
    if (!q || amt == null || amt <= 0) { $("tc-err").hidden = false; $("r-out").textContent = "—"; return; }
    $("tc-err").hidden = true;
    const per100 = code === "JPY"; // 日元牌价为每 100 日元
    const rate = Number(dir === "buy" ? q.sell : q.buy);
    const spread = Number(q.sell) - Number(q.buy);
    let out, unit;
    if (dir === "buy") { // 购汇：CNY → 外币，按银行卖出价
      out = per100 ? (amt / rate) * 100 : amt / rate;
      unit = code;
      $("r-label").textContent = S.t("tc.fxDirBuy");
    } else { // 结汇：外币 → CNY，按银行买入价
      out = per100 ? (amt * rate) / 100 : amt * rate;
      unit = "CNY";
      $("r-label").textContent = S.t("tc.fxDirSell");
    }
    $("r-out").textContent = out.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + unit;
    $("r-rate").textContent = `${dir === "buy" ? q.sell : q.buy}（${code}${per100 ? "/100" : ""} → CNY，${dir === "buy" ? "sell" : "buy"}）`;
    $("r-spread").textContent = spread.toFixed(4);
  };
  S.toolKit.bind([
    { id: "dir", def: "buy" }, { id: "ccy", def: "USD" }, { id: "amount", def: "1000" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("fx-convert", async () => { await S.toolPages["fx-convert"](document.getElementById("content")); });
