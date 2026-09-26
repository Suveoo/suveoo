/* wealth.js — P04 财富总览（共享助手见 core/app.js 的 S.wealth/S.fundCache/S.purchaseModal） */
S.router.register("wealth", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("wealth.title"))}</h1>
    <div class="ai-quick-bar" id="ai-bar"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><span class="grow"></span><span class="go">${S.ui.icon("arrow-right", 16)}</span></div>
    <div class="card">${S.ui.skeleton(3)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.funds"))}</h2><a class="more" href="/wealth/funds">${S.fmt.escape(S.t("wealth.allFunds"))} →</a></div>
    <div class="hscroll" id="funds"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.deposits"))}</h2><a class="more" href="/wealth/deposits">${S.fmt.escape(S.t("wealth.allDeposits"))} →</a></div>
    <div class="hscroll deps" id="deps"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.fxQuick"))}</h2><a class="more" href="/wealth/fx">${S.fmt.escape(S.t("wealth.allFx"))} →</a></div>
    <div class="card" id="fx"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.toolHub"))}</h2><a class="more" href="/wealth/tools">${S.fmt.escape(S.t("tc.navTitle"))} →</a></div>
    <div class="tool-grid" id="tool-hub"></div>`;
  /* AI 快捷条（第七期大扫除）：默认中性能力句按日轮换；持仓数据到位且有持仓时升级为数据驱动句
     （"我当前的持仓"是本页真实持有的）。点按发送的即所见句，不编"5 万闲钱买车"类情境。 */
  let aiSentence = "";
  const setAsk = (s) => {
    aiSentence = s;
    const span = document.querySelector("#ai-bar .grow");
    if (span) span.textContent = S.t("wealth.askPrefix", s);
  };
  setAsk([S.t("wealth.askIdle"), S.t("wealth.askRisk")][Math.floor(Date.now() / 86400_000) % 2]);
  document.getElementById("ai-bar").onclick = () => { if (aiSentence) S.router.ai(aiSentence); };
  /* 持仓 */
  const h = await S.api.get("/api/wealth/holdings");
  if (h.ok && (h.data.holdings ?? []).length) setAsk(S.t("wealth.askHold"));
  const hc = c.querySelector(".card");
  if (h.ok) {
    const list = h.data.holdings ?? [];
    const total = list.reduce((a, x) => a + Number(x.value ?? x.amount ?? 0), 0);
    /* 持仓折叠（第四十二轮）：>3 项先收 3 行 + 展开钮——多持仓用户不必长滚才见产品区；
       赎回全部按钮退役（真银行无此设计），逐项赎回移入 /wealth/my 我的持仓页 */
    const HOLDING_PREVIEW = 3;
    const renderHoldings = (expanded) => {
      const shown = expanded ? list : list.slice(0, HOLDING_PREVIEW);
      hc.innerHTML = `<div class="row between wh-total-row"><div><div class="muted small">${S.fmt.escape(S.t("wealth.holdings"))}</div>
      <div class="total mono wh-total">¥ ${S.fmt.moneyPlain(total)}</div></div>
      <a class="btn btn-light wh-manage" href="/wealth/my">${S.fmt.escape(S.t("wealth.manage"))} →</a></div>
      ${shown.map((x) => `<div class="list-row"><div class="grow"><b>${S.fmt.escape(x.name ?? x.fund)}</b>
        <div class="muted small">${S.ui.badge("R" + (x.risk_level ?? "?"), "risk-R" + (x.risk_level ?? 1))} NAV ${x.nav ?? "—"} · ${S.fmt.escape(S.t("wealth.cost"))} ¥${S.fmt.moneyPlain(x.amount ?? 0)}</div></div>
        <div class="amt mono">¥${S.fmt.moneyPlain(x.value ?? x.amount ?? 0)}</div></div>`).join("") || `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`}
      ${list.length > HOLDING_PREVIEW ? `<button class="btn btn-ghost btn-block wh-expand" style="margin-top:10px">${S.fmt.escape(expanded ? S.t("wealth.collapse") : S.t("wealth.expand", list.length - HOLDING_PREVIEW))}</button>` : ""}`;
      const ex = hc.querySelector(".wh-expand");
      if (ex) ex.onclick = () => renderHoldings(!expanded);
    };
    renderHoldings(false);
  }
  /* 基金 / 存款 / 外汇（设计语言现代化：品类插画 + 大数字主视觉，字段零删减）
     第九期 NAV 实时化：热门条 NAV 叠加实时值（实时/闭市徽标随行） */
  const [funds, liveNavs] = await Promise.all([
    S.fundCache(),
    S.api.get("/api/wealth/funds-navs").catch(() => null),
  ]);
  const lv = liveNavs?.ok ? liveNavs.data : null;
  const fundsOk = funds.filter(Boolean);
  if (lv?.funds) {
    for (const f of fundsOk) {
      const v = lv.funds[f.slug];
      if (v?.nav != null) { f.nav = v.nav; f.day_change = v.day_change; f._lv = v; }
    }
  }
  document.getElementById("funds").innerHTML = fundsOk.slice(0, 5).map((f) => `
    <div class="fund-card">
      <div class="fname">${S.fmt.escape(f.name)}</div>
      <div style="margin:8px 0">${S.ui.badge("R" + f.risk_level, "risk-R" + f.risk_level)} <span class="muted small mono">NAV ${f.nav}</span> ${S.fundLiveMeta(f._lv, lv?.as_of)}</div>
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
