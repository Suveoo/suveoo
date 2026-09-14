/* app.js — 全局 chrome（header / drawer / 底部导航 / footer / cookie / 下拉）与启动 */
S.chrome = {
  nav: [
    { key: "home", path: "/home", icon: "home", section: "main" },
    { key: "pay", path: "/pay", icon: "pay", section: "main" },
    { key: "wealth", path: "/wealth", icon: "wealth", section: "main" },
  ],
  active() {
    const p = location.pathname;
    if (p.startsWith("/ai")) return "ai";
    if (p.startsWith("/transfer")) return "pay";
    for (const n of this.nav) if (p.startsWith(n.path)) return n.key;
    if (p.startsWith("/account")) return "account";
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
    /* drawer (PC) */
    const drawer = S.ui.el(`
      <aside class="side-drawer">
        <a class="drawer-ai${act === "ai" ? " active" : ""}" href="/ai">
          <img src="/assets/images/suveoo-ai-logo.svg" alt="">
          <div class="t">Suveoo AI</div>
          <div class="s">${S.fmt.escape(S.t("ai.drawerSub"))}</div>
        </a>
        ${this.nav.map((n) => `<a class="drawer-item${act === n.key ? " active" : ""}" href="${n.path}">${S.ui.icon(n.icon)}<span>${S.t("nav." + n.key)}</span></a>`).join("")}
        <a class="drawer-item${act === "account" ? " active" : ""}" href="${user ? "/account" : "/account/login"}">${S.ui.icon("account")}<span>${user ? S.t("nav.account") : S.t("nav.loginSignup")}</span></a>
      </aside>`);
    document.body.appendChild(drawer);
    /* bottom nav (mobile) */
    const bn = S.ui.el(`
      <nav class="bottom-nav">
        <a class="bn-item${act === "home" ? " active" : ""}" href="/home">${S.ui.icon("home")}<span>${S.t("nav.home")}</span></a>
        <a class="bn-item${act === "pay" ? " active" : ""}" href="/pay">${S.ui.icon("pay")}<span>${S.t("nav.pay")}</span></a>
        <a class="bn-item bn-ai${act === "ai" ? " active" : ""}" href="/ai"><span class="ai-circle"><img src="/assets/images/suveoo-ai-logo.svg" alt=""></span><span>Suveoo AI</span></a>
        <a class="bn-item${act === "wealth" ? " active" : ""}" href="/wealth">${S.ui.icon("wealth")}<span>${S.t("nav.wealth")}</span></a>
        <a class="bn-item${act === "account" ? " active" : ""}" href="${user ? "/account" : "/account/login"}">${S.ui.icon("account")}<span>${user ? S.t("nav.account") : S.t("nav.login")}</span></a>
      </nav>`);
    document.body.appendChild(bn);
    /* footer */
    const footer = S.ui.el(`
      <footer class="app-footer">
        <div class="cols">
          <div><h4>${S.fmt.escape(S.t("footer.product"))}</h4><ul>
            <li><a href="/home">${S.fmt.escape(S.t("nav.home"))}</a></li><li><a href="/pay">${S.fmt.escape(S.t("nav.pay"))}</a></li>
            <li><a href="/wealth">${S.fmt.escape(S.t("nav.wealth"))}</a></li><li><a href="/ai">Suveoo AI</a></li></ul></div>
          <div><h4>${S.fmt.escape(S.t("footer.support"))}</h4><ul>
            <li><a href="/help">${S.fmt.escape(S.t("footer.help"))}</a></li><li><a href="/contact">${S.fmt.escape(S.t("footer.contact"))}</a></li>
            <li><a href="/notifications">${S.fmt.escape(S.t("footer.notifications"))}</a></li></ul></div>
          <div><h4>${S.fmt.escape(S.t("footer.legal"))}</h4><ul>
            <li><a href="/terms">${S.fmt.escape(S.t("legal.terms"))}</a></li><li><a href="/privacy-policy">${S.fmt.escape(S.t("legal.privacy"))}</a></li>
            <li><a href="/cookie-privacy">${S.fmt.escape(S.t("legal.cookie"))}</a></li>
            <li><button class="linklike" id="foot-cookie">${S.fmt.escape(S.t("cookie.prefs"))}</button></li></ul></div>
        </div>
        <div class="foot-bottom">
          <span>© 2026 Suveoo</span>
          <span>${S.fmt.escape(S.sim.text())}</span>
        </div>
      </footer>`);
    document.body.appendChild(footer);
    footer.querySelector("#foot-cookie").onclick = () => S.chrome.cookieModal();
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
    const box = S.ui.el(`
      <div class="cookie-pop" role="dialog" aria-label="Cookie preferences">
        <h2>${S.fmt.escape(S.t("cookie.title"))}</h2>
        <p>${S.fmt.escape(S.t("cookie.body"))}</p>
        <p class="small"><a href="/cookie-privacy">${S.fmt.escape(S.t("cookie.policy"))}</a></p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="ck-n">${S.fmt.escape(S.t("cookie.necessaryOnly"))}</button>
          <button class="btn btn-primary" id="ck-y">${S.fmt.escape(S.t("cookie.acceptAll"))}</button>
        </div>
      </div>`);
    document.body.appendChild(box);
    const done = (fn) => { fn(); box.remove(); };
    box.querySelector("#ck-y").onclick = () => { done(() => { S.ga4.grant(); S.ga4.event("consent_grant", { mode: "all" }); }); };
    box.querySelector("#ck-n").onclick = () => { done(() => { S.ga4.deny(); S.ga4.event("consent_grant", { mode: "necessary" }); }); };
  },
};

/* 财富共享助手（wealth/fund-detail/deposit-detail 页共用，全站加载） */
S.wealth = {
  FUND_IDS: ["global-mixed-1", "global-money-1", "em-gov-bond", "global-mixed-2", "global-equity-index", "apac-tech", "esg-bond", "gold-index"],
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
    const r = await S.api.mutate("/api/wealth/purchase", { product_id: fund.slug, amount });
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
    if (document.querySelector('#content .skeleton[data-boot="1"]')) throw new Error("BOOT_INCOMPLETE");
  } catch (e) {
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
