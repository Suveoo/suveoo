/* intrabank-scheduled.js — P09 预约转账（双时区显示） */
S.router.register("intrabank-scheduled", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("sch.title"))}</h1>${S.sim.banner()}
    <div class="card" style="max-width:560px">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toName"))}</span><input class="input" id="s-name"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toAccount"))}</span><input class="input mono" id="s-acct" maxlength="16" inputmode="numeric"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.amount"))}</span><input class="input input-lg" id="s-amt" placeholder="0.00" inputmode="decimal"></label>
      <div class="grid grid-2">
        <label class="field"><span class="lb">${S.fmt.escape(S.t("sch.when"))}</span><input class="input" type="datetime-local" id="s-when"></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("sch.repeat"))}</span>
          <select class="input" id="s-rep"><option value="once">${S.fmt.escape(S.t("sch.once"))}</option><option value="monthly">${S.fmt.escape(S.t("sch.monthly"))}</option></select></label>
      </div>
      <div class="banner">${S.ui.icon("clock", 16)}<div>${S.fmt.escape(S.t("sch.tzNote"))}<div id="tz-dual" class="mono" style="margin-top:4px"></div></div></div>
      <button class="btn btn-primary btn-block" id="s-go">${S.ui.icon("clock", 16)} ${S.fmt.escape(S.t("common.submit"))}</button>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tasks.title"))}</h2></div>
    <div class="card" id="tasks">${S.ui.skeleton(2)}</div>`;
  const when = document.getElementById("s-when");
  when.onchange = () => {
    const iso = when.value ? new Date(when.value).toISOString() : null;
    if (!iso) return;
    const d = S.fmt.dualTime(iso);
    document.getElementById("tz-dual").textContent = `${d.local} / ${d.beijing}`;
  };
  document.getElementById("s-go").onclick = async () => {
    const body = {
      recipient_name: document.getElementById("s-name").value.trim(),
      recipient_account: document.getElementById("s-acct").value.replace(/\s/g, ""),
      amount: document.getElementById("s-amt").value.trim(),
      execute_at: when.value ? new Date(when.value).toISOString() : null,
      repeat: document.getElementById("s-rep").value,
    };
    if (!body.recipient_name || !/^\d{16}$/.test(body.recipient_account) || !/^\d+(\.\d{1,2})?$/.test(body.amount ?? "") || !body.execute_at) {
      S.ui.toast(S.t("sched.fillAll"), true); return;
    }
    const r = await S.api.mutate("/api/schedules", body);
    if (r.cancelled) return;
    if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
    else S.ui.toast(r.data?.reason ?? r.data?.error?.message ?? "failed", true);
  };
  const t = await S.api.get("/api/tasks");
  const box = document.getElementById("tasks");
  box.innerHTML = (t.data?.tasks ?? []).filter((x) => x.type === "scheduled_transfer").map((x) => `
    <div class="list-row"><span class="avatar">${S.ui.icon("clock", 14)}</span>
      <div class="grow"><b>${S.fmt.escape(x.title)}</b><div class="muted small mono">${S.fmt.escape(S.t("tasks.next"))} ${x.next_run_at ?? "—"}</div></div>
      ${S.ui.badge(S.t("tasks.status." + x.status) ?? x.status, x.status === "DONE" ? "badge-green" : x.status === "PENDING" ? "badge-yellow" : "badge-gray")}
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
});
