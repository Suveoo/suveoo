/* fx.js — P19 外汇牌价与兑换（2026-09 升级：实时市场汇率（/api/fx，日更数据源+15 分钟缓存），
   回退静态快照；兑换器按银行买/卖价而非中间价换算；手动刷新。） */
S.router.register("fx", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("fx.title"))}</h1>${S.sim.banner()}
    <div class="row between wrap" style="gap:8px;margin:4px 0 8px">
      <span class="muted small" id="upd">…</span>
      <span class="row" style="gap:8px">
        <span class="badge" id="src" style="background:var(--color-primary-tint);color:var(--color-primary)"></span>
        <button class="btn btn-sm btn-light" id="refresh">${S.fmt.escape(S.t("fx.refresh"))}</button>
      </span>
    </div>
    <div class="card" style="margin-top:4px;overflow-x:auto" id="tbl">${S.ui.skeleton(4)}</div>
    <p class="muted small" style="margin-top:8px">${S.fmt.escape(S.t("fx.spreadNote"))}</p>
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
  let fx = { quotes: [] };
  let curSel;
  let dir = "buy";
  const quoteOf = (code) => fx.quotes.find((q) => q.code === code) ?? fx.quotes[0];
  const renderMeta = () => {
    const u = document.getElementById("upd");
    const s = document.getElementById("src");
    if (fx.source === "live") { u.textContent = `${S.t("fx.updated", S.fmt.datetime(fx.updated_at))} · ${fx.provider ?? ""}`; s.textContent = S.t("fx.sourceLive"); }
    else if (fx.source === "fallback") { u.textContent = S.t("fx.updated", S.fmt.datetime(fx.updated_at)); s.textContent = S.t("fx.sourceFallback"); s.style.background = "var(--color-surface)"; s.style.color = "var(--color-ink-2)"; }
    else { u.textContent = S.t("fx.updated", S.fmt.datetime(fx.updated_at)); s.textContent = fx.source ?? ""; }
  };
  const renderTable = () => {
    document.getElementById("tbl").innerHTML = `<table class="table"><thead><tr>
      <th></th><th>${S.fmt.escape(S.t("fx.buy"))}</th><th>${S.fmt.escape(S.t("fx.sell"))}</th><th>${S.fmt.escape(S.t("fx.mid"))}</th><th>7D</th></tr></thead><tbody>
      ${fx.quotes.map((q) => `<tr><td><img class="fx-flag" src="${q.flag}" alt="">${S.fmt.escape(q.name)}</td>
        <td class="mono">${q.buy}</td><td class="mono">${q.sell}</td><td class="mono">${q.mid}</td><td>${S.charts.spark(q.spark, { color: "auto" })}</td></tr>`).join("")}
      </tbody></table>`;
  };
  const buildSelect = () => {
    const fresh = S.ctl.select({
      label: S.t("fx.currency"),
      options: fx.quotes.map((q) => ({ v: q.code, label: `${q.name} (${q.code})` })),
      value: curSel?.value ?? "USD",
    });
    fresh.id = "x-cur";
    fresh.addEventListener("input", calc);
    document.getElementById("x-cur").replaceWith(fresh);
    curSel = fresh;
  };
  const calc = () => {
    if (!curSel) return;
    const amt = Number(document.getElementById("x-amt").value) || 0;
    const q = quoteOf(curSel.value);
    /* 购汇按银行卖出价（sell）、结汇按银行买入价（buy），与真实银行口径一致 */
    const price = Number(dir === "buy" ? q?.sell ?? 1 : q?.buy ?? 1);
    const out = dir === "buy" ? amt / price : amt * price;
    document.getElementById("x-desc").textContent = dir === "buy" ? `${S.fmt.escape(q ? `${q.name} (${q.code})` : "")} @ ${S.fmt.escape(String(dir === "buy" ? q?.sell : q?.buy))} ≈` : `@ ${S.fmt.escape(String(q?.buy ?? ""))} CNY ≈`;
    document.getElementById("x-out").textContent = dir === "buy" ? out.toFixed(2) : "¥ " + S.fmt.moneyPlain(out);
  };
  const load = async (refresh = false) => {
    const r = await fetch(`/api/fx${refresh ? "?refresh=1" : ""}`);
    fx = (await r.json().catch(() => fx)) ?? fx;
    renderMeta();
    renderTable();
    buildSelect();
    calc();
  };
  document.getElementById("refresh").onclick = async () => {
    document.getElementById("refresh").disabled = true;
    await load(true);
    document.getElementById("refresh").disabled = false;
  };
  S.ui.$$("[data-dir]").forEach((t) => { t.onclick = () => { dir = t.dataset.dir; S.ui.$$("[data-dir]").forEach((x) => x.classList.toggle("active", x === t)); calc(); }; });
  document.getElementById("x-amt").oninput = calc;
  document.getElementById("x-go").onclick = async () => {
    const q = quoteOf(curSel.value);
    const body = { direction: dir, currency: curSel.value, amount_cny: document.getElementById("x-amt").value, rate: dir === "buy" ? q?.sell : q?.buy };
    const r = await S.api.mutate("/api/fx/exchange", body);
    if (r.cancelled) return;
    S.ui.toast(r.data?.status === "EXECUTED" ? S.t("common.opOk") : r.data?.reason ?? "failed", r.data?.status !== "EXECUTED");
  };
  await load();
});
