/* account.js — P05 账户中心（第三十九轮改版：渐变 Profile Hero + num-xl 资产概要 + 分类图标流水 + 偏好收尾） */
S.router.register("account", async ({ user }) => {
  const c = document.getElementById("content");
  const items = [
    /* 快捷入口宫格（第二十三轮 D：升级 ic-* 彩色 squircle，六族各异不相邻；安全入口用紫族——不占三色权限语义槽） */
    ["/account/cards", "ic-card-navy", S.t("acct.grid.cards")], ["/account/dashboard", "ic-chart-sky", S.t("acct.dashboard")],
    ["/account/security", "ic-shield-violet", S.t("acct.security")], ["/account/downloads", "ic-download-orange", S.t("acct.downloads")],
    ["/notifications", "ic-bell-teal", S.t("acct.grid.notif")], ["/transfer/limits", "ic-lock-gold", S.t("pay.limits")],
  ];
  c.innerHTML = `
    <div class="acct-hero bg-grad-navy">
      <div class="ah-top">
        <span class="ah-ava">${S.fmt.escape((user?.name ?? "U").slice(0, 1).toUpperCase())}</span>
        <div class="ah-txt">
          <div class="ah-name">${S.fmt.escape(user?.name ?? "")} <span class="ah-pr">PR${user?.pr_level ?? 3}</span></div>
          <div class="ah-sub">${S.fmt.escape(user?.email ?? "")}</div>
          <div class="ah-sub">${S.fmt.escape(S.t("acct.opened"))}：${S.fmt.date(user?.created_at ?? null) || "—"}</div>
        </div>
        <a class="ah-sec" href="/account/security" aria-label="${S.fmt.escape(S.t("acct.security"))}">${S.ui.icon("shield", 16)}</a>
      </div>
    </div>
    <div class="section-title acct-sec"><h2>${S.fmt.escape(S.t("acct.overview"))}</h2><a class="more" href="/account/dashboard">${S.fmt.escape(S.t("acct.dashboard"))} →</a></div>
    <div class="card" id="ov">${S.ui.skeleton(2)}</div>
    <div class="section-title acct-sec"><h2>${S.fmt.escape(S.t("acct.recent"))}</h2><a class="more" href="/account/transactions">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="card acct-recent" id="recent">${S.ui.skeleton(3)}</div>
    <div class="card acct-grid-card" style="margin-top:16px">
      <div class="acct-grid">${items.map(([href, ic, label]) => `<a class="quick-item" href="${href}"><span class="qi-wrap">${S.ui.icon(ic, 30)}</span><span>${S.fmt.escape(label)}</span></a>`).join("")}</div>
    </div>
    <div class="card acct-prefs" style="margin-top:16px">
      <h3>${S.fmt.escape(S.t("acct.prefs"))}</h3>
      <div class="list-row" style="cursor:pointer" id="pref-lang"><span class="avatar acct-pav">${S.ui.icon("globe", 14)}</span><div class="grow">${S.fmt.escape(S.t("acct.lang"))}</div>
        <span class="ah-langcur">${S.fmt.escape((S.i18n.langs.find((l) => l.code === S.i18n.lang) ?? {}).name ?? S.i18n.lang)}</span>${S.ui.icon("arrow-right", 14)}</div>
      <div class="list-row" style="cursor:pointer" id="pref-notif"><span class="avatar acct-pav">${S.ui.icon("bell", 14)}</span><div class="grow">${S.fmt.escape(S.t("acct.notifPrefs"))}</div>
        ${S.ui.icon("arrow-right", 14)}</div>
      <div class="list-row"><span class="avatar acct-pav">${S.ui.icon("doc", 14)}</span><div class="grow">Cookie</div>
        <button class="btn btn-sm btn-light" onclick="S.chrome.cookieModal()">${S.fmt.escape(S.t("cookie.prefs"))}</button></div>
      <button class="btn acct-logout" id="logout">${S.ui.icon("lock", 14)} ${S.fmt.escape(S.t("acct.logout"))}</button>
    </div>
    ${S.sim.footnote()}`;
  /* 资产概要：num-xl 三件套 + 右侧 tint 行（对齐成果保留） */
  const ovBox = document.getElementById("ov");
  const ov = await S.api.get("/api/overview");
  /* 外币资产（账户级，折 CNY 参考值）：仅当确有外币持仓时渲染该行，点击直达 /wealth/fx */
  const fxb = await S.api.get("/api/fx/balances").catch(() => null);
  const fxSum = fxb && fxb.ok ? (fxb.data.balances ?? []).reduce((a, x) => a + Number(x.cny_estimate ?? 0), 0) : 0;
  const pnlCls = String(ov.data?.today_pnl?.amount ?? "").trim().startsWith("-") ? "trend-down" : "trend-up";
  ovBox.innerHTML = ov.ok ? `
    <div class="row between" style="gap:12px;flex-wrap:wrap">
      <div><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("home.totalAssets"))}</span><span class="n">¥${S.fmt.moneyPlain(ov.data.total_assets)}</span><span class="u">CNY</span></div>
        <div class="acct-pnl">${S.fmt.escape(S.t("home.todayPnl"))} <b class="mono ${pnlCls}">${S.fmt.escape(String(ov.data.today_pnl?.amount ?? "—"))}（${S.fmt.escape(String(ov.data.today_pnl?.percent ?? "—"))}）</b></div></div>
      <div class="acct-ov-side" style="text-align:right">
        <a class="gc-kv acct-ovrow" href="/account/cards"><span class="muted ov-l">${S.ui.icon("bank", 13)}<span>${S.fmt.escape(S.t("acct.balance"))}</span></span><span class="v mono">¥ ${S.fmt.moneyPlain(ov.data.total_balance)}${S.ui.icon("chevron", 12)}</span></a>
        <a class="gc-kv acct-ovrow" href="/wealth/my"><span class="muted ov-l">${S.ui.icon("wealth", 13)}<span>${S.fmt.escape(S.t("wealth.holdings"))}</span></span><span class="v mono">¥ ${S.fmt.moneyPlain(ov.data.holdings_total)}${S.ui.icon("chevron", 12)}</span></a>
        ${fxSum > 0 ? `<a class="gc-kv acct-ovrow" href="/wealth/fx"><span class="muted ov-l">${S.ui.icon("exchange", 13)}<span>${S.fmt.escape(S.t("acct.fxAssets"))}</span></span><span class="v mono">¥ ${S.fmt.moneyPlain(fxSum.toFixed(2))}${S.ui.icon("chevron", 12)}</span></a>` : ""}
      </div>
    </div>` : S.ui.empty(S.t("common.loadFailed"));
  /* 最近 5 笔流水：分类彩色 squircle + 日期分组（与 /account/transactions、/pay 最近交易同构） */
  const CAT_ICON = {
    "转账": "ic-pay-sky", "餐饮": "ic-star-orange", "购物": "ic-card-rose", "交通": "ic-exchange-teal",
    "娱乐": "ic-ai-violet", "生活服务": "ic-doc-gold", "医疗": "ic-shield-rose", "订阅": "ic-bell-teal",
    "理财": "ic-wealth-gold", "数码科技": "ic-chart-violet", "潮流收藏": "ic-trend-rose", "信用还款": "ic-card-navy",
  };
  const dayKey = (ts) => {
    const b = new Date(new Date(ts).getTime() + 8 * 3600_000), n = new Date(Date.now() + 8 * 3600_000);
    const n0 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    const diff = Math.round((n0 - b0) / 86400_000);
    return diff === 0 ? "pay.today" : diff === 1 ? "pay.yesterday" : "pay.earlier";
  };
  const rcBox = document.getElementById("recent");
  const rc = await S.api.get("/api/transfers?scope=all");
  if (rc.ok) {
    let lastDay = null;
    const parts = [];
    for (const t of (rc.data.txs ?? []).slice(0, 5)) {
      const dk = dayKey(t.ts);
      if (dk !== lastDay) { parts.push(`<div class="muted small pay-day">${S.fmt.escape(S.t(dk))}</div>`); lastDay = dk; }
      parts.push(`
      <div class="list-row pay-tx">
        <span class="qi-wrap" style="width:34px;height:34px;flex:none">${S.ui.icon(CAT_ICON[t.category] ?? "ic-doc-navy", 26)}</span>
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b>
          <div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.category ?? "")}</div></div>
        <div class="amt mono" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
      </div>`);
    }
    rcBox.innerHTML = parts.join("") || S.ui.empty(S.t("common.emptyTx"));
  } else rcBox.innerHTML = S.ui.empty(S.t("common.loadFailed"));
  /* 退出登录两段式：点击先弹确认窗（防误触），确认才登出 */
  document.getElementById("logout").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("acct.logoutTitle"))}</h2>
      <p class="muted small" style="margin-top:4px">${S.fmt.escape(S.t("acct.logoutBody"))}</p>
      <div class="modal-actions"><button class="btn btn-ghost" id="lo-no">${S.fmt.escape(S.t("common.cancel"))}</button><button class="btn acct-logout" id="lo-yes" style="width:auto;margin-top:0">${S.fmt.escape(S.t("acct.logout"))}</button></div>`);
    m.el.querySelector("#lo-no").onclick = () => m.close();
    m.el.querySelector("#lo-yes").onclick = () => S.auth.logout();
  };
  /* 偏好 · 通知设定（第五十六轮）：权限检查→类别开关弹窗（偏好跨设备同步，关闭类不弹系统通知） */
  document.getElementById("pref-notif").onclick = () => S.notify.openPrefs();
  /* 偏好 · 语言：点击弹出三语选择（选择后即时生效） */
  document.getElementById("pref-lang").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("acct.lang"))}</h2>
      ${S.i18n.langs.map((l) => `<button class="lang-item" data-lang="${l.code}" style="border-radius:8px"><img src="${l.flag}" alt="">${S.fmt.escape(l.name)}${S.i18n.lang === l.code ? S.ui.icon("check", 14) : ""}</button>`).join("")}`);
    S.ui.$$(".lang-item", m.el).forEach((b) => {
      b.onclick = () => { m.close(); S.i18n.set(b.dataset.lang); };
    });
  };
});
