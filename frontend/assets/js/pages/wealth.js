/* wealth.js — P04 财富总览（共享助手见 core/app.js 的 S.wealth/S.fundCache/S.purchaseModal） */
S.router.register("wealth", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("wealth.title"))}</h1>${S.sim.banner()}
    <div class="ai-quick-bar" id="ai-bar"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><span class="grow">${S.fmt.escape(S.t("wealth.aiAsk"))}</span><span class="go">${S.ui.icon("arrow-right", 16)}</span></div>
    <div class="card">${S.ui.skeleton(3)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.funds"))}</h2><a class="more" href="/wealth/funds">${S.fmt.escape(S.t("wealth.allFunds"))} →</a></div>
    <div class="hscroll" id="funds"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.deposits"))}</h2><a class="more" href="/wealth/deposits">${S.fmt.escape(S.t("wealth.allDeposits"))} →</a></div>
    <div class="hscroll deps" id="deps"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.fxQuick"))}</h2><a class="more" href="/wealth/fx">${S.fmt.escape(S.t("wealth.allFx"))} →</a></div>
    <div class="card" id="fx"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.toolHub"))}</h2><a class="more" href="/wealth/tools">${S.fmt.escape(S.t("tc.navTitle"))} →</a></div>
    <div class="tool-grid" id="tool-hub"></div>`;
  document.getElementById("ai-bar").onclick = () => S.router.ai(S.t("prompt.carFund"));
  /* 持仓 */
  const h = await S.api.get("/api/wealth/holdings");
  const hc = c.querySelector(".card");
  if (h.ok) {
    const list = h.data.holdings ?? [];
    const total = list.reduce((a, x) => a + Number(x.value ?? x.amount ?? 0), 0);
    hc.innerHTML = `<div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("wealth.holdings"))}</div>
      <div class="total mono" style="font-size:32px;font-weight:700">¥ ${S.fmt.moneyPlain(total)}</div></div>
      <button class="btn btn-light" id="redeem-all" ${total ? "" : "disabled"}>${S.fmt.escape(S.t("wealth.redeem"))}（RED）</button></div>
      ${list.map((x) => `<div class="list-row"><div class="grow"><b>${S.fmt.escape(x.name ?? x.fund)}</b>
        <div class="muted small">${S.ui.badge("R" + (x.risk_level ?? "?"), "risk-R" + (x.risk_level ?? 1))} NAV ${x.nav ?? "—"} · ${S.fmt.escape(S.t("wealth.cost"))} ¥${S.fmt.moneyPlain(x.amount ?? 0)}</div></div>
        <div class="amt mono">¥${S.fmt.moneyPlain(x.value ?? x.amount ?? 0)}</div></div>`).join("") || `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`}`;
    const ra = document.getElementById("redeem-all");
    if (ra && total) ra.onclick = async () => {
      for (const x of list) {
        if (!(Number(x.value ?? x.amount) > 0)) continue; /* 0 值持仓不发起赎回（否则多弹一张无意义确认卡） */
        const r = await S.api.mutate("/api/wealth/redeem", { product_id: x.fund, amount: "ALL" }, { subject: x.name ?? x.fund });
        if (r.cancelled) return;
        if (r.data?.status !== "EXECUTED") { S.ui.toast(r.data?.reason ?? "failed", true); return; }
      }
      S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800);
    };
  }
  /* 基金 / 存款 / 外汇（设计语言现代化：品类插画 + 大数字主视觉，字段零删减） */
  const funds = (await S.fundCache()).filter(Boolean);
  document.getElementById("funds").innerHTML = funds.slice(0, 5).map((f) => `
    <div class="fund-card">
      <div class="fname">${S.fmt.escape(f.name)}</div>
      <div style="margin:8px 0">${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)} <span class="muted small mono">NAV ${f.nav}</span></div>
      <div class="fc-mini bg-tint-gold"><img class="fc-art-sm" src="/assets/images/illustrations/cat-fund.svg?v=${S.ui.v()}" alt="" loading="lazy">
        <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("wealth.m12"))}${S.fmt.escape(S.t("funds.yield"))}</span><span class="n trend-up" style="font-size:22px">+${f.returns["1y"]}</span><span class="u trend-up">%</span></div></div>
      <div class="row between" style="margin-top:8px"><div><div class="muted small">${S.fmt.escape(S.t("wealth.m6"))}</div><div class="fret">+${f.returns["6m"]}%</div></div>
      <div style="text-align:right"><div class="muted small">${S.fmt.escape(S.t("funds.minInvest"))}</div><div class="mono small" style="font-weight:600">${S.fmt.escape(f.min_invest)}</div></div></div>
      <div class="row" style="margin-top:10px"><a class="btn btn-sm btn-light" href="/wealth/funds/${f.slug}">${S.fmt.escape(S.t("funds.detail"))}</a>
      <button class="ai-chip ask" data-q="${S.fmt.escape(S.t("wealth.suitPrompt", f.name))}">${S.ui.icon("ai", 12)} AI</button></div>
    </div>`).join("");
  const deps = (await Promise.all(["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)))).filter(Boolean);
  document.getElementById("deps").innerHTML = deps.map((d) => `
    <div class="fund-card">
      <div class="fname">${S.fmt.escape(d.name)}</div>
      <div class="fc-mini bg-tint-teal" style="margin:8px 0"><img class="fc-art-sm" src="/assets/images/illustrations/cat-deposit.svg?v=${S.ui.v()}" alt="" loading="lazy">
        <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("deps.rate"))}</span><span class="n tx-teal" style="font-size:22px">${d.rate}</span><span class="u tx-teal">%</span></div></div>
      <div class="muted small">${S.fmt.escape(d.term)} · ${S.fmt.escape(S.t("deps.minFrom", d.min))}</div>
      <a class="btn btn-sm btn-light" style="margin-top:10px" href="/wealth/deposits/${d.slug}">${S.fmt.escape(S.t("deps.detail"))}</a>
    </div>`).join("");
  const fx = (await (await fetch("/api/fx")).json().catch(() => null)) ?? { quotes: [] }; /* 实时牌价（服务端带静态回退） */
  document.getElementById("fx").innerHTML = fx.quotes.slice(0, 4).map((q) => `
    <div class="list-row"><img class="fx-flag" src="${q.flag}" alt=""> <b>${S.fmt.escape(q.name)}</b>
      <span class="grow"></span><span class="mono">${q.mid}</span> ${S.charts.spark(q.spark, { color: "auto" })}</div>`).join("");
  S.ui.$$(".ask").forEach((b) => { b.onclick = () => S.router.ai(b.dataset.q); });
  /* 金融计算工具入口卡（目录见 core/app.js 的 S.toolCatalog） */
  document.getElementById("tool-hub").innerHTML = S.toolCatalog.map((t) => S.toolCard(t)).join("");
});
