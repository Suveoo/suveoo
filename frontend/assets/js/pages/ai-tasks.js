/* ai-tasks.js — P13 长程任务中心（Saga 时间线 + 故障注入） */
S.router.register("ai-tasks", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tasks.title"))}</h1>
    <div class="banner" style="background:#FFFBEF;border:1px dashed var(--color-yellow)">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("tasks.injectNote"))}</div></div>
    <div class="stack" id="tasks">${S.ui.skeleton(2)}</div>`;
  const r = await S.api.get("/api/tasks");
  const el = document.getElementById("tasks");
  const list = r.data?.tasks ?? [];
  if (!list.length) { el.innerHTML = S.ui.empty(S.t("tasks.none")); return; }
  const stepsFor = (t) => {
    const ok = S.ui.icon("check", 12), bad = S.ui.icon("x", 12), wait = "…";
    if (t.status === "COMPENSATED") return [`T1 ${ok} ${S.t("genui.stepLock")}`, `T2 ${bad} ${S.t("genui.stepOrder")}`, `C1 ${ok} ${S.t("genui.stepUnlock")}`];
    if (t.status === "DONE") return t.type === "birthday_flowers" ? [`T1 ${ok} ${S.t("genui.stepLock")}`, `T2 ${ok} ${S.t("genui.stepOrder")}`] : [`T1 ${ok} ${S.t("genui.stepExec")}`];
    return [`T1 ${t.type === "birthday_flowers" ? ok + " " + S.t("genui.stepLock") : wait + " " + S.t("genui.stepWait")}`, `T2 ${wait} ${S.t("genui.stepFulfil")}`, `C1 ${wait} ${S.t("genui.stepBackup")}`];
  };
  el.innerHTML = list.map((t) => `
    <div class="card">
      <div class="row between wrap">
        <div><b>${S.fmt.escape(t.title)}</b>
          <div class="muted small">${S.fmt.escape(S.t("tasks.next"))}：${t.next_run_at ? S.fmt.dualTime(t.next_run_at).local + " / " + S.fmt.dualTime(t.next_run_at).beijing : "—"}</div></div>
        ${t.fail_next ? S.ui.badge(S.t("tasks.injectedBadge"), "badge-red") : S.ui.badge(S.t("tasks.status." + t.status) ?? t.status, t.status === "DONE" ? "badge-green" : t.status === "PENDING" ? "badge-yellow" : t.status === "COMPENSATED" ? "badge-navy" : "badge-gray")}
      </div>
      <div style="margin:12px 0">${stepsFor(t).map((s) => `<div class="task-step"><span class="st">·</span>${s}</div>`).join("")}</div>
      ${t.fail_next ? `<div class="banner" style="display:flex;background:var(--color-red-bg);color:var(--color-red);padding:8px 12px;margin-top:16px">${S.ui.icon("shield", 14)}<div class="small">${S.fmt.escape(S.t("tasks.injectNote"))}</div></div>` : ""}
      ${t.payload?.amount ? `<div class="muted small">${S.fmt.escape(S.t("genui.budget"))}：¥${S.fmt.escape(String(t.payload.amount))}</div>` : ""}
      <div class="row" style="margin-top:12px">
        ${t.status === "PENDING" ? `<button class="btn btn-sm btn-ghost cancel" data-id="${t.id}">${S.fmt.escape(S.t("tasks.cancel"))}</button>` : ""}
        ${t.status === "PENDING" && t.type === "birthday_flowers" && !t.fail_next ? `<button class="btn btn-sm btn-danger inject" data-id="${t.id}">${S.fmt.escape(S.t("trust.inject"))}</button>` : ""}
      </div>
    </div>`).join("");
  S.ui.$$(".cancel").forEach((b) => {
    b.onclick = async () => {
      const r2 = await S.api.post(`/api/tasks/${b.dataset.id}/cancel`, {});
      if (r2.data?.ok) { S.ui.toast(S.t("tasks.compensated")); setTimeout(() => location.reload(), 800); }
      else S.ui.toast(r2.data?.error?.message ?? "failed", true);
    };
  });
  S.ui.$$(".inject").forEach((b) => {
    b.onclick = async () => {
      const r2 = await S.api.post("/api/demo/inject-failure", { task_id: Number(b.dataset.id) });
      /* 注入成功：toast + 刷新列表（此前 fail_next 已置位但 UI 只看 status，点了"毫无变化"——组员报告） */
      if (r2.data?.ok) { S.ui.toast(S.t("tasks.injected")); setTimeout(() => location.reload(), 700); }
      else S.ui.toast(r2.data?.error?.message ?? "failed", true);
    };
  });
});
