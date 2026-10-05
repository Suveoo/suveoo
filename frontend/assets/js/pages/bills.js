/* bills.js — P06 账单支付
 * 第一百一十九轮：开关=真自动缴费（到期日后台从默认借记卡自动扣款，due_scan 引擎）。
 * UI 三改：①开关显性化——文字标签「自动缴费」接 i18n（此前裸开关+硬编码英文 title，语义不可见）；
 * ②本期已缴（last_paid_at≥北京月初，与 due_scan paidThisMonth 同口径）按钮置灰「已缴费」；
 * ③缴费/开关 toast 具体化（开/关/已缴生效口径/手动缴后自动跳过），成功局部重渲染不再整页 reload。 */
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
  /* 北京本月起始日（YYYY-MM-DD）——与后端 dueReminders/billPay 守卫同口径 */
  const cn = new Date(Date.now() + 8 * 3600e3);
  const monthStart = new Date(Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const paidThisPeriod = (b) => !!(b.last_paid_at && String(b.last_paid_at).slice(0, 10) >= monthStart);
  const render = async () => {
    const r = await S.api.get("/api/bills");
    const el = document.getElementById("bills");
    if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    el.innerHTML = (r.data.bills ?? []).map((b) => {
      const paid = b.id !== "credit-repay" && paidThisPeriod(b);
      /* 第一百二十轮行重构：①类名化去内联样式（手机端两行布局接管）；②.bl-ops flex-wrap——
       * i18n 冷启动回退键名宽文本时换行而非溢出（第一百一十九轮 Q2：溢出把隐形 checkbox
       * (z-index:1) 推进「立即缴费」按钮领地，首击点按钮左半实际命中开关=开关翻转，配合
       * components.css .switch z-index:0 栈包含双保险）；③credit-repay 开关位改提示文案（Q1） */
      return `
    <div class="list-row bl-row">
      <span class="bl-ava">${S.ui.icon("doc", 18)}</span>
      <div class="grow"><b>${S.fmt.escape(b.name)}</b>
        <div class="muted small">${S.t("bills.dueDay", b.due_day)} · ${b.last_paid_at ? S.t("bills.paid") : S.t("bills.unpaid")}${S.fmt.escape(S.t("common.simPrice"))}</div></div>
      <div class="bl-right"><div class="amt mono">¥${S.fmt.moneyPlain((Number(b.amount_cents) / 100).toFixed(2))}</div>
        <div class="bl-ops">
          ${b.id === "credit-repay"
            ? `<span class="muted small bl-cr" title="${S.fmt.escape(S.t("bills.crHint"))}">${S.fmt.escape(S.t("bills.crHintShort"))}</span>`
            : `<label class="bl-ap" title="${S.fmt.escape(S.t("bills.autopayHint"))}"><span class="muted small">${S.fmt.escape(S.t("bills.autopay"))}</span><span class="switch"><input type="checkbox" data-ap="${b.id}" data-day="${b.due_day}" data-amt="${(Number(b.amount_cents) / 100).toFixed(2)}" data-paid="${paid ? 1 : 0}" ${Number(b.autopay) === 1 ? "checked" : ""}><span class="tk"></span></span></label>`}
          ${paid
            ? `<button class="btn btn-sm btn-light pay-bill" disabled style="opacity:.55;cursor:not-allowed">${S.fmt.escape(S.t("bills.paidBtn"))}</button>`
            : `<button class="btn btn-sm btn-light pay-bill" data-id="${b.id}" data-name="${S.fmt.escape(b.name)}" data-amt="${(Number(b.amount_cents) / 100).toFixed(2)}" data-ap-on="${Number(b.autopay) === 1 ? 1 : 0}">${S.fmt.escape(S.t("bills.pay"))}</button>`}
        </div></div>
    </div>`;
    }).join("");
    S.ui.$$(".pay-bill[data-id]").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        const r2 = await S.api.mutate(`/api/bills/${btn.dataset.id}/pay`, {}, { subject: btn.dataset.name });
        if (r2.cancelled) { btn.disabled = false; return; }
        if (r2.data?.status === "EXECUTED") {
          /* 具体化：金额+扣款卡；开关开启时澄清本月自动缴费将跳过（不双扣） */
          S.ui.toast(S.t("bills.paidToast", btn.dataset.amt) + (btn.dataset.apOn === "1" ? S.t("bills.autoSkip") : ""));
          render();
        }
        else { S.ui.toast(S.fmt.blockedMsg(r2), true); btn.disabled = false; }
      };
    });
    S.ui.$$("[data-ap]").forEach((sw) => {
      sw.onchange = async () => {
        /* autopay 路由为 PATCH（mutate 默认 POST 会 501，开关永远弹回） */
        const r2 = await S.api.mutate(`/api/bills/${sw.dataset.ap}/autopay`, { enabled: sw.checked }, { method: "PATCH" });
        if (r2.cancelled) { sw.checked = !sw.checked; return; }
        if (r2.data?.status !== "EXECUTED") { sw.checked = !sw.checked; S.ui.toast(S.fmt.blockedMsg(r2), true); return; }
        if (sw.checked) S.ui.toast(S.t("bills.autoOn", sw.dataset.day, sw.dataset.amt) + (sw.dataset.paid === "1" ? S.t("bills.autoOnNext") : ""));
        else S.ui.toast(S.t("bills.autoOff"));
      };
    });
  };
  render();
});
