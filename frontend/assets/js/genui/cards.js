/* genui/cards.js — 11 种 Verified GenUI 卡片（数据全部来自已验证 IR 快照） */
S.genuiCards = {
  kv(pairs) {
    return pairs.filter(([k, v]) => v != null).map(([k, v]) => `<div class="gc-kv"><span class="muted">${S.fmt.escape(k)}</span><span class="v">${S.fmt.escape(v)}</span></div>`).join("");
  },
  /* 确认卡按操作定制：intent → 标题键/图标/主字段标签；fee 仅对有资金流动的操作展示 */
  confirmMeta: {
    transfer_execute:    { title: "genui.confirmTransfer", icon: "send",     field: "genui.to",       fee: true },
    ecommerce_order_mock:{ title: "genui.confirmTransfer", icon: "pay",      field: "genui.merchant", fee: true },
    bill_pay:            { title: "genui.confirmBillPay",  icon: "pay",      field: "genui.merchant", fee: true },
    scheduled_task_create:{ title: "genui.confirmSchedule", icon: "clock",   field: "genui.to",       fee: false },
    wealth_product_purchase: { title: "genui.confirmPurchase", icon: "wealth", field: "genui.product", fee: false },
    wealth_product_redeem:   { title: "genui.confirmRedeem",   icon: "wealth", field: "genui.product", fee: false },
    deposit:             { title: "genui.confirmDeposit",  icon: "bank",     field: "genui.product", fee: false },
    fx_exchange:         { title: "genui.confirmFx",       icon: "exchange", field: null,             fee: true },
    card_limit_adjust:   { title: "genui.confirmLimit",    icon: "gear",     field: "genui.card",     fee: false },
    card_freeze:         { title: "genui.confirmFreeze",   icon: "lock",     field: "genui.card",     fee: false },
    card_unfreeze:       { title: "genui.confirmUnfreeze", icon: "lock",     field: "genui.card",     fee: false },
    subscription_cancel: { title: "genui.confirmSubCancel", icon: "star",    field: "genui.merchant",  fee: false },
    subscription_reminder_toggle: { title: "genui.confirmSubReminder", icon: "clock", field: "genui.merchant", fee: false },
    deposit_open:        { title: "genui.confirmDeposit",  icon: "bank",     field: "genui.product",   fee: false },
    task_cancel:         { title: "genui.confirmTaskCancel", icon: "clock",  field: null,             fee: false },
    /* 第二十二期：目标系确认卡（存入/调整/放弃；月度自动存入走 scheduled_task_create 分型） */
    goal_create:         { title: "genui.confirmGoalCreate", icon: "star",   field: "genui.goalName", fee: false },
    goal_contribute:     { title: "genui.confirmGoalContribute", icon: "wealth", field: "genui.goalName", fee: false },
    goal_adjust:         { title: "genui.confirmGoalAdjust", icon: "gear",   field: "genui.goalName", fee: false },
    goal_abandon:        { title: "genui.confirmGoalAbandon", icon: "lock",  field: "genui.goalName", fee: false },
    /* 未逐一列举的守卫操作（收款人/自动缴费/订阅退订等）走通用标题，不再误称"确认转账" */
    generic:             { title: "genui.confirmAction",   icon: "shield",   field: null,             fee: false },
  },
  transfer_confirmation(c) {
    /* 外层 params（genuiCardFor：完整 IR params + 展示字段）全量覆盖 snapshot（仅 authFields）——
       display/memo/execute_at 等非授权字段一律以服务端展开的外层为准 */
    const p = { ...(c.snapshot?.params ?? {}), ...(c.params ?? {}) };
    const meta = c.action == null ? this.confirmMeta.transfer_execute : (this.confirmMeta[c.action] ?? this.confirmMeta.generic);
    /* 修复 5：长程任务确认卡按 task_type 分型——birthday/reminder/goal_contribution 不再套"预约转账确认"（前缀兼容口径同后端） */
    const tt = c.action === "scheduled_task_create" ? String(p.task_type ?? "") : "";
    const isBd = tt.startsWith("birthday_flower");
    const isRem = tt === "reminder";
    const isGoalTask = tt === "goal_contribution";
    const titleKey = isBd ? "genui.confirmBirthday" : isRem ? "genui.confirmReminder" : isGoalTask ? "genui.confirmGoalTask" : meta.title;
    const fieldKey = isBd ? "genui.taskItem" : isRem ? "genui.remindItem" : isGoalTask ? "genui.goalName" : meta.field;
    /* 主字段取值：转账收收款人、理财/存款收产品名（subject 由调用方传入）、缴费收账单号；
       birthday 收预订内容（缺 item 回落任务标题）、reminder 收任务标题 */
    let subject = c.subject ?? null;
    if (!subject) {
      if (c.action === "bill_pay" || (c.action == null && p.bill_id != null)) subject = p.bill_id != null ? S.t("genui.billNo", p.bill_id) : null;
      else if (c.action === "card_limit_adjust" || c.action === "card_freeze" || c.action === "card_unfreeze") subject = p.card_id ?? null;
      else if (c.action === "subscription_cancel") subject = p.subscription_merchant ?? ("#" + (p.subscription_id ?? "—"));
      else if (c.action === "subscription_reminder_toggle") subject = p.subscription_merchant ?? ("#" + (p.subscription_id ?? "—"));
      else if (c.action === "deposit_open") subject = p.product_display ?? p.product_id ?? null;
      else if (c.action === "task_cancel") subject = p.task_title ?? ("#" + (p.task_id ?? "—"));
      else if (c.action === "fx_exchange") subject = null;
      else if (isBd) subject = p.item ?? p.title ?? null;
      else if (isRem) subject = p.title ?? null;
      else if (isGoalTask) subject = p.goal_name ?? ("#" + (p.goal_id ?? "—"));
      else if (c.action === "goal_create") subject = p.name ?? null;
      else if (c.action === "goal_contribute" || c.action === "goal_adjust" || c.action === "goal_abandon") subject = p.goal_name ?? ("#" + (p.goal_id ?? "—"));
      else {
        /* REST 通道快照里的 recipient 是内部引用（self:/acct:/payee:）——回落为友好展示，不裸露 slug */
        const r0 = p.recipient_display ?? p.recipient_name ?? p.recipient ?? p.product_id ?? p.item ?? null;
        subject = typeof r0 === "string" && r0.startsWith("self:") ? S.t("genui.selfTo")
          : typeof r0 === "string" && r0.startsWith("acct:") && !p.recipient_name ? `**** ${r0.slice(-4)}`
          : typeof r0 === "string" && r0.startsWith("payee:") ? S.t("genui.payeeRef", r0.slice(6))
          : r0;
      }
    }
    const rawAmt = p.amount_cny ?? (c.action === "subscription_cancel" ? p.subscription_amount : undefined) ?? p.amount ?? (c.action === "card_limit_adjust" ? p.new_limit : null);
    /* "ALL" 全额赎回占位按文案显示；既无金额也无 ALL（退订/开关类操作）不渲染金额行——
       此前误落 genui.redeemAll 把退订确认卡显示成"全部持仓"（第六期 idle 生产实测抓出，存量 bug） */
    const amtText = rawAmt != null && /^\d+(\.\d{1,2})?$/.test(String(rawAmt)) ? `¥ ${S.fmt.moneyPlain(rawAmt)}` : (String(rawAmt) === "ALL" ? S.t("genui.redeemAll") : null);
    /* 转账确认卡：收款方已通过真实性校验（服务端 genuiCardFor 附带 verified） */
    const verifiedBadge = c.action == null || c.action === "transfer_execute" ? (c.params?.verified ? ` ${S.ui.badge(S.t("genui.verified"), "badge-green")}` : "") : "";
    return `<div class="genui-card">
      <div class="gc-head">${S.ui.icon(meta.icon, 16)} ${S.t(titleKey)} ${S.ui.tierBadge(c.tier)}${verifiedBadge}</div>
      ${amtText ? `<div class="gc-amount">${amtText}</div>` : ""}
      ${S.genuiCards.kv([
        ...(fieldKey && subject != null ? [[S.t(fieldKey), subject]] : []),
        ...(p.from_card_display != null ? [[S.t("genui.fromCard"), p.from_card_display]] : []),
        ...(p.memo != null && String(p.memo) !== "" ? [[S.t("genui.memo"), p.memo]] : []),
        ...(c.action === "subscription_cancel" ? [
          ...(p.subscription_amount != null ? [[S.t("genui.subFee"), `¥${S.fmt.moneyPlain(p.subscription_amount)} / ${S.fmt.escape(p.subscription_cycle ?? "月")}`]] : []),
          ...(p.subscription_next != null ? [[S.t("genui.subNext"), S.fmt.escape(p.subscription_next)]] : []),
        ] : []),
        ...(c.action === "task_cancel" && p.task_next != null ? [[S.t("genui.executeAt"), S.fmt.datetime(p.task_next)]] : []),
        ...(c.action === "scheduled_task_create" && p.execute_at != null ? [[S.t("genui.executeAt"), S.fmt.datetime(p.execute_at)]] : []),
        ...(c.action === "scheduled_task_create" && p.repeat != null ? [[S.t("genui.repeatRule"), p.repeat === "monthly" ? S.t("sch.monthly") : p.repeat === "yearly" ? S.t("sch.yearly") : S.t("sch.once")]] : []),
        ...(c.action === "card_limit_adjust" && p.new_limit != null ? [[S.t("genui.newLimit"), "¥" + S.fmt.moneyPlain(p.new_limit)]] : []),
        ...(c.action === "subscription_reminder_toggle" ? [
          [S.t("genui.reminderState"), p.enabled ? S.t("genui.stateOn") : S.t("genui.stateOff")],
        ] : []),
        ...(c.action === "goal_create" && p.monthly_plan != null ? [
          [S.t("genui.goalMonthly"), "¥" + S.fmt.moneyPlain(p.monthly_plan)],
          [S.t("genui.deadline"), S.fmt.escape(String(p.deadline ?? "—"))],
        ] : []),
        ...((c.action === "goal_contribute" || c.action === "goal_adjust" || c.action === "goal_abandon") && p.goal_progress != null ? [
          [S.t("genui.goalProgress"), S.fmt.escape(String(p.goal_progress))],
        ] : []),
        ...(c.action === "goal_adjust" && p.monthly_plan != null ? [
          [S.t("genui.goalMonthlyNew"), "¥" + S.fmt.moneyPlain(p.monthly_plan)],
        ] : []),
        ...(meta.fee ? [[S.t("genui.fee"), "¥0.00"]] : []),
        ...(p.currency != null ? [["Currency", p.currency]] : []),
        [S.t("genui.trace"), c.trace_id ?? "—"],
      ])}
      ${isBd && amtText ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.lockNote", S.fmt.moneyPlain(rawAmt)))}</p>` : ""}
      ${c.action === "subscription_cancel" ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.subCancelNote"))}</p>` : ""}
      ${c.action === "task_cancel" ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.taskCancelNote"))}</p>` : ""}
      ${c.action === "goal_contribute" ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.goalNote"))}</p>` : ""}
      ${c.action === "goal_abandon" ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.goalAbandonNote"))}</p>` : ""}
      ${isGoalTask ? `<p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.goalTaskNote"))}</p>` : ""}
      <div class="gc-grant">grant ${String(c.grant_hash ?? "").slice(0, 12)}…</div>
    </div>`;
  },
  split_bill_detail(c) {
    const rows = (c.splits ?? []).map((s) => `<div class="split-row"><span>${S.fmt.escape(s.name)}</span><span class="mono">¥${s.amount}</span></div>`).join("");
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("pay", 16)} ${S.t("genui.splitTitle")}</div>${rows}
      <div class="split-sum"><span>${S.t("genui.total")}</span><span class="mono">¥${c.total ?? "—"}</span></div></div>`;
  },
  wealth_compare(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("wealth", 16)} ${S.t("genui.wealthTitle")} ${S.ui.tierBadge(c.tier)}</div>
      ${S.genuiCards.kv([[S.t("genui.product"), c.snapshot?.params?.product_id], [S.t("genui.amount"), "¥" + (c.snapshot?.params?.amount ?? "0")]])}
      <p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.riskNote"))}</p></div>`;
  },
  sankey_chart(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("chart", 16)} ${S.t("genui.sankeyTitle")}</div>
      ${(c.rows ?? []).map((r) => `<div class="split-row"><span>${S.fmt.escape(r.category ?? r.name)}</span><span class="mono">¥${r.total}</span></div>`).join("")}
      <p class="small muted" style="margin-top:8px">${S.fmt.escape(S.t("genui.anomalyNote"))}</p></div>`;
  },
  subscription_list(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("star", 16)} ${S.t("genui.subsTitle")}</div>
      ${(c.subscriptions ?? []).map((s) => `<div class="split-row"><span>${S.fmt.escape(s.merchant)}<span class="usage-bar"><i style="width:${s.usage_score ?? 0}%"></i></span></span><span class="mono">¥${s.amount}</span></div>`).join("")}</div>`;
  },
  scheduled_task(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("clock", 16)} ${S.t("genui.taskTitle")} ${S.ui.tierBadge(c.tier)}</div>
      ${(c.steps ?? [`T1 ${S.ui.icon("check", 12)} ${S.t("genui.stepLock")}`, `T2 … ${S.t("genui.stepOrder")}`, `C1 … ${S.t("genui.stepBackup")}`]).map((s) => `<div class="task-step"><span class="st">•</span>${s}</div>`).join("")}
      ${S.genuiCards.kv([[S.t("genui.budget"), c.snapshot?.params?.amount ? "¥" + c.snapshot.params.amount : null]])}</div>`;
  },
  card_setting_confirm(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("gear", 16)} ${S.t("genui.cardSetting")} ${S.ui.tierBadge(c.tier)}</div>
      ${S.genuiCards.kv([[S.t("genui.card"), c.snapshot?.params?.card_id], [S.t("genui.newLimit"), c.snapshot?.params?.new_limit ? "¥" + c.snapshot.params.new_limit : null]])}</div>`;
  },
  fx_quote(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("exchange", 16)} ${S.t("genui.fxTitle")}</div>
      ${S.genuiCards.kv(Object.entries(c.snapshot?.params ?? {}).map(([k, v]) => [k, String(v)]))}</div>`;
  },
  insight_card(c) {
    return `<div class="genui-card insight-card"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt="">
      <div><b>${S.fmt.escape(c.title ?? S.t("genui.insight"))}</b><p class="muted small" style="margin-top:4px">${S.fmt.escape(c.body ?? "")}</p></div></div>`;
  },
  blocked_notice(c) {
    return `<div class="genui-card gc-blocked"><div class="gc-head">${S.ui.icon("lock", 16)} BLOCKED · ${S.fmt.escape(c.reason ?? "BLOCKED")}</div>
      <p class="small">${S.fmt.escape(S.t("genui.blockedBody"))}</p>
      ${c.trace_id ? `<div class="gc-grant">${c.trace_id}</div>` : ""}</div>`;
  },
  report_download(c) {
    return `<div class="genui-card"><div class="gc-head">${S.ui.icon("doc", 16)} ${S.t("genui.reportTitle")}</div>
      ${S.genuiCards.kv([[S.t("genui.month"), c.month]])}<div class="gc-actions"><a class="btn btn-primary" href="/account/downloads">${S.t("genui.goDownload")}</a></div></div>`;
  },
  fallback(c) { return `<div class="genui-card"><div class="gc-head">${S.ui.icon("ai", 16)} ${S.fmt.escape(c.component ?? "card")}</div><pre class="small">${S.fmt.escape(JSON.stringify(c.snapshot ?? c, null, 2))}</pre></div>`; },
};
