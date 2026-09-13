/* account.js — P05 账户中心 */
S.router.register("account", async ({ user }) => {
  const c = document.getElementById("content");
  const items = [
    ["/account/cards", "card", S.t("acct.grid.cards")], ["/account/dashboard", "chart", S.t("acct.dashboard")],
    ["/account/security", "shield", S.t("acct.security")], ["/account/downloads", "download", S.t("acct.downloads")],
    ["/notifications", "bell", S.t("acct.grid.notif")], ["/transfer/limits", "lock", S.t("pay.limits")],
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
    <div class="grid grid-4" style="margin-top:16px">
      ${items.map(([href, ic, label]) => `<a class="quick-item" href="${href}"><span class="qi">${S.ui.icon(ic, 22)}</span><span>${S.fmt.escape(label)}</span></a>`).join("")}
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
