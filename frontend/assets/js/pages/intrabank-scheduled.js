/* intrabank-scheduled.js — P09 预约转账（双时区显示） */
S.router.register("intrabank-scheduled", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("sch.title"))}</h1>${S.sim.banner()}
    <div class="card" style="max-width:560px">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toName"))}</span><input class="input" id="s-name"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toAccount"))}</span><input class="input mono" id="s-acct" maxlength="16" inputmode="numeric"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.amount"))}</span><input class="input input-lg" id="s-amt" placeholder="0.00" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.from"))}</span>
        <div id="s-from" class="stack" style="gap:8px">${S.ui.skeleton(2)}</div></label>
      <div class="grid grid-2">
        <label class="field"><span class="lb">${S.fmt.escape(S.t("sch.when"))}</span><input class="input mono" id="s-when" placeholder="YYYY-MM-DD HH:mm" inputmode="numeric"></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("sch.repeat"))}</span>
          <span id="s-rep"></span></label>
      </div>
      <div class="banner">${S.ui.icon("clock", 16)}<div>${S.fmt.escape(S.t("sch.tzNote"))}<div id="tz-dual" class="mono" style="margin-top:4px"></div></div></div>
      <div id="s-err" class="banner" style="display:none;background:var(--color-red-bg);color:var(--color-red)"></div>
      <button class="btn btn-primary btn-block" id="s-go">${S.ui.icon("clock", 16)} ${S.fmt.escape(S.t("common.submit"))}</button>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tasks.title"))}</h2></div>
    <div class="card" id="tasks">${S.ui.skeleton(2)}</div>`;
  /* 付款卡选择：预约转账到期自动扣款，仅可挂借记卡（信用支付是即时消费语义，不进长程任务） */
  const presetFrom = new URLSearchParams(location.search).get("from");
  {
    const cards = (await S.api.get("/api/cards")).data?.cards ?? [];
    const debits = cards.filter((x) => x.kind === "debit" && x.status === "ACTIVE");
    let fromSlug = presetFrom || (debits.find((d) => d.is_default) ?? debits[0])?.slug;
    const box = document.getElementById("s-from");
    box.innerHTML = debits.map((d) => `
      <label class="row card card-pad-sm" style="cursor:pointer;gap:10px;margin:0">
        <input type="radio" name="from" value="${d.slug}" ${d.slug === fromSlug ? "checked" : ""}>
        <img class="bc-art" src="/${d.art}" alt="" style="width:64px;height:40px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b>
          <div class="muted small">${S.fmt.escape(d.network)} · ${d.is_default ? S.fmt.escape(S.t("cards.default")) + " · " : ""}${S.fmt.escape(S.t("cards.classIc", d.class_label))}</div></div>
        <div class="mono small" style="text-align:right">${S.fmt.escape(S.t("transfer.available"))} ¥${S.fmt.escape(d.balance)}</div>
      </label>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$("[name=from]", box).forEach((r) => { r.onchange = () => (fromSlug = r.value); });
    document.getElementById("s-go").onclick = async () => {
      const whenDate = parseWhen();
      const body = {
        recipient_name: document.getElementById("s-name").value.trim(),
        recipient_account: document.getElementById("s-acct").value.replace(/\s/g, ""),
        amount: document.getElementById("s-amt").value.trim(),
        execute_at: whenDate ? whenDate.toISOString() : null,
        repeat: repSel.value,
        from_card: fromSlug ?? undefined,
      };
      if (!body.recipient_name || !/^\d{16}$/.test(body.recipient_account) || !/^\d+(\.\d{1,2})?$/.test(body.amount ?? "") || !body.execute_at) {
        S.ui.toast(S.t("sched.fillAll"), true); return;
      }
      const r = await S.api.mutate("/api/schedules", body);
      if (r.cancelled) return;
      if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
      else {
        /* 收款方真实性等结构化拒绝：行内红条（与 /transfer/intrabank 同款映射） */
        const reason = r.data?.reason ?? r.data?.error?.code ?? null;
        const map = {
          ACCOUNT_NOT_FOUND: S.t("transfer.acctNotFound"),
          NAME_MISMATCH: S.t("transfer.nameMismatch"),
          INVALID_CARD_FORMAT: S.t("transfer.invalidAccount"),
          PAYEE_NOT_FOUND: S.t("transfer.acctNotFound"),
        };
        const box = document.getElementById("s-err");
        box.style.display = "flex";
        box.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(map[reason] ?? r.data?.error?.message ?? "failed")}</div>`;
        S.ui.toast(r.data?.reason ?? r.data?.error?.message ?? "failed", true);
      }
    };
  }
  const repSel = S.ctl.select({ label: S.t("sch.repeat"), options: [{ v: "once", label: S.t("sch.once") }, { v: "monthly", label: S.t("sch.monthly") }], value: "once" });
  repSel.id = "s-rep";
  document.getElementById("s-rep").replaceWith(repSel);
  const when = document.getElementById("s-when");
  /* 自绘替代 datetime-local：文本输入 YYYY-MM-DD HH:mm（本地时区），失焦即校验并联动双时区显示 */
  const parseWhen = () => {
    const m = when.value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  when.onchange = when.onblur = () => {
    const d = parseWhen();
    if (!d) return;
    document.getElementById("tz-dual").textContent = (() => { const t = S.fmt.dualTime(d.toISOString()); return `${t.local} / ${t.beijing}`; })();
  };
  const t = await S.api.get("/api/tasks");
  const box = document.getElementById("tasks");
  box.innerHTML = (t.data?.tasks ?? []).filter((x) => x.type === "scheduled_transfer").map((x) => `
    <div class="list-row"><span class="avatar">${S.ui.icon("clock", 14)}</span>
      <div class="grow"><b>${S.fmt.escape(x.title)}</b><div class="muted small mono">${S.fmt.escape(S.t("tasks.next"))} ${x.next_run_at ?? "—"}</div></div>
      ${S.ui.badge(S.t("tasks.status." + x.status) ?? x.status, x.status === "DONE" ? "badge-green" : x.status === "PENDING" ? "badge-yellow" : "badge-gray")}
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
});
