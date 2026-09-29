/* notifications.js — 第二十九轮通知中心改版：分类 chips × 时间分组 × 单条已读/删除 ×
   展开全文 × cursor 分页（加载更多）× 语义色图标 × SECURITY 警示边 × header 未读点同步。
   对标真实银行消息中心：未读蓝点+浅底、分类未读徽章、今天/昨天/近7天/更早分组、
   行点开即读、清理已读；安全类通知始终即时送达（文案层承诺）。 */
S.router.register("notifications", async () => {
  const c = document.getElementById("content");
  /* 语义色映射：TRANSFER=绿(资金正向) / SECURITY=红(警示) / WEALTH=金 / TASK=紫 / SYSTEM=灰 */
  const META = {
    TRANSFER: { icon: "send", cls: "t-transfer" },
    SECURITY: { icon: "shield", cls: "t-security" },
    WEALTH: { icon: "wealth", cls: "t-wealth" },
    TASK: { icon: "clock", cls: "t-task" },
    SYSTEM: { icon: "bell", cls: "t-system" },
  };
  const metaOf = (t) => META[t] ?? META.SYSTEM;
  /* 时间分组：今天/昨天/近 7 天/更早（未来时间戳归"今天"，种子数据存在带时刻的排程） */
  const bucketOf = (ts) => {
    const d = new Date(ts), now = new Date();
    if (Number.isNaN(d.getTime())) return "earlier";
    const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.floor((sod(now) - sod(d)) / 86400000);
    return diff <= 0 ? "today" : diff === 1 ? "yesterday" : diff < 8 ? "d7" : "earlier";
  };
  const BUCKETS = ["today", "yesterday", "d7", "earlier"];
  const BKEY = { today: "notif.today", yesterday: "notif.yesterday", d7: "notif.d7", earlier: "notif.earlier" };
  /* chips：all / unread / 五分类；徽章=分类未读（unread 用总未读） */
  const CATS = [["all", "common.all", null], ["unread", "notif.unread", "unread"], ["TRANSFER", "notif.cat.transfer", "TRANSFER"], ["SECURITY", "notif.cat.security", "SECURITY"], ["WEALTH", "notif.cat.wealth", "WEALTH"], ["TASK", "notif.cat.task", "TASK"], ["SYSTEM", "notif.cat.system", "SYSTEM"]];

  c.innerHTML = `
    <div class="row between nt-head">
      <div><h1>${S.fmt.escape(S.t("nav.notifications"))}</h1>
        <p class="muted small nt-sub" id="n-sub">${S.ui.skeleton(1)}</p></div>
      <div class="nt-ops">
        <button class="btn btn-ghost btn-sm" id="clear-read" hidden>${S.fmt.escape(S.t("notif.clearRead"))}</button>
        <button class="btn btn-light btn-sm" id="read-all">${S.fmt.escape(S.t("notif.markAll"))}</button>
      </div>
    </div>
    <div class="th-chips" id="n-chips"></div>
    <p class="nt-sec small"><span class="nt-secico">${S.ui.icon("shield", 13)}</span>${S.fmt.escape(S.t("notif.securityAlways"))}</p>
    <div class="nt-list" id="n-list"></div>`;

  let cat = "all";
  let rows = [];          /* 已加载通知（id DESC） */
  let byType = {};        /* 分类未读计数（服务端权威） */
  let unread = 0;
  let nextCursor = null;  /* 还有更多时为数字，否则 null */
  let openIds = new Set();/* 展开态 */

  const el = {
    sub: document.getElementById("n-sub"),
    chips: document.getElementById("n-chips"),
    list: document.getElementById("n-list"),
    readAll: document.getElementById("read-all"),
    clearRead: document.getElementById("clear-read"),
  };

  /* header 铃铛未读点同步（与 app.js pollUnread 同一事实源 /api/session） */
  const syncDot = async () => {
    const r = await S.api.get("/api/session").catch(() => null);
    const btn = document.getElementById("btn-notif");
    if (btn && r?.ok) {
      btn.querySelector(".dot")?.remove();
      if (r.data.unread_notifications > 0) btn.insertAdjacentHTML("beforeend", '<span class="dot"></span>');
    }
  };

  const filtered = () => {
    if (cat === "all") return rows;
    if (cat === "unread") return rows.filter((n) => !n.read);
    return rows.filter((n) => n.type === cat);
  };

  const renderChips = () => {
    el.chips.innerHTML = CATS.map(([v, key, stat]) => {
      const n = stat == null ? null : (stat === "unread" ? unread : (byType[stat] ?? 0));
      return `<button class="hpill${cat === v ? " on" : ""}" data-v="${v}">${S.fmt.escape(S.t(key))}${n ? ` <span class="chip-n">${n > 99 ? "99+" : n}</span>` : ""}</button>`;
    }).join("");
    S.ui.$$(".hpill", el.chips).forEach((b) => { b.onclick = () => { cat = b.dataset.v; renderChips(); renderList(); }; });
  };

  const rowHtml = (n) => {
    const m = metaOf(n.type);
    const unreadCls = n.read ? "" : " is-unread";
    const open = openIds.has(n.id);
    return `<div class="nt-row${unreadCls}${n.type === "SECURITY" ? " is-sec" : ""}${open ? " open" : ""}" data-id="${n.id}">
      <span class="nt-dot" aria-hidden="true"></span>
      <span class="nt-ico ${m.cls}">${S.ui.icon(m.icon, 15)}</span>
      <div class="nt-main">
        <div class="nt-h"><b class="nt-title">${S.fmt.escape(n.title)}</b><span class="nt-time" title="${S.fmt.escape(S.fmt.datetime(n.ts))}">${S.fmt.escape(S.fmt.relTime(n.ts))}</span></div>
        <div class="nt-body">${open ? S.fmt.linkify(n.body) : S.fmt.escape(n.body)}</div>
        ${open ? `<div class="nt-acts">
          ${n.read ? "" : `<button class="mini-btn" data-act="read">${S.fmt.escape(S.t("notif.markRead"))}</button>`}
          <button class="mini-btn danger" data-act="del">${S.fmt.escape(S.t("notif.del"))}</button>
        </div>` : ""}
      </div>
      <span class="nt-chev">${S.ui.icon("chevron", 13)}</span>
    </div>`;
  };

  const renderList = () => {
    const list = filtered();
    /* 时间分组插组标题（保持 id DESC 顺序） */
    let html = "", lastB = null;
    for (const n of list) {
      const b = bucketOf(n.ts);
      if (b !== lastB) { html += `<div class="nt-group">${S.fmt.escape(S.t(BKEY[b]))}</div>`; lastB = b; }
      html += rowHtml(n);
    }
    const emptyKey = cat === "all" ? "notif.empty" : cat === "unread" ? "notif.emptyUnread" : "notif.emptyCat";
    el.list.innerHTML = html + (nextCursor != null
      ? `<button class="btn btn-ghost nt-more" id="n-more">${S.fmt.escape(S.t("notif.loadMore"))}</button>`
      : (list.length ? `<div class="nt-nomore small">${S.fmt.escape(S.t("notif.noMore"))}</div>` : ""));
    if (!list.length) el.list.innerHTML = S.ui.empty(S.t(emptyKey));
    const more = document.getElementById("n-more");
    if (more) more.onclick = loadMore;
    /* 行点击：toggle 展开；未读同时标已读。正文链接/操作按钮的点击不冒泡成展开切换 */
    S.ui.$$(".nt-row", el.list).forEach((r) => {
      r.addEventListener("click", async (e) => {
        if (e.target.closest("a, .nt-acts")) return;
        const id = Number(r.dataset.id);
        const n = rows.find((x) => x.id === id);
        if (!n) return;
        const wasOpen = openIds.has(id);
        openIds = new Set(wasOpen && n.read ? [...openIds].filter((x) => x !== id) : [...openIds, id]);
        if (!n.read) await markRead([id], false); /* await 收账后再渲染，未读底色/蓝点即时移除 */
        renderList();
      });
    });
    S.ui.$$("[data-act]", el.list).forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const id = Number(b.closest(".nt-row").dataset.id);
        if (b.dataset.act === "read") { await markRead([id], true); renderList(); }
        else await del([id]);
      };
    });
  };

  const renderStats = () => {
    el.sub.textContent = S.t("notif.sub", unread);
    el.readAll.disabled = !unread;
    el.clearRead.hidden = !rows.some((n) => n.read);
  };

  const markRead = async (ids, toast) => {
    const r = await S.api.post("/api/notifications/read", { ids });
    if (!r.ok) { S.ui.toast(r.data?.error?.message ?? S.t("notif.opFail"), true); return; }
    let delta = 0;
    for (const id of ids) { const n = rows.find((x) => x.id === id); if (n && !n.read) { n.read = 1; delta--; (byType[n.type] ?? 0) > 1 ? (byType[n.type] -= 1) : delete byType[n.type]; } }
    unread = Math.max(0, unread + delta);
    if (toast) S.ui.toast(S.t("notif.readOk"));
    renderStats(); renderChips(); syncDot();
  };

  const del = async (ids) => {
    const r = await S.api.post("/api/notifications/delete", { ids });
    if (!r.ok) { S.ui.toast(r.data?.error?.message ?? S.t("notif.opFail"), true); return; }
    if (ids === "read") {
      /* 清空已读：字符串模式，前端同步移除全部已读行（未读保留） */
      rows.filter((n) => n.read).forEach((n) => openIds.delete(n.id));
      rows = rows.filter((n) => !n.read);
    } else {
      for (const id of ids) {
        const n = rows.find((x) => x.id === id);
        if (n && !n.read) { unread = Math.max(0, unread - 1); (byType[n.type] ?? 0) > 1 ? (byType[n.type] -= 1) : delete byType[n.type]; }
        openIds.delete(id);
      }
      rows = rows.filter((x) => !ids.includes(x.id));
    }
    S.ui.toast(S.t("notif.delOk"));
    renderStats(); renderChips(); renderList(); syncDot();
  };

  const apply = (data) => {
    byType = data.byType ?? {};
    unread = data.unread ?? 0;
    nextCursor = data.nextCursor ?? null;
  };

  const loadMore = async () => {
    const r = await S.api.get(`/api/notifications?cursor=${nextCursor}`);
    if (!r.ok) { S.ui.toast(S.t("common.loadFailed"), true); return; }
    apply(r.data);
    rows = rows.concat(r.data.notifications ?? []);
    renderChips(); renderStats(); renderList();
  };

  el.readAll.onclick = async () => {
    const r = await S.api.post("/api/notifications/read", { ids: "all" });
    if (!r.ok) { S.ui.toast(r.data?.error?.message ?? S.t("notif.opFail"), true); return; }
    rows.forEach((n) => (n.read = 1));
    unread = 0; byType = {};
    S.ui.toast(S.t("common.opOk"));
    renderStats(); renderChips(); renderList(); syncDot();
  };
  el.clearRead.onclick = () => del("read");

  /* 首屏 */
  el.list.innerHTML = S.ui.skeleton(5);
  const r = await S.api.get("/api/notifications");
  if (!r.ok) { el.list.innerHTML = S.ui.empty(S.t("common.loadFailed")); el.sub.textContent = ""; return; }
  apply(r.data);
  rows = r.data.notifications ?? [];
  renderChips(); renderStats(); renderList();
});
