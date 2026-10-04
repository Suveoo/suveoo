/* bills.js — P06 账单支付 */
S.router.register("bills", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("bills.title"))}</h1>
    <div class="card" id="insight">${S.ui.skeleton(1)}</div>
    <div class="card" style="margin-top:16px" id="bills">${S.ui.skeleton(4)}</div>`;
  const ins = await S.api.get("/api/dashboard/insight");
  /* 行即入口（第二十五轮续 6，与主页 AI 洞察同款）：去行首符号（首字与标题对齐），行尾回车图标，整行可点 → 第一人称发 Suveoo AI */
  document.getElementById("insight").innerHTML = ins.ok
    ? `<div class="insight-card rows-live"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><div><b>${S.fmt.escape(S.t("bills.insight"))}</b>
       ${(ins.data.insights ?? []).map((t) => `<p class="muted small insight-li" style="margin-top:4px" role="button" tabindex="0" data-q="${S.fmt.escape(t)}">${S.fmt.escape(t)}${S.ui.icon("enter", 14)}</p>`).join("")}</div></div>` : "";
  S.ui.$$("#insight .insight-li").forEach((p) => {
    const ask = () => S.router.ai(S.t("home.insightAsk", p.dataset.q));
    p.onclick = ask;
    p.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ask(); } };
  });
  const r = await S.api.get("/api/bills");
  const el = document.getElementById("bills");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  el.innerHTML = (r.data.bills ?? []).map((b) => `
    <div class="list-row">
      <span style="width:40px;height:40px;border-radius:50%;background:var(--color-primary-tint);display:inline-flex;align-items:center;justify-content:center;flex:none">${S.ui.icon("doc", 18)}</span>
      <div class="grow"><b>${S.fmt.escape(b.name)}</b>
        <div class="muted small">${S.t("bills.dueDay", b.due_day)} · ${b.last_paid_at ? S.t("bills.paid") : S.t("bills.unpaid")}${S.fmt.escape(S.t("common.simPrice"))}</div></div>
      <div style="text-align:right"><div class="amt mono">¥${S.fmt.moneyPlain((Number(b.amount_cents) / 100).toFixed(2))}</div>
        <div class="row" style="gap:8px;justify-content:flex-end;margin-top:4px">
          <label class="switch" title="Autopay"><input type="checkbox" data-ap="${b.id}" ${Number(b.autopay) === 1 ? "checked" : ""}><span class="tk"></span></label>
          <button class="btn btn-sm btn-light pay-bill" data-id="${b.id}" data-name="${S.fmt.escape(b.name)}">${S.fmt.escape(S.t("bills.pay"))}</button>
        </div></div>
    </div>`).join("");
  S.ui.$$(".pay-bill").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const r2 = await S.api.mutate(`/api/bills/${btn.dataset.id}/pay`, {}, { subject: btn.dataset.name });
      if (r2.cancelled) { btn.disabled = false; return; }
      if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 900); }
      else { S.ui.toast(S.fmt.blockedMsg(r2), true); btn.disabled = false; }
    };
  });
  S.ui.$$("[data-ap]").forEach((sw) => {
    sw.onchange = async () => {
      /* autopay 路由为 PATCH（mutate 默认 POST 会 501，开关永远弹回） */
      const r2 = await S.api.mutate(`/api/bills/${sw.dataset.ap}/autopay`, { enabled: sw.checked }, { method: "PATCH" });
      if (r2.cancelled) { sw.checked = !sw.checked; return; }
      if (r2.data?.status !== "EXECUTED") { sw.checked = !sw.checked; S.ui.toast(S.fmt.blockedMsg(r2), true); }
    };
  });
});
