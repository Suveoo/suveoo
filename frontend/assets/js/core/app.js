/* app.js — 全局 chrome（header / drawer / 底部导航 / footer / cookie / 下拉）与启动 */
S.chrome = {
  nav: [
    { key: "home", path: "/home", icon: "home", section: "main" },
    { key: "pay", path: "/pay", icon: "pay", section: "main" },
    { key: "wealth", path: "/wealth", icon: "wealth", section: "main" },
  ],
  /* 静态二级项注册表（account 组随登录态动态构建，见 render；其子项均在 /account 前缀下由兜底逻辑归属）。
     active() 归属判定优先查此表——路径前缀会误判跨分区注册的二级项（如 /account/transactions 属「收付」） */
  SUB_STATIC: {
    home: [["/notifications", "bell", "nav.notifications"], ["/about", "doc", "about.title"], ["/help", "help", "help.title"], ["/contact", "doc", "footer.contact"]],
    pay: [["/transfer/intrabank", "bank", "pay.intrabank"], ["/transfer/intrabank-scheduled", "clock", "pay.scheduled"], ["/transfer/history", "list", "pay.history"], ["/account/transactions", "list", "pay.txHistory"], ["/transfer/payees", "account", "payees.title"], ["/transfer/limits", "lock", "pay.limits"], ["/pay/bills", "doc", "pay.billsEntry"], ["/pay/subscriptions", "star", "subs.title"]],
    wealth: [["/wealth/funds", "wealth", "wealth.funds"], ["/wealth/deposits", "doc", "wealth.deposits"], ["/wealth/fx", "exchange", "wealth.allFx"], ["/wealth/tools", "calc", "tc.navTitle"]],
  },
  active() {
    const p = location.pathname;
    if (p.startsWith("/ai")) return "ai";
    /* 二级项归属优先于路径前缀：如 /account/transactions 注册在「收付」组，
       不得因 /account 前缀被误展开进「我的帐户」 */
    for (const [sec, list] of Object.entries(this.SUB_STATIC)) {
      if ((list ?? []).some(([sp]) => p === sp || p.startsWith(sp + "/"))) return sec;
    }
    if (p.startsWith("/transfer")) return "pay";
    for (const n of this.nav) if (p.startsWith(n.path)) return n.key;
    if (p.startsWith("/account")) return "account";
    /* 一级路径之外的公开页归属其所在分区（通知/关于/帮助/联系 → 主页） */
    if (["/notifications", "/about", "/help", "/contact"].some((x) => p.startsWith(x))) return "home";
    return "";
  },
  async render() {
    const user = await S.auth.session();
    const act = this.active();
    const name = user ? user.name : null;
    const header = S.ui.el(`
      <header class="app-header">
        <a class="logo-link" href="/home"><img src="/assets/images/suveoo-logo-long.svg" alt="Suveoo"></a>
        ${S.sim.pill()}
        <div class="header-right">
          <a class="header-user" href="${user ? "/account" : "/account/login"}" data-i18n-title="nav.account">
            <span class="avatar">${name ? S.fmt.escape(name.slice(0, 1).toUpperCase()) : S.ui.icon("account", 16)}</span>
            <span class="hu-name hide-sm">${user ? S.fmt.escape(name) : S.t("nav.loginSignup")}</span>
          </a>
          <span class="v-sep"></span>
          <button class="icon-btn" id="btn-notif" aria-label="${S.t("nav.notifications")}">${S.ui.icon("bell")}${user?.unread_notifications ? '<span class="dot"></span>' : ""}</button>
          <a class="icon-btn" href="/help" aria-label="Help">${S.ui.icon("help")}</a>
          <button class="icon-btn" id="btn-lang" aria-label="Language">${S.ui.icon("globe")}</button>
        </div>
      </header>`);
    document.body.prepend(header);
    /* drawer (PC)：一级全宽（内嵌人字箭头 ∨/>）点击即跳转即展开（单开）；
       顶部顺序：Suveoo AI → 「最近」独立平铺区（新用户以 5 条最常用填充）→ 主页 → 收付 → 财富 → 账户 */
    const SUB = {
      ...this.SUB_STATIC,
      account: user
        ? [["/account/dashboard", "chart", "dash.title"], ["/account/cards", "card", "acct.grid.cards"], ["/account/security", "shield", "sec.title"], ["/account/downloads", "download", "acct.downloads"]]
        : [["/account/register", "plus", "login.toRegister"], ["/account/recovery", "help", "login.toRecovery"]],
    };
    const AI_SUB = [["/ai/tasks", "clock", "tasks.title"], ["/ai/benchmark", "chart", "bench.title"]];
    /* 路径 → 图标/i18n 键注册表（一级+二级全并）；「最近」只收录其中条目，保证标签与图标三语可用 */
    const PATH_INFO = {
      "/home": ["home", "nav.home"], "/pay": ["pay", "nav.pay"], "/wealth": ["wealth", "nav.wealth"],
      "/account": ["account", "nav.account"], "/ai": ["ai", "nav.ai"], "/account/login": ["account", "nav.login"],
      "/ai/tasks": ["clock", "tasks.title"], "/ai/benchmark": ["chart", "bench.title"],
      ...Object.values(SUB).flat().reduce((m, [p, ic, k]) => ({ ...m, [p]: [ic, k] }), {}),
    };
    /* 记录最近访问（仅注册表内路径；去重置顶，上限 5） */
    const REC_KEY = "suveoo_recents";
    try {
      const cur = location.pathname;
      if (PATH_INFO[cur] && cur !== "/account/login") {
        const list = JSON.parse(localStorage.getItem(REC_KEY) ?? "[]").filter((x) => x !== cur);
        list.unshift(cur);
        localStorage.setItem(REC_KEY, JSON.stringify(list.slice(0, 5)));
      }
    } catch { /* 隐私模式等场景静默 */ }
    /* 「最近」：老用户=真实最近 5 条；新用户=固定 5 条最常用（主页/收付/财富/AI/转账） */
    const DEFAULT_RECENTS = ["/home", "/pay", "/wealth", "/ai", "/transfer/intrabank"];
    const recents = (() => {
      try {
        const list = JSON.parse(localStorage.getItem(REC_KEY) ?? "[]").filter((p) => PATH_INFO[p]);
        return (list.length ? list : DEFAULT_RECENTS).slice(0, 5);
      } catch { return DEFAULT_RECENTS; }
    })();
    const recHtml = `
      <div class="drawer-recents">
        <div class="rec-head">${S.fmt.escape(S.t("nav.recents"))}</div>
        ${recents.map((p) => `<a class="drawer-sub rec${location.pathname === p ? " cur" : ""}" href="${p}">${S.ui.icon(PATH_INFO[p][0], 14)}<span>${S.t(PATH_INFO[p][1])}</span></a>`).join("")}
      </div>`;
    const chev = (k) => S.ui.icon("chevron", 11) + "";
    const subHtml = (list) => `<div class="drawer-subs"><div class="ds-inner">${(list ?? []).map(([p, ic, k]) => `<a class="drawer-sub${location.pathname === p ? " cur" : ""}" href="${p}">${S.ui.icon(ic, 13)}<span>${S.t(k)}</span></a>`).join("")}</div></div>`;
    const drawer = S.ui.el(`
      <aside class="side-drawer">
        <div class="drawer-group drawer-ai-group${act === "ai" ? " open" : ""}" data-sec="ai">
          <a class="drawer-ai${act === "ai" ? " active" : ""}" href="/ai">
            <img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt="">
            <div class="ai-txt"><div class="t">Suveoo AI</div><div class="s">${S.fmt.escape(S.t("ai.drawerSub"))}</div></div>
            <span class="drawer-chev">${chev()}</span>
          </a>
          ${subHtml(AI_SUB)}
        </div>
        ${recHtml}
        ${this.nav.map((n) => `
        <div class="drawer-group${act === n.key ? " open" : ""}" data-sec="${n.key}">
          <a class="drawer-item${act === n.key ? " active" : ""}" href="${n.path}">${S.ui.icon(n.icon)}<span>${S.t("nav." + n.key)}</span><span class="drawer-chev">${chev()}</span></a>
          ${subHtml(SUB[n.key])}
        </div>`).join("")}
        <div class="drawer-group${act === "account" ? " open" : ""}" data-sec="account">
          <a class="drawer-item${act === "account" ? " active" : ""}" href="${user ? "/account" : "/account/login"}">${S.ui.icon("account")}<span>${user ? S.t("nav.account") : S.t("nav.loginSignup")}</span><span class="drawer-chev">${chev()}</span></a>
          ${subHtml(SUB.account)}
        </div>
      </aside>`);
    document.body.appendChild(drawer);
    /* 初始展开组直接到位（无动画）；单开语义由 act 决定，无需 JS 切换 */
    /* bottom nav (mobile) */
    const bn = S.ui.el(`
      <nav class="bottom-nav">
        <a class="bn-item${act === "home" ? " active" : ""}" href="/home">${S.ui.icon("home")}<span>${S.t("nav.home")}</span></a>
        <a class="bn-item${act === "pay" ? " active" : ""}" href="/pay">${S.ui.icon("pay")}<span>${S.t("nav.pay")}</span></a>
        <a class="bn-item bn-ai${act === "ai" ? " active" : ""}" href="/ai"><span class="ai-circle"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""></span><span>Suveoo AI</span></a>
        <a class="bn-item${act === "wealth" ? " active" : ""}" href="/wealth">${S.ui.icon("wealth")}<span>${S.t("nav.wealth")}</span></a>
        <a class="bn-item${act === "account" ? " active" : ""}" href="${user ? "/account" : "/account/login"}">${S.ui.icon("account")}<span>${user ? S.t("nav.account") : S.t("nav.login")}</span></a>
      </nav>`);
    document.body.appendChild(bn);
    /* footer —— 移动端三组为手风琴（点击展开二级项，chevron 向下旋转），桌面保持三栏直排 */
    const footer = S.ui.el(`
      <footer class="app-footer">
        <div class="cols">
          <div class="fcol"><h4 class="fcol-head"><button type="button" aria-expanded="false"><span>${S.fmt.escape(S.t("footer.product"))}</span>${S.ui.icon("chevron", 14)}</button></h4>
            <div class="fcol-body"><ul>
            <li><a href="/home">${S.fmt.escape(S.t("nav.home"))}</a></li><li><a href="/pay">${S.fmt.escape(S.t("nav.pay"))}</a></li>
            <li><a href="/wealth">${S.fmt.escape(S.t("nav.wealth"))}</a></li><li><a href="/ai">Suveoo AI</a></li></ul></div></div>
          <div class="fcol"><h4 class="fcol-head"><button type="button" aria-expanded="false"><span>${S.fmt.escape(S.t("footer.support"))}</span>${S.ui.icon("chevron", 14)}</button></h4>
            <div class="fcol-body"><ul>
            <li><a href="/help">${S.fmt.escape(S.t("footer.help"))}</a></li><li><a href="/contact">${S.fmt.escape(S.t("footer.contact"))}</a></li>
            <li><a href="/notifications">${S.fmt.escape(S.t("footer.notifications"))}</a></li>
            <li><a href="/about">${S.fmt.escape(S.t("footer.about"))}</a></li></ul></div></div>
          <div class="fcol"><h4 class="fcol-head"><button type="button" aria-expanded="false"><span>${S.fmt.escape(S.t("footer.legal"))}</span>${S.ui.icon("chevron", 14)}</button></h4>
            <div class="fcol-body"><ul>
            <li><a href="/terms">${S.fmt.escape(S.t("legal.terms"))}</a></li><li><a href="/privacy-policy">${S.fmt.escape(S.t("legal.privacy"))}</a></li>
            <li><a href="/cookie-privacy">${S.fmt.escape(S.t("legal.cookie"))}</a></li>
            <li><button class="linklike" id="foot-cookie">${S.fmt.escape(S.t("cookie.prefs"))}</button></li></ul></div></div>
        </div>
        <div class="foot-bottom">
          <span>© 2026 Suveoo</span>
          <span>${S.fmt.escape(S.sim.text())}</span>
        </div>
      </footer>`);
    document.body.appendChild(footer);
    footer.querySelector("#foot-cookie").onclick = () => S.chrome.cookieModal();
    /* 移动端 footer 手风琴：点击一级项展开/收起二级列表（桌面按钮无感——body 恒开、chevron 隐藏） */
    footer.querySelectorAll(".fcol-head button").forEach((btn) => {
      btn.onclick = () => {
        const open = btn.closest(".fcol").classList.toggle("open");
        btn.setAttribute("aria-expanded", open);
      };
    });
    /* 通知下拉 */
    header.querySelector("#btn-notif").onclick = (e) => { e.stopPropagation(); this.toggleNotif(e.currentTarget, user); };
    /* 语言下拉 */
    header.querySelector("#btn-lang").onclick = (e) => { e.stopPropagation(); this.toggleLang(e.currentTarget); };
    /* 首访 cookie 提示：延迟 4 秒、右下角非阻塞小卡（不打断首屏） */
    if (!S.ga4.status()) setTimeout(() => { if (!S.ga4.status() && !document.querySelector(".cookie-pop")) this.cookieModal(true); }, 4000);
    if (user) this.pollUnread(header);
  },
    /* 即时语言切换：清除旧 chrome 与未读轮询后按新词典重建（cookie 小卡若未选择则一并以新语言重开） */
    async rerender() {
      clearInterval(this._notifTimer);
      document.querySelectorAll(".app-header,.side-drawer,.bottom-nav,.app-footer").forEach((el) => el.remove());
      document.querySelector(".cookie-pop")?.remove();
      await this.render();
      if (!S.ga4.status()) this.cookieModal();
    },
    dropdown(anchor, cls) {
    const wrap = anchor.closest(".icon-btn") ?? anchor;
    const existing = wrap.querySelector(":scope > .dropdown");
    if (existing) { existing.remove(); return null; } // 第二次点击同一按钮 = 收起
    document.querySelectorAll(".dropdown").forEach((d) => d.remove());
    wrap.style.position = "relative";
    const dd = S.ui.el(`<div class="dropdown ${cls}"></div>`);
    wrap.appendChild(dd);
    const off = (ev) => {
      if (!dd.isConnected) { document.removeEventListener("click", off); return; }
      if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener("click", off); }
    };
    setTimeout(() => document.addEventListener("click", off), 0);
    return dd;
  },
  async toggleNotif(anchor, user) {
    if (!user) { location.href = "/account/login"; return; }
    const dd = this.dropdown(anchor, "notif");
    if (!dd) return; // 第二次点击已收起
    dd.innerHTML = `<div class="dd-head"><span>${S.t("nav.notifications")}</span></div><div class="dd-list">${S.ui.skeleton(3)}</div>
      <div class="dd-foot"><a href="/notifications">${S.fmt.escape(S.t("notif.viewAll"))}</a></div>`;
    const r = await S.api.get("/api/notifications");
    const list = dd.querySelector(".dd-list");
    if (!r.ok) { list.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    list.innerHTML = r.data.notifications.slice(0, 8).map((n) => `
      <div class="notif-item${n.read ? "" : " unread"}">
        <div class="grow"><div class="nt">${S.fmt.escape(n.title)}</div><div class="muted small">${S.fmt.escape(n.body)}</div>
        <div class="muted small">${S.fmt.relTime(n.ts)}</div></div>
      </div>`).join("") || S.ui.empty(S.t("notif.empty"));
  },
  toggleLang(anchor) {
    const dd = this.dropdown(anchor, "lang");
    if (!dd) return; // 第二次点击已收起
    dd.innerHTML = S.i18n.langs.map((l) =>
      `<button class="lang-item" data-lang="${l.code}"><img src="${l.flag}" alt="">${l.name}${S.i18n.lang === l.code ? S.ui.icon("check", 14) : ""}</button>`).join("");
    S.ui.$$(".lang-item", dd).forEach((b) => { b.onclick = () => S.i18n.set(b.dataset.lang); });
  },
  async pollUnread(header) {
    const upd = async () => {
      const r = await S.api.get("/api/session").catch(() => null);
      const btn = header.querySelector("#btn-notif");
      if (btn && r?.ok) btn.querySelector(".dot")?.remove(), r.data.unread_notifications > 0 && btn.insertAdjacentHTML("beforeend", '<span class="dot"></span>');
    };
    clearInterval(this._notifTimer); // 语言切换重渲染时防定时器泄漏
    this._notifTimer = setInterval(upd, 60000);
  },
  cookieModal() {
    const anaOn = S.ga4.analyticsOn();
    const box = S.ui.el(`
      <div class="cookie-pop" role="dialog" aria-label="Cookie preferences">
        <h2>${S.fmt.escape(S.t("cookie.title"))}</h2>
        <p>${S.fmt.escape(S.t("cookie.body"))}</p>
        <p class="small"><a href="/cookie-privacy">${S.fmt.escape(S.t("cookie.policy"))}</a></p>
        <div class="ck-row">
          <div class="grow"><b class="small">${S.fmt.escape(S.t("cookie.necTitle"))}</b><div class="muted small">${S.fmt.escape(S.t("cookie.necDesc"))}</div></div>
          <span class="switch"><input type="checkbox" checked disabled aria-label="${S.fmt.escape(S.t("cookie.necTitle"))}"><span class="tk"></span></span>
        </div>
        <div class="ck-row">
          <div class="grow"><b class="small">${S.fmt.escape(S.t("cookie.anaTitle"))}</b><div class="muted small">${S.fmt.escape(S.t("cookie.anaDesc"))}</div></div>
          <span class="switch"><input type="checkbox" id="ck-ana" ${anaOn ? "checked" : ""} aria-label="${S.fmt.escape(S.t("cookie.anaTitle"))}"><span class="tk"></span></span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" id="ck-n">${S.fmt.escape(S.t("cookie.necessaryOnly"))}</button>
          <button class="btn btn-light btn-sm" id="ck-save">${S.fmt.escape(S.t("common.save"))}</button>
          <button class="btn btn-primary btn-sm" id="ck-y">${S.fmt.escape(S.t("cookie.acceptAll"))}</button>
        </div>
      </div>`);
    document.body.appendChild(box);
    const done = (fn) => { fn(); box.remove(); };
    box.querySelector("#ck-y").onclick = () => done(() => { S.ga4.grant(); S.ga4.event("consent_grant", { mode: "all" }); });
    box.querySelector("#ck-save").onclick = () => done(() => {
      const on = box.querySelector("#ck-ana").checked;
      S.ga4.setAnalytics(on);
      S.ga4.event("consent_save", { analytics: on });
    });
    box.querySelector("#ck-n").onclick = () => done(() => { S.ga4.deny(); S.ga4.event("consent_grant", { mode: "necessary" }); });
  },
};

