/* deposit-detail.js — P18 存款详情（6 页共用）
   "存入"按 slug 映射底层产品做模拟申购（活期/通知→货币基金类，定期→对应期限产品），
   确认卡标题为"确认存入"并显示实际产品名；适当性不匹配时提前提示（服务端仍会拦截）。
   2026-09 升级：计息/支取/转存/存款保障条款、单利 vs 月复利对照、通胀调整后实际购买力、阶梯策略。 */
S.wealth = S.wealth ?? {};
S.wealth.DEPOSIT_PRODUCT = {
  "demand": "global-money-1",    /* 活期 → 货币基金 R1 */
  "notice-7d": "global-money-1", /* 通知存款 → 货币基金 R1 */
  "term-3m": "global-short-bond",/* 3 个月 → 环球短债 R1 */
  "term-6m": "esg-bond",         /* 6 个月 → ESG 债 R2 */
  "term-1y": "global-mixed-1",   /* 1 年 → 多元资产 R3 */
  "term-3y": "global-mixed-2",   /* 3 年 → 多元资产 R4（PR<4 将被适当性拦截） */
};
const DEP_INFLATION = 2.0; /* 实际购买力折算的年通胀假设（%），口径与通胀计算工具一致 */
S.router.register("deposit-detail", async () => {
  const c = document.getElementById("content");
  const slug = S.depSlug();
  const d = await S.api.json(`/assets/data/deposits/${slug}.json`);
  if (!d) { c.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const productId = S.wealth.DEPOSIT_PRODUCT[slug] ?? "global-money-1";
  const fund = await S.api.json(`/assets/data/funds/${productId}.json`);
  const pr = (await S.auth.session())?.pr_level ?? 3;
  const mismatch = fund && Number(fund.risk_level) > Number(pr);
  c.innerHTML = `<h1>${S.fmt.escape(d.name)}</h1>
    ${mismatch ? `<div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("wealth.riskMismatch", fund.risk_level, pr))}</div></div>` : ""}
    <div class="card">
      <div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("deps.rate"))}</div>
        <div class="total mono" style="font-size:32px;font-weight:700">${d.rate}%</div></div>
        <div class="muted small" style="text-align:right">${S.fmt.escape(d.rules)}</div></div>
      <table class="table" style="margin-top:12px"><tbody>
        <tr><td class="muted">${S.fmt.escape(S.t("deps.intType"))}</td><td style="text-align:right">${S.fmt.escape(d.interest_type ?? "—")}</td></tr>
        <tr><td class="muted">${S.fmt.escape(S.t("deps.withdrawal"))}</td><td style="text-align:right">${S.fmt.escape(d.withdrawal ?? "—")}</td></tr>
        <tr><td class="muted">${S.fmt.escape(S.t("deps.autoRenew"))}</td><td style="text-align:right">${d.auto_renew ? S.fmt.escape(S.t("deps.support")) : S.fmt.escape(S.t("deps.notSupport"))}</td></tr>
        <tr><td class="muted">${S.fmt.escape(S.t("deps.insurance"))}</td><td style="text-align:right" class="small">${S.fmt.escape(d.insurance ?? "")}</td></tr></tbody></table>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("deps.calc"))}</h2></div>
    <div class="card">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("deps.principal"))}（CNY）</span><input class="input input-lg" id="d-p" value="50000" inputmode="decimal"></label>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.rateTerm"))}</span><span class="v mono">${d.rate}% × ${S.fmt.escape(d.term)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.maturity"))}（${S.fmt.escape(S.t("deps.simpleInterest"))}）</span><span class="v mono" id="d-out">—</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.compoundIf"))}</span><span class="v mono" id="d-comp">—</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("deps.realValue"))}</span><span class="v mono" id="d-real">—</span></div>
      <div class="field-hint">${S.fmt.escape(S.t("deps.realValueNote", DEP_INFLATION))}</div>
    </div>
    <div class="card card-surface" style="margin-top:16px">
      <div class="row"><span class="avatar">${S.ui.icon("chart", 14)}</span><b class="small">${S.fmt.escape(S.t("deps.ladder"))}</b></div>
      <p class="small muted" style="margin:8px 0 0;line-height:1.7">${S.fmt.escape(d.ladder ?? "")}</p>
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
    const simple = p * (1 + (d.rate / 100) * years);
    const comp = p * Math.pow(1 + (d.rate / 100) / 12, years * 12);
    const real = p * (1 + (d.rate / 100) * years) / Math.pow(1 + DEP_INFLATION / 100, years);
    document.getElementById("d-out").textContent = "¥ " + S.fmt.moneyPlain(simple);
    document.getElementById("d-comp").textContent = "¥ " + S.fmt.moneyPlain(comp) + "（+¥" + S.fmt.moneyPlain(comp - simple) + "）";
    document.getElementById("d-real").textContent = "¥ " + S.fmt.moneyPlain(real);
  };
  document.getElementById("d-p").oninput = calc;
  calc();
  document.getElementById("open").onclick = async () => {
    const amount = document.getElementById("d-p").value;
    const openBtn = document.getElementById("open");
    S.ui.btnBusy(openBtn, true); /* 开立按钮 loading（第六十一轮）；执行段覆盖层由 mutate 统一提供 */
    try {
      const r = await S.api.mutate("/api/wealth/purchase", { product_id: productId, amount }, { action: "deposit", subject: fund?.name ?? `${d.name}（模拟申购）` });
      if (r.cancelled) return;
      S.ui.toast(r.data?.status === "EXECUTED" ? S.t("common.opOk") : S.fmt.blockedMsg(r), r.data?.status !== "EXECUTED");
    } finally {
      S.ui.btnBusy(openBtn, false);
    }
  };
  document.getElementById("ask").onclick = () => S.router.ai(S.t("prompt.depositCompare"));
});
