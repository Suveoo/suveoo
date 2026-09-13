/* genui/cards.js — 11 种 Verified GenUI 卡片（数据全部来自已验证 IR 快照） */
S.genuiCards = {
  kv(pairs) {
    return pairs.filter(([k, v]) => v != null).map(([k, v]) => `<div class="gc-kv"><span class="muted">${S.fmt.escape(k)}</span><span class="v">${S.fmt.escape(v)}</span></div>`).join("");
  },
  transfer_confirmation(c) {
    const p = { ...(c.snapshot?.params ?? {}), recipient_display: c.params?.recipient_display, recipient_name: c.params?.recipient_name ?? c.snapshot?.params?.recipient_name };
    const amt = p.amount_cny ?? p.amount ?? "0";
    return `<div class="genui-card">
      <div class="gc-head">${S.ui.icon("send", 16)} ${S.t("genui.confirmTransfer")} ${S.ui.tierBadge(c.tier)}</div>
      <div class="gc-amount">¥ ${S.fmt.moneyPlain(amt)}</div>
      ${S.genuiCards.kv([
        [S.t("genui.to"), p.recipient_display ?? p.recipient_name ?? p.recipient ?? (p.bill_id ? S.t("genui.billNo", p.bill_id) : p.item)],
        [S.t("genui.fee"), "¥0.00"], ["Currency", p.currency ?? "CNY"],
        [S.t("genui.trace"), c.trace_id ?? "—"],
      ])}
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
    return `<div class="genui-card insight-card"><img src="/assets/images/suveoo-ai-logo.svg" alt="">
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
