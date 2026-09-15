/* fx.js — P19 外汇牌价与兑换 */
S.router.register("fx", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("fx.title"))}</h1>${S.sim.banner()}
    <div class="muted small" id="upd"></div>
    <div class="card" style="margin-top:8px;overflow-x:auto">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("fx.converter"))}</h2></div>
    <div class="card" style="max-width:520px">
      <div class="tabs"><button class="tab active" data-dir="buy">${S.fmt.escape(S.t("fx.dirBuy"))}</button><button class="tab" data-dir="sell">${S.fmt.escape(S.t("fx.dirSell"))}</button></div>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("fx.cny"))}</span><input class="input input-lg" id="x-amt" value="1000" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("fx.currency"))}</span><span id="x-cur"></span></label>
      <div class="gc-kv"><span class="muted" id="x-desc">—</span><span class="v mono" id="x-out">—</span></div>
      <button class="btn btn-primary btn-block" style="margin-top:12px" id="x-go">${S.fmt.escape(S.t("fx.exchange"))}</button>
      <div class="progressbar" style="margin-top:14px"><i style="width:34%"></i></div>
      <div class="muted small" style="margin-top:4px">${S.fmt.escape(S.t("fx.quota"))} · ${S.fmt.escape(S.t("fx.quotaUsed"))}</div>
    </div>`;
  const fx = (await S.api.json("/assets/data/fx.json")) ?? { quotes: [] };
  document.getElementById("upd").textContent = S.t("fx.updated", S.fmt.datetime(fx.updated_at));
  c.querySelector(".card").innerHTML = `<table class="table"><thead><tr>
    <th></th><th>${S.fmt.escape(S.t("fx.buy"))}</th><th>${S.fmt.escape(S.t("fx.sell"))}</th><th>${S.fmt.escape(S.t("fx.mid"))}</th><th>7D</th></tr></thead><tbody>
    ${fx.quotes.map((q) => `<tr><td><img class="fx-flag" src="${q.flag}" alt="">${S.fmt.escape(q.name)}</td>
      <td class="mono">${q.buy}</td><td class="mono">${q.sell}</td><td class="mono">${q.mid}</td><td>${S.charts.spark(q.spark, { color: "auto" })}</td></tr>`).join("")}
    </tbody></table>`;
  const curSel = S.ctl.select({
    label: S.t("fx.currency"),
    options: fx.quotes.map((q) => ({ v: q.code, label: `${q.name} (${q.code})` })),
    value: "USD",
  });
  curSel.id = "x-cur";
  document.getElementById("x-cur").replaceWith(curSel);
  const quoteOf = (code) => fx.quotes.find((q) => q.code === code) ?? fx.quotes[0];
  let dir = "buy";
  S.ui.$$("[data-dir]").forEach((t) => { t.onclick = () => { dir = t.dataset.dir; S.ui.$$("[data-dir]").forEach((x) => x.classList.toggle("active", x === t)); calc(); }; });
  const calc = () => {
    const amt = Number(document.getElementById("x-amt").value) || 0;
    const q = quoteOf(curSel.value);
    const mid = Number(q?.mid ?? 1);
    const out = dir === "buy" ? amt / mid : amt * mid;
    document.getElementById("x-desc").textContent = dir === "buy" ? `${S.fmt.escape(q ? `${q.name} (${q.code})` : "")} ≈` : "CNY ≈";
    document.getElementById("x-out").textContent = dir === "buy" ? out.toFixed(2) : "¥ " + S.fmt.moneyPlain(out);
  };
  document.getElementById("x-amt").oninput = calc;
  curSel.addEventListener("input", calc);
  calc();
  document.getElementById("x-go").onclick = async () => {
    const body = { direction: dir, currency: curSel.value, amount_cny: document.getElementById("x-amt").value };
    const r = await S.api.mutate("/api/fx/exchange", body);
    if (r.cancelled) return;
    S.ui.toast(r.data?.status === "EXECUTED" ? S.t("common.opOk") : r.data?.reason ?? "failed", r.data?.status !== "EXECUTED");
  };
});
