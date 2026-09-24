/* home.js — P01 主页（第二十三轮 A：hero 极简化——仅保留全宽胶囊输入条，删海军蓝大容器与建议 chips；
   情境产品卡 + 本月收支 + 既有区块零删减） */
S.router.register("home", async ({ user }) => {
  const c = document.getElementById("content");
  const q = new URLSearchParams(location.search).get("q");
  if (q) { S.router.ai(q); return; }
  c.innerHTML = `
    <div class="hero-input" id="hero-input">
      <img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt="">
      <input id="hero-q" placeholder="${S.fmt.escape(S.t("home.heroPlaceholder"))}">
      <button class="voice-btn" id="hero-mic" type="button">${S.ui.icon("mic", 16)}</button>
    </div>
    <div id="promo" style="margin-top:16px"></div>
    <div class="card assets-block" style="margin-top:16px" id="assets"><div id="assets-main"><div class="skeleton" style="width:38%;height:14px;margin-bottom:10px"></div><div class="skeleton" style="width:60%;height:34px;margin-bottom:10px"></div><div class="skeleton" style="width:44%;height:12px"></div></div><div id="cashflow"></div></div>
    <div class="card svc-card" style="margin-top:16px"><h2 class="svc-h">${S.fmt.escape(S.t("home.services"))}</h2><div class="svc-grid" id="services"></div></div>
    <div class="card" id="insight" style="margin-top:16px"><div class="skeleton" style="width:38%;height:14px;margin-bottom:10px"></div><div class="skeleton" style="width:92%;height:12px;margin-bottom:8px"></div><div class="skeleton" style="width:80%;height:12px"></div></div>
    <div class="brand-banner" style="margin-top:16px">
      <img class="bb-art" src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt="" loading="lazy">
      <div class="bb-text"><h2>Suveoo</h2><p>${S.fmt.escape(S.t("about.intro"))}</p>
      <a class="btn btn-light" href="/about">${S.fmt.escape(S.t("home.aboutBtn"))}</a></div>
    </div>`;
  /* hero 输入条：Enter 提交 + 语音按钮（识别结果填框，不自动发送——用户核对后再回车） */
  const go = () => { const v = document.getElementById("hero-q").value.trim(); if (v) S.router.ai(v); };
  document.getElementById("hero-input").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  S.voice.bind(document.getElementById("hero-mic"), document.getElementById("hero-q"));
  /* services：多彩渐变宫格（第二十三轮 D 升级 ic-*；第二十四轮补记：未开放的跨行/跨境退役，
     补预约转账（赛题核心场景）与交易记录；七族轮转同族不相邻，按使用频率排序） */
  const svc = [
    ["/transfer/intrabank", "ic-pay-sky", S.t("pay.intrabank")],
    ["/transfer/intrabank-scheduled", "ic-clock-teal", S.t("pay.scheduled")],
    ["/account/transactions", "ic-chart-violet", S.t("pay.txHistory")],
    ["/pay/bills", "ic-doc-orange", S.t("home.billsShort")],
    ["/account/cards", "ic-card-navy", S.t("acct.grid.cards")],
    ["/wealth/funds", "ic-wealth-gold", S.t("wealth.funds").replace("Suveoo ", "")],
    ["/wealth/deposits", "ic-bank-teal", S.t("deps.title")],
    ["/wealth/fx", "ic-exchange-rose", S.t("wealth.allFx")],
    ["/transfer/payees", "ic-star-orange", S.t("payees.title")],
    ["/pay/subscriptions", "ic-bell-violet", S.t("subs.title")],
    ["/account/security", "ic-shield-navy", S.t("acct.security")],
    ["/account/downloads", "ic-download-sky", S.t("acct.downloads")],
  ];
  document.getElementById("services").innerHTML = svc.map(([href, ic, label]) =>
    `<a class="svc-item" href="${href}"><span class="qi-wrap">${S.ui.icon(ic, 30)}</span><span class="svc-label">${S.fmt.escape(label)}</span></a>`).join("");

  /* 情境产品卡（未登录/无命中 → 通用卡；规则见 core/insights.js，零 LLM） */
  const promoEl = document.getElementById("promo");
  const art = (p) => p ? `<img class="pc-art" src="${p}?v=${S.ui.v()}" alt="" loading="lazy">` : "";
  /* promo 无插画时的彩色图标回退：规则引擎 icon 名 → ic-* 彩族（navy 徽标压住彩色渐变卡最稳） */
  const promoIc = { trend: "ic-trend-teal", card: "ic-card-rose", doc: "ic-doc-sky", ai: "ic-ai-navy", star: "ic-star-gold" };
  const iconArt = (ic) => `<span class="pc-ico">${S.ui.icon(promoIc[ic] ?? "ic-ai-navy", 40)}</span>`;
  const renderPromo = (it) => {
    const grad = { orange: "bg-grad-orange", gold: "bg-grad-gold", violet: "bg-grad-violet", teal: "bg-grad-teal", rose: "bg-grad-rose", sky: "bg-grad-sky" }[it.tone] ?? "bg-grad-navy";
    promoEl.innerHTML = `<div class="promo-card ${grad}" id="pc-${it.id}">
      ${it.id === "credit" ? `<span class="pc-ribbon">${S.fmt.escape(S.t("ins.ribbonNew"))}</span>` : ""}
      <div class="pc-body">
        <span class="pc-tag">${S.fmt.escape(S.t(it.tag))}</span>
        <div class="pc-title">${S.fmt.escape(S.t(it.title))}</div>
        <div class="pc-desc">${S.fmt.escape(it.body)}</div>
        <button class="pc-cta" id="pc-cta">${S.fmt.escape(S.t(it.ctaLabel ?? "ins.ctaGo"))} →</button>
      </div>${it.art ? art(it.art) : iconArt(it.icon ?? "star")}</div>`;
    document.getElementById("pc-cta").onclick = () => {
      if (it.cta === "modal" && it.id === "credit") {
        S.ui.modal(`<h2>${S.fmt.escape(S.t("ins.creditTitle"))}</h2>
          <div class="pc-perks">
            <div class="pc-perk"><span class="pp-ico bg-tint-orange">${S.ui.icon("star", 16)}</span><div><b>${S.fmt.escape(S.t("ins.creditP1"))}</b><div class="muted small">${S.fmt.escape(S.t("ins.creditP1b"))}</div></div></div>
            <div class="pc-perk"><span class="pp-ico bg-tint-gold">${S.ui.icon("card", 16)}</span><div><b>${S.fmt.escape(S.t("ins.creditP2"))}</b><div class="muted small">${S.fmt.escape(S.t("ins.creditP2b"))}</div></div></div>
            <div class="pc-perk"><span class="pp-ico bg-tint-violet">${S.ui.icon("shield", 16)}</span><div><b>${S.fmt.escape(S.t("ins.creditP3"))}</b><div class="muted small">${S.fmt.escape(S.t("ins.creditP3b"))}</div></div></div>
          </div>
          <p class="footnote-sim" style="margin-top:12px">${S.fmt.escape(S.t("ins.creditNote"))}</p>${S.sim.footnote()}`);
      } else if (it.cta) {
        location.href = user ? it.cta : "/account/login?next=" + it.cta;
      }
    };
  };

  /* assets / cashflow / insight */
  if (!user) {
    document.getElementById("assets-main").innerHTML = `<div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("home.totalAssets"))}</div>
      <div class="total">—</div></div><a class="btn btn-primary" href="/account/login">${S.fmt.escape(S.t("home.loginBtn"))}</a></div>
      <p class="footnote-sim">${S.fmt.escape(S.t("home.loginCta"))}</p>`;
    document.getElementById("insight").style.display = "none";
    renderPromo({ id: "generic", tone: "sky", icon: "ai", tag: "ins.tagGeneric", title: "ins.genericTitle", body: S.t("ins.genericBody"), cta: "/ai", ctaLabel: "ins.genericCta" });
    return;
  }
  /* 首屏数据（第四十轮性能）：单次 /api/home/bundle（一次鉴权 + 一次 DO 往返）取 overview/dashboard/
     subs/bills/insight/proposals 全量——替代此前 5-6 个独立 API（overview 还被拉两次；同用户 DO 串行门控下逐个排队，
     快网也慢）。资产/情境卡/收支/洞察/提议速览全部由同一份数据即时渲染，不再有瀑布等待。
     since=上次查看提议页时间戳：供 badge 的 fresh（新提议数）判定（第七期 idle）。 */
  const bunR = await S.api.get("/api/home/bundle?since=" + encodeURIComponent(S.pp.seen())).catch(() => null);
  const bun = bunR?.ok ? bunR.data : null;
  const o = bun?.overview ?? null;
  /* 眼睛按钮全量掩码（第二十五轮续 5）：卡内所有 .mmask 数值（总资产/今日收益/本月收支各项）一起隐藏-恢复 */
  let hidden = false;
  const setMask = (on) => {
    S.ui.$$(".assets-block .mmask").forEach((el) => {
      if (on) { if (el.dataset.v == null) el.dataset.v = el.textContent; el.textContent = "*****"; }
      else if (el.dataset.v != null) el.textContent = el.dataset.v;
    });
  };
  if (o) {
    /* 桌面端：今日收益纵排放大数字右侧（.assets-side），移动端 wrap 后靠左（模拟声明已按要求移出本卡） */
    document.getElementById("assets-main").innerHTML = `
      <div class="row between assets-head"><div>
        <div class="acf-head"><b class="h-txt">${S.fmt.escape(S.t("home.totalAssets"))}</b><button class="eye-toggle" id="eye">${S.ui.icon("eye", 16)}</button></div>
        <div><span class="total mmask" id="amt">${S.fmt.moneyPlain(o.total_assets)}</span><span class="cur">CNY</span></div>
      </div>
      <div class="assets-side">
        <div class="muted small">${S.fmt.escape(S.t("home.todayPnl"))} <span class="mono mmask" id="pnl">${o.today_pnl.amount} (${o.today_pnl.percent})</span></div>
      </div></div>`;
    document.getElementById("eye").onclick = () => {
      hidden = !hidden;
      document.getElementById("eye").innerHTML = S.ui.icon(hidden ? "eye-off" : "eye", 16);
      setMask(hidden);
    };
  }
  /* 情境产品卡 + 本月收支：bundle 数据直灌 fromData（规则同源；失败静默不渲染） */
  {
    const ins = S.insights.fromData(o, bun?.dashboard ?? null, bun?.subscriptions ?? null, bun?.bills ?? null);
    if (ins.list.length) renderPromo(ins.list[0]);
    else renderPromo({ id: "generic", tone: "sky", icon: "ai", tag: "ins.tagGeneric", title: "ins.genericTitle", body: S.t("ins.genericBody"), cta: "/ai", ctaLabel: "ins.genericCta" });
    const cf = ins.cashflow;
    const el = document.getElementById("cashflow");
    /* 收支为空只跳过本区块（不 return——否则下方洞察卡/提议速览行也被跳过，骨架永挂；第七期加固） */
    if (cf && (cf.inThis || cf.outThis)) {
    const mLabel = new Date().toLocaleDateString(S.i18n.lang || "zh-CN", { month: "long" });
    const pill = (p, inverse) => {
      if (p == null) return "";
      const up = p >= 0;
      const cls = inverse ? (up ? "down" : "up") : (up ? "up" : "down"); /* 收入升=绿；支出升=红 */
      return `<span class="trend-pill ${cls}"><span class="mmask">${up ? "↑" : "↓"} ${Math.abs(p)}%</span> <span class="muted" style="font-size:11px">${S.fmt.escape(S.t("home.vsLast"))}</span></span>`;
    };
    const total = cf.inThis + cf.outThis;
    const inFrac = total ? Math.round((cf.inThis / total) * 100) : 50;
    /* 与资产总估值同卡（第二十五轮 1）：灰色横向分隔线 + 无卡壳内容；cashflow 为空时不渲染 → 无分隔线 */
    el.innerHTML = `<hr class="cf-sep">
      <div class="row between" style="align-items:center">
        <div class="acf-head"><b class="h-txt">${S.fmt.escape(S.t("home.monthCashflow"))} · ${mLabel}</b></div>
        <a class="small" href="/account/transactions">${S.fmt.escape(S.t("common.more"))} →</a>
      </div>
      <div class="row cf-row">
        <div class="cf-cell"><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("ch.inLabel"))}</span><span class="n trend-up mmask">¥${S.fmt.moneyPlain((cf.inThis / 100).toFixed(2))}</span></div>${pill(cf.inPct)}</div>
        <div class="cf-cell"><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("ch.outLabel"))}</span><span class="n mmask">¥${S.fmt.moneyPlain((cf.outThis / 100).toFixed(2))}</span></div>${pill(cf.outPct, true)}</div>
      </div>
      <div class="cf-bar" title="${inFrac}% / ${100 - inFrac}%"><i class="in" style="width:${inFrac}%"></i><i class="out" style="width:${100 - inFrac}%"></i></div>
      <div class="row between muted" style="font-size:11px;margin-top:4px">
        <span><i class="dot dot-in"></i> ${S.fmt.escape(S.t("ch.inLabel"))} <span class="mmask">${inFrac}%</span></span>
        <span><i class="dot dot-out"></i> ${S.fmt.escape(S.t("ch.outLabel"))} <span class="mmask">${100 - inFrac}%</span></span>
      </div>`;
    if (hidden) setMask(true);
    }
  }
  const insData = bun?.insight ?? null;
  /* 提议速览行（第七期 idle）：有新提议时在 AI 洞察卡家族内置顶一条（gold 提议胶囊 + 首条提议标题，
     与洞察行同款克制样式），点击直达 /ai/proposals。数据来自 bundle 同次往返，零新增请求。 */
  const pp = bun?.proposals ?? null;
  const ppTitle = pp && Number(pp.fresh) > 0 && pp.top ? S.pp.titleOf(pp.top) : "";
  if (insData || ppTitle) {
    const ppRow = ppTitle ? `<p class="muted small insight-li pp-quick" style="margin-top:6px" role="button" tabindex="0" data-href="/ai/proposals"><span class="pp-chip">${S.fmt.escape(S.t("prop.title"))}</span>${S.fmt.escape(ppTitle)}${S.ui.icon("enter", 14)}</p>` : "";
    /* 行即入口（第二十五轮 2）：去底部按钮与行首箭头，行尾回车式图标示意"带去 AI"；
       整行可点击 → 以第一人称指令原文发给 Suveoo AI（S.router.ai → /ai?q=…） */
    document.getElementById("insight").innerHTML = `<div class="insight-card rows-live"><img class="ins-logo" src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt="">
      <div><b>${S.fmt.escape(S.t("home.insight"))}</b>
      ${(insData?.insights ?? []).map((t) => `<p class="muted small insight-li" style="margin-top:6px" role="button" tabindex="0" data-q="${S.fmt.escape(t)}">${S.fmt.escape(t)}${S.ui.icon("enter", 14)}</p>`).join("")}
      </div></div>`;
    const ppQ = document.querySelector("#insight .pp-quick");
    if (ppQ) {
      const go = () => (location.href = ppQ.dataset.href);
      ppQ.onclick = go;
      ppQ.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    }
    S.ui.$$("#insight .insight-li:not(.pp-quick)").forEach((p) => {
      const ask = () => S.router.ai(S.t("home.insightAsk", p.dataset.q));
      p.onclick = ask;
      p.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ask(); } };
    });
  }
});
