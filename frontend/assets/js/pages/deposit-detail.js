/* deposit-detail.js — P18 存款详情（6 页共用） */
S.router.register("deposit-detail", async () => {
  const c = document.getElementById("content");
  const slug = S.depSlug();
  const d = await S.api.json(`/assets/data/deposits/${slug}.json`);
  if (!d) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  c.innerHTML = `<h1>${S.fmt.escape(d.name)}</h1>${S.sim.banner()}
    <div class="card">
      <div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("deps.rate"))}</div>
        <div class="total mono" style="font-size:32px;font-weight:700">${d.rate}%</div></div>
        <div class="muted small">${S.fmt.escape(d.rules)}</div></div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("deps.calc"))}</h2></div>
    <div class="card">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("deps.principal"))}（CNY）</span><input class="input input-lg" id="d-p" value="50000" inputmode="decimal"></label>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.rateTerm"))}</span><span class="v mono">${d.rate}% × ${S.fmt.escape(d.term)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.maturity"))}</span><span class="v mono" id="d-out">—</span></div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("about.rateHistory"))}</h2></div>
    <div class="card"><table class="table"><thead><tr><th>${S.fmt.escape(S.t("common.date"))}</th><th>${S.fmt.escape(S.t("deps.rate"))}</th></tr></thead>
      <tbody>${(d.rate_history ?? []).map((h) => `<tr><td class="mono">${h.date}</td><td class="mono">${h.rate}%</td></tr>`).join("")}</tbody></table></div>
    <div class="row" style="margin-top:16px">
      <button class="btn btn-primary" id="open">${S.fmt.escape(S.t("deps.open"))}（RED）</button>
      <button class="ai-chip" id="ask">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("deps.askBest"))}</button>
    </div>`;
  const calc = () => {
    const p = Number(document.getElementById("d-p").value) || 0;
    const years = slug.includes("3y") ? 3 : slug.includes("1y") ? 1 : slug.includes("6m") ? 0.5 : slug.includes("3m") ? 0.25 : slug === "notice-7d" ? 7 / 365 : 0;
    document.getElementById("d-out").textContent = "¥ " + S.fmt.moneyPlain(p * (1 + (d.rate / 100) * years));
  };
  document.getElementById("d-p").oninput = calc;
  calc();
  document.getElementById("open").onclick = async () => {
    const amount = document.getElementById("d-p").value;
    const r = await S.api.mutate("/api/wealth/purchase", { product_id: "global-money-1", amount });
    if (r.cancelled) return;
    S.ui.toast(r.data?.status === "EXECUTED" ? S.t("common.opOk") : r.data?.reason ?? "failed", r.data?.status !== "EXECUTED");
  };
  document.getElementById("ask").onclick = () => S.router.ai(S.t("prompt.depositCompare"));
});
