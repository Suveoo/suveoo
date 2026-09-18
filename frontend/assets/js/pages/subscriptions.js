/* subscriptions.js — P07 订阅管理（场景5） */
S.router.register("subscriptions", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("subs.title"))}</h1>${S.sim.banner()}
    <div class="card" id="sleepy">${S.ui.skeleton(1)}</div>
    <div class="card" style="margin-top:16px" id="subs">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/subscriptions");
  const subs = r.data?.subscriptions ?? [];
  const sleepy = subs.filter((s) => Number(s.usage_score) < 20 && s.status === "ACTIVE");
  document.getElementById("sleepy").innerHTML = sleepy.length
    ? `<div class="insight-card"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><div><b>${S.fmt.escape(S.t("subs.sleepy"))}</b>
       ${sleepy.map((s) => `<p class="muted small" style="margin-top:4px">· ${S.fmt.escape(S.t("subs.usageRow", s.merchant, s.usage_score, s.amount))}</p>`).join("")}
       <button class="ai-chip" style="margin-top:8px" id="ask">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("genui.insight"))}</button></div></div>`
    : `<div class="muted small">—</div>`;
  const ask = document.getElementById("ask");
  if (ask) ask.onclick = () => S.router.ai(S.t("prompt.subsCleanup"));
  const el = document.getElementById("subs");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  el.innerHTML = subs.map((s) => `
    <div class="list-row">
      <span class="avatar">${S.fmt.escape(s.merchant.slice(0, 1))}</span>
      <div class="grow"><b>${S.fmt.escape(s.merchant)}</b> ${Number(s.usage_score) < 20 && s.status === "ACTIVE" ? S.ui.badge("!", "badge-red") : ""}
        <div class="muted small">${S.fmt.escape(s.plan)} · ¥${s.amount}/${S.fmt.escape(s.cycle)} · ${S.fmt.escape(S.t("subs.next"))} ${s.next_charge_date}
        ${s.dark_pattern_note ? `<br><span style="color:var(--color-yellow)">${S.ui.icon("star", 12)} ${S.fmt.escape(s.dark_pattern_note)}</span>` : ""}</div>
        <div class="muted small">${S.fmt.escape(S.t("subs.usage"))} <span class="usage-bar"><i style="width:${s.usage_score}%"></i></span> ${s.usage_score}%</div></div>
      <div style="text-align:right">
        ${s.status === "ACTIVE" ? `
        <label class="small row" style="gap:6px;justify-content:flex-end">${S.fmt.escape(S.t("subs.remind"))}
          <span class="switch"><input type="checkbox" data-rm="${s.id}" ${Number(s.reminders) === 1 ? "checked" : ""}><span class="tk"></span></span></label>
        <button class="btn btn-sm btn-danger cancel-sub" data-id="${s.id}" style="margin-top:8px">${S.fmt.escape(S.t("subs.cancel"))}</button>` :
        S.ui.badge(S.t("subs.cancelled"), "badge-gray")}
      </div>
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
  S.ui.$$(".cancel-sub").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const r2 = await S.api.mutate(`/api/subscriptions/${btn.dataset.id}/cancel`, {});
      if (r2.cancelled) { btn.disabled = false; return; }
      if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 900); }
      else { S.ui.toast(r2.data?.reason ?? "failed", true); btn.disabled = false; }
    };
  });
  S.ui.$$("[data-rm]").forEach((sw) => {
    sw.onchange = async () => {
      await S.api.patch(`/api/subscriptions/${sw.dataset.rm}/reminders`, { enabled: sw.checked });
      S.ui.toast(S.t("common.opOk"));
    };
  });
});