/* 财富共享助手（wealth/fund-detail/deposit-detail 页共用，全站加载） */
S.wealth = {
  /* 16 只基金（R1→R5 排序）：前 8 只为原系列，后 8 只为 2026-09 扩充系列 */
  FUND_IDS: ["global-money-1", "global-short-bond", "esg-bond", "cn-dividend", "consumer-staples", "quant-neutral", "em-gov-bond", "global-mixed-1", "reit-global", "global-mixed-2", "global-equity-index", "gold-index", "healthcare-bio", "new-energy", "apac-tech", "ai-semi"],
  DEP_IDS: ["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"],
};

/* 金融计算工具目录（/wealth 入口卡片区与 /wealth/tools 导航卡共用；按部署阶段逐步追加） */
S.toolCatalog = [
  { slug: "savings-compound", icon: "coins", nameKey: "tc.savingsName", descKey: "tc.savingsDesc" },
  { slug: "loan-compare", icon: "scale", nameKey: "tc.loanName", descKey: "tc.loanDesc" },
  { slug: "goal-planner", icon: "target", nameKey: "tc.goalName", descKey: "tc.goalDesc" },
  { slug: "credit-payoff", icon: "card", nameKey: "tc.creditName", descKey: "tc.creditDesc" },
  { slug: "retirement", icon: "sun", nameKey: "tc.retireName", descKey: "tc.retireDesc" },
  { slug: "inflation-calculator", icon: "trend", nameKey: "tc.inflName", descKey: "tc.inflDesc" },
  { slug: "split-bill-plus", icon: "users", nameKey: "tc.splitName", descKey: "tc.splitDesc" },
  { slug: "deposit-compare", icon: "bank", nameKey: "tc.depName", descKey: "tc.depDesc" },
  { slug: "fx-convert", icon: "exchange", nameKey: "tc.fxName", descKey: "tc.fxDesc" },
  { slug: "budget-allocator", icon: "pie", nameKey: "tc.budgetName", descKey: "tc.budgetDesc" },
];
S.toolCard = (t) => `
  <a class="tool-card" href="/wealth/tools/${t.slug}">
    <span class="ti">${S.ui.icon(t.icon, 20)}</span>
    <span style="min-width:0"><span class="tn">${S.fmt.escape(S.t(t.nameKey))}</span>
    <span class="td" style="display:block">${S.fmt.escape(S.t(t.descKey))}</span></span>
  </a>`;
