/* notifications.js — P30 全部通知 */
S.router.register("notifications", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between"><h1>${S.fmt.escape(S.t("nav.notifications"))}</h1>
    <button class="btn btn-ghost btn-sm" id="read-all">${S.fmt.escape(S.t("notif.markAll"))}</button></div>
    <div class="card">${S.ui.skeleton(5)}</div>`;
  const el = c.querySelector(".card");
  const render = async () => {
    const r = await S.api.get("/api/notifications");
    if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    el.innerHTML = (r.data.notifications ?? []).map((n) => `
      <div class="list-row ${n.read ? "" : "unread"}">
        <span class="avatar">${S.ui.icon(n.type === "SECURITY" ? "shield" : n.type === "WEALTH" ? "wealth" : n.type === "TASK" ? "clock" : "bell", 14)}</span>
        <div class="grow"><b>${S.fmt.escape(n.title)}</b><div class="muted small">${S.fmt.escape(n.body)}</div></div>
        <span class="muted small">${S.fmt.relTime(n.ts)}</span>
      </div>`).join("") || S.ui.empty(S.t("notif.empty"));
  };
  document.getElementById("read-all").onclick = async () => {
    await S.api.post("/api/notifications/read", { ids: "all" });
    render();
  };
  render();
});
