/* notifications.js — P30 全部通知（未读/已读筛选 + 全部已读） */
S.router.register("notifications", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between"><h1>${S.fmt.escape(S.t("nav.notifications"))}</h1>
    <button class="btn btn-ghost btn-sm" id="read-all">${S.fmt.escape(S.t("notif.markAll"))}</button></div>
    <div class="tabs" id="n-tabs"></div>
    <div class="card" style="margin-top:12px">${S.ui.skeleton(5)}</div>`;
  const el = c.querySelector(".card");
  let tab = "all";
  let cache = [];
  const icon = (type) => (type === "SECURITY" ? "shield" : type === "WEALTH" ? "wealth" : type === "TASK" ? "clock" : "bell");
  const render = () => {
    document.getElementById("n-tabs").innerHTML = [
      ["all", S.t("common.all"), cache.length],
      ["unread", S.t("notif.unread"), cache.filter((n) => !n.read).length],
      ["read", S.t("notif.read"), cache.filter((n) => n.read).length],
    ].map(([v, label, n]) => `<button class="tab${tab === v ? " active" : ""}" data-t="${v}">${S.fmt.escape(label)}${v === "unread" && n ? ` <span class="badge badge-red">${n}</span>` : ""}</button>`).join("");
    S.ui.$$("#n-tabs .tab").forEach((t) => { t.onclick = () => { tab = t.dataset.t; render(); }; });
    const list = cache.filter((n) => tab === "all" || (tab === "unread" ? !n.read : n.read));
    el.innerHTML = list.map((n) => `
      <div class="list-row ${n.read ? "" : "unread"}">
        <span class="avatar">${S.ui.icon(icon(n.type), 14)}</span>
        <div class="grow"><b>${S.fmt.escape(n.title)}</b><div class="muted small">${S.fmt.escape(n.body)}</div></div>
        <span class="muted small">${S.fmt.relTime(n.ts)}</span>
      </div>`).join("") || S.ui.empty(tab === "unread" ? S.t("notif.emptyUnread") : S.t("notif.empty"));
  };
  const load = async () => {
    const r = await S.api.get("/api/notifications");
    if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    cache = r.data.notifications ?? [];
    render();
  };
  document.getElementById("read-all").onclick = async () => {
    const r = await S.api.post("/api/notifications/read", { ids: "all" });
    if (r.ok) { S.ui.toast(S.t("common.opOk")); load(); }
    else S.ui.toast(r.data?.error?.message ?? "failed", true);
  };
  load();
});