S.fundCache = () => Promise.all(S.wealth.FUND_IDS.map((id) => S.api.json(`/assets/data/funds/${id}.json`)));
S.depCache = () => Promise.all(S.wealth.DEP_IDS.map((s) => S.api.json(`/assets/data/deposits/${s}.json`)));
S.fundSlug = () => (location.pathname.match(/\/wealth\/funds\/([a-z0-9-]+)/) ?? [])[1];
S.depSlug = () => (location.pathname.match(/\/wealth\/deposits\/([a-z0-9-]+)/) ?? [])[1];
S.purchaseModal = async (fund) => {
  const sess = await S.auth.session();
  const pr = sess?.pr_level ?? 3;
  const mismatch = Number(fund.risk_level) > Number(pr);
  const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("wealth.purchase"))} · ${S.fmt.escape(fund.name)}</h2>
    ${mismatch ? `<div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("wealth.riskMismatch", fund.risk_level, pr))}</div></div>` : ""}
    <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("funds.nav"))}</span><span class="v mono">${fund.nav}</span></div>
    <label class="field" style="margin-top:12px"><span class="lb">${S.fmt.escape(S.t("common.amount"))}（CNY）</span>
      <input class="input input-lg" id="w-amt" placeholder="${S.fmt.escape(fund.min_invest)}" inputmode="decimal"></label>
    <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
    <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("wealth.purchase"))}（RED）</button></div>`);
  m.el.querySelector("#cx").onclick = m.close;
  m.el.querySelector("#ok").onclick = async () => {
    const amount = m.el.querySelector("#w-amt").value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { S.ui.toast(S.t("common.badAmount"), true); return; }
    const r = await S.api.mutate("/api/wealth/purchase", { product_id: fund.slug, amount }, { subject: fund.name });
    if (r.cancelled) return;
    if (r.data?.status === "EXECUTED" && r.data.result?.ok) { m.close(); S.ui.toast(S.t("common.opOk")); }
    else S.ui.toast(r.data?.result?.error === "INSUFFICIENT_BALANCE" ? S.t("common.insufficient") : r.data?.reason ?? r.data?.result?.error ?? "failed", true);
  };
};

/* 启动（页面控制器先 register，DOMContentLoaded 后统一 boot；分阶段容错） */
(async function boot() {
  if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
  try { await S.i18n.init(); } catch (e) { console.error("[boot] i18n failed", e); }
  try { await S.chrome.render(); } catch (e) { console.error("[boot] chrome failed", e); }
  /* Service Worker 注册（此前从未注册——SW 的超时重试由此生效；activate 会 claim 现有标签页） */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  /* 给服务端骨架打标：boot 结束后若标记仍在 = 控制器没跑（脚本加载挂死/未注册）→ 与看门狗一同自救 */
  const markBootSkel = () => document.querySelectorAll("#content .skeleton").forEach((el) => (el.dataset.boot = "1"));
  markBootSkel();
  try {
    // 看门狗：连接停滞会让主区骨架永挂（刷新即恢复）；20s 仍未完成则自动刷新一次自救
    await Promise.race([
      S.router.boot(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("BOOT_WATCHDOG")), 20000)),
    ]);
    sessionStorage.removeItem("suveoo_boot_retried");
    /* 登录重定向中：由 /account/login 页面接管，不做完成校验、不做任何自救 */
    if (S.router.redirecting) return;
    if (document.querySelector('#content .skeleton[data-boot="1"]')) throw new Error("BOOT_INCOMPLETE");
  } catch (e) {
    /* 重定向中：放弃一切自救/报错（导航已发生，当前 document 即将销毁） */
    if (S.router.redirecting) return;
    const code = String(e?.message ?? "");
    if ((code.includes("BOOT_WATCHDOG") || code.includes("BOOT_INCOMPLETE")) &&
        document.querySelector('#content .skeleton[data-boot="1"]') &&
        !sessionStorage.getItem("suveoo_boot_retried")) {
      sessionStorage.setItem("suveoo_boot_retried", "1");
      location.reload();
      return;
    }
    console.error("[boot] page failed", e);
    const c = document.getElementById("content");
    if (c && c.querySelector(".skeleton")) c.innerHTML = `<div class="card"><h2>${S.fmt.escape(S.t("common.pageError"))}</h2>
      <p class="muted small mono">${S.fmt.escape(String(e?.message ?? e))}</p>
      <button class="btn btn-ghost" onclick="location.reload()">${S.fmt.escape(S.t("common.retry"))}</button></div>`;
  }
})();
