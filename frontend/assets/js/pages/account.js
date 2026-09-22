/* account.js — P05 账户中心（资料卡 + 资产概要 + 最近流水 + 快捷入口） */
S.router.register("account", async ({ user }) => {
  const c = document.getElementById("content");
  const items = [
    /* 快捷入口宫格（第二十三轮 D：升级 ic-* 彩色 squircle，六族各异不相邻；安全入口用紫族——不占三色权限语义槽） */
    ["/account/cards", "ic-card-navy", S.t("acct.grid.cards")], ["/account/dashboard", "ic-chart-sky", S.t("acct.dashboard")],
    ["/account/security", "ic-shield-violet", S.t("acct.security")], ["/account/downloads", "ic-download-orange", S.t("acct.downloads")],
    ["/notifications", "ic-bell-teal", S.t("acct.grid.notif")], ["/transfer/limits", "ic-lock-gold", S.t("pay.limits")],
  ];
  c.innerHTML = `
    <div class="card">
      <div class="row" style="gap:16px">
        <span class="avatar" style="width:64px;height:64px;font-size:24px">${S.fmt.escape((user?.name ?? "U").slice(0, 1).toUpperCase())}</span>
        <div class="grow"><h2>${S.fmt.escape(user?.name ?? "")}</h2>
          <div class="muted small">${S.fmt.escape(user?.email ?? "")} · ${S.ui.badge("PR" + (user?.pr_level ?? 3), "badge-navy")}</div>
          <div class="muted small">${S.fmt.escape(S.t("acct.opened"))}：${S.fmt.date(user?.created_at ?? null) || "—"}</div></div>
      </div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("acct.overview"))}</h2><a class="more" href="/account/dashboard">${S.fmt.escape(S.t("acct.dashboard"))} →</a></div>
    <div class="card" id="ov">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("acct.recent"))}</h2><a class="more" href="/account/transactions">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="card" id="recent">${S.ui.skeleton(3)}</div>
    <div class="card acct-grid-card" style="margin-top:16px">
      <div class="acct-grid">${items.map(([href, ic, label]) => `<a class="quick-item" href="${href}"><span class="qi-wrap">${S.ui.icon(ic, 30)}</span><span>${S.fmt.escape(label)}</span></a>`).join("")}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${S.fmt.escape(S.t("acct.prefs"))}</h3>
      <div class="list-row" style="cursor:pointer" id="pref-lang"><span class="avatar">${S.ui.icon("globe", 14)}</span><div class="grow">${S.fmt.escape(S.t("acct.lang"))}</div>
        <span class="muted small">${S.fmt.escape((S.i18n.langs.find((l) => l.code === S.i18n.lang) ?? {}).name ?? S.i18n.lang)}</span>${S.ui.icon("arrow-right", 14)}</div>
      <div class="list-row"><span class="avatar">${S.ui.icon("doc", 14)}</span><div class="grow">Cookie</div>
        <button class="btn btn-sm btn-light" onclick="S.chrome.cookieModal()">${S.fmt.escape(S.t("cookie.prefs"))}</button></div>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:16px" id="logout">${S.ui.icon("lock", 14)} ${S.fmt.escape(S.t("acct.logout"))}</button>
    ${S.sim.footnote()}`;
  /* 资产概要：复用 /api/overview（与仪表盘同源同口径） */
  const ovBox = document.getElementById("ov");
  const ov = await S.api.get("/api/overview");
  /* 外币资产（账户级，折 CNY 参考值）：仅当确有外币持仓时渲染该行，点击直达 /wealth/fx */
  const fxb = await S.api.get("/api/fx/balances").catch(() => null);
  const fxSum = fxb && fxb.ok ? (fxb.data.balances ?? []).reduce((a, x) => a + Number(x.cny_estimate ?? 0), 0) : 0;
  ovBox.innerHTML = ov.ok ? `
    <div class="row between" style="gap:12px;flex-wrap:wrap">
      <div><div class="muted small">${S.fmt.escape(S.t("home.totalAssets"))}（CNY）</div>
        <div class="total mono" style="font-size:28px;font-weight:700">¥ ${S.fmt.moneyPlain(ov.data.total_assets)}</div>
        <div class="muted small">${S.fmt.escape(S.t("home.todayPnl"))} ${S.fmt.escape(String(ov.data.today_pnl?.amount ?? "—"))}（${S.fmt.escape(String(ov.data.today_pnl?.percent ?? "—"))}）</div></div>
      <div class="acct-ov-side" style="text-align:right">
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("acct.balance"))}</span><span class="v mono">¥ ${S.fmt.moneyPlain(ov.data.total_balance)}</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("wealth.holdings"))}</span><span class="v mono">¥ ${S.fmt.moneyPlain(ov.data.holdings_total)}</span></div>
        ${fxSum > 0 ? `<a class="gc-kv" href="/wealth/fx"><span class="muted">${S.fmt.escape(S.t("acct.fxAssets"))}</span><span class="v mono">¥ ${S.fmt.moneyPlain(fxSum.toFixed(2))} →</span></a>` : ""}
      </div>
    </div>` : S.ui.empty(S.t("common.loadFailed"));
  /* 最近 5 笔流水：全量收支（与 /account/transactions 交易记录页同源） */
  const rcBox = document.getElementById("recent");
  const rc = await S.api.get("/api/transfers?scope=all");
  rcBox.innerHTML = rc.ok ? ((rc.data.txs ?? []).slice(0, 5).map((t) => `
    <div class="list-row">
      <span class="avatar">${S.ui.icon(t.direction === "IN" ? "plus" : "pay", 14)}</span>
      <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b>
        <div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.category ?? "")}</div></div>
      <div class="amt mono" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
    </div>`).join("") || S.ui.empty(S.t("common.emptyTx"))) : S.ui.empty(S.t("common.loadFailed"));
  document.getElementById("logout").onclick = () => S.auth.logout();
  /* 偏好 · 语言：点击弹出三语选择（选择后即时生效） */
  document.getElementById("pref-lang").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("acct.lang"))}</h2>
      ${S.i18n.langs.map((l) => `<button class="lang-item" data-lang="${l.code}" style="border-radius:8px"><img src="${l.flag}" alt="">${S.fmt.escape(l.name)}${S.i18n.lang === l.code ? S.ui.icon("check", 14) : ""}</button>`).join("")}`);
    S.ui.$$(".lang-item", m.el).forEach((b) => {
      b.onclick = () => { m.close(); S.i18n.set(b.dataset.lang); };
    });
  };
});
