/* pay.js — P02 收付总览（第三十七轮改版：渐变 Hero + 玻璃块 + 无边框宫格 + tint 收款人卡 + 分类图标流水） */
S.router.register("pay", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `
    <div class="pay-hero bg-grad-navy">
      <div class="ph-ai" id="ai-bar" role="button" tabindex="0"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><span class="grow">${S.fmt.escape(S.t("pay.aiTry"))}</span><span class="ph-go">${S.ui.icon("arrow-right", 14)}</span></div>
      <div class="ph-main">
        <div class="ph-main-txt">
          <b>${S.fmt.escape(S.t("pay.intrabank"))}</b>
          <span>${S.fmt.escape(S.t("pay.heroSub"))}</span>
        </div>
        <a class="ph-cta" href="/transfer/intrabank">${S.ui.icon("send", 16)} ${S.fmt.escape(S.t("payees.transfer"))}</a>
      </div>
      <div class="ph-glass-row">
        <a class="ph-glass" href="/transfer/intrabank-scheduled">${S.ui.icon("clock", 18)}<span>${S.fmt.escape(S.t("pay.scheduled"))}</span></a>
        <div class="ph-glass soon" id="dis-cross" role="button" tabindex="0">${S.ui.icon("bank", 18)}<span>${S.fmt.escape(S.t("home.crossBank"))}</span><i class="ph-soon">${S.fmt.escape(S.t("pay.comingSoon"))}</i></div>
        <div class="ph-glass soon" id="dis-border" role="button" tabindex="0">${S.ui.icon("globe2", 18)}<span>${S.fmt.escape(S.t("home.crossBorder"))}</span><i class="ph-soon">${S.fmt.escape(S.t("pay.comingSoon"))}</i></div>
      </div>
    </div>
    <div class="card pay-svc-card">
      <div class="pay-svc-grid">
        <a class="svc-item" href="/transfer/history"><span class="qi-wrap">${S.ui.icon("ic-chart-sky", 30)}</span><span class="svc-label">${S.fmt.escape(S.t("pay.history"))}</span></a>
        <a class="svc-item" href="/account/transactions"><span class="qi-wrap">${S.ui.icon("ic-doc-violet", 30)}</span><span class="svc-label">${S.fmt.escape(S.t("pay.txHistory"))}</span></a>
        <a class="svc-item" href="/transfer/limits"><span class="qi-wrap">${S.ui.icon("ic-lock-gold", 30)}</span><span class="svc-label">${S.fmt.escape(S.t("pay.limits"))}</span></a>
        <a class="svc-item" href="/pay/bills"><span class="qi-wrap">${S.ui.icon("ic-doc-orange", 30)}</span><span class="svc-label">${S.fmt.escape(S.t("pay.billsEntry"))}</span></a>
      </div>
    </div>
    <div class="section-title pay-sec"><h2>${S.fmt.escape(S.t("pay.payees"))}</h2><a class="more" href="/transfer/payees">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="hscroll payees" id="payees">${S.ui.skeleton(2)}</div>
    <div class="section-title pay-sec"><h2>${S.fmt.escape(S.t("pay.recentAll"))}</h2><a class="more" href="/account/transactions">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="card pay-recent" id="recent">${S.ui.skeleton(3)}</div>`;
  document.getElementById("ai-bar").onclick = () => S.router.ai(S.t("prompt.hotpotAA"));
  const showDis = () => S.ui.modal(`<h2>${S.fmt.escape(S.t("common.more"))}</h2><p class="muted">${S.fmt.escape(S.t("home.crossDisabled"))}</p>${S.sim.footnote()}`);
  document.getElementById("dis-cross").onclick = showDis;
  document.getElementById("dis-border").onclick = showDis;
  const pr = await S.api.get("/api/payees");
  if (pr.ok) {
    const el = document.getElementById("payees");
    const TINTS = ["teal", "orange", "violet", "gold", "rose", "sky"];
    el.className = "hscroll payees";
    /* 手机端（≤767）首屏含添加卡后右上角不缺位：收款人 6→5；桌面不受影响 */
    const showN = window.matchMedia("(max-width: 767px)").matches ? 5 : 6;
    el.innerHTML = `<a class="payee-card payee-add" href="/transfer/payees?add=1"><span class="pc-plus">${S.ui.icon("plus", 18)}</span><span>${S.fmt.escape(S.t("pay.addPayee"))}</span></a>` + (pr.data.payees ?? []).slice(0, showN).map((p, i) => `
      <div class="payee-card bg-tint-${TINTS[i % TINTS.length]}">
        <div class="row" style="gap:8px;min-width:0"><span class="payee-ava">${S.fmt.escape(p.name.slice(0, 1))}</span><b class="pye-nm">${S.fmt.escape(p.name)}</b><span class="payee-badge">${S.fmt.escape(p.group_label ?? "")}</span></div>
        <div class="muted small mono" style="margin-top:6px">**** ${S.fmt.escape(String(p.account).slice(-4))}</div>
        <button class="btn btn-sm btn-light pay-now" data-id="${p.id}" data-name="${S.fmt.escape(p.name)}">${S.fmt.escape(S.t("payees.transfer"))}</button>
      </div>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".pay-now").forEach((b) => { b.onclick = () => (location.href = `/transfer/intrabank?payee=${b.dataset.id}`); });
  }
  const tr = await S.api.get("/api/transfers?scope=all");
  if (tr.ok) {
    /* 分类 → 彩色 squircle 图标（未知分类回退 doc/navy），日期分组：今天/昨天/更早 */
    const CAT_ICON = {
      "转账": "ic-pay-sky", "餐饮": "ic-star-orange", "购物": "ic-card-rose", "交通": "ic-exchange-teal",
      "娱乐": "ic-ai-violet", "生活服务": "ic-doc-gold", "医疗": "ic-shield-rose", "订阅": "ic-bell-teal",
      "理财": "ic-wealth-gold", "数码科技": "ic-chart-violet", "潮流收藏": "ic-trend-rose", "信用还款": "ic-card-navy",
    };
    const dayKey = (ts) => {
      const d = new Date(ts), n = new Date(Date.now() + 8 * 3600_000);
      const b = new Date(d.getTime() + 8 * 3600_000);
      const day = 86400_000;
      const n0 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
      const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
      const diff = Math.round((n0 - b0) / day);
      return diff === 0 ? "pay.today" : diff === 1 ? "pay.yesterday" : "pay.earlier";
    };
    const rows = (tr.data.txs ?? []).slice(0, 5);
    const groups = [];
    for (const t of rows) {
      const k = dayKey(t.ts);
      (groups[groups.length - 1]?.key === k ? groups[groups.length - 1].items : (groups.push({ key: k, items: [] }), groups[groups.length - 1].items)).push(t);
    }
    document.getElementById("recent").innerHTML = groups.map((g) => `
      <div class="muted small pay-day">${S.fmt.escape(S.t(g.key))}</div>
      ${g.items.map((t) => `
      <div class="list-row pay-tx"><span class="qi-wrap" style="width:34px;height:34px">${S.ui.icon(CAT_ICON[t.category] ?? "ic-doc-navy", 26)}</span>
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b><div class="muted small">${S.fmt.escape(t.category ?? "")} · ${S.fmt.datetime(t.ts)}</div></div>
        <div style="text-align:right"><div class="amt mono">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
        <div class="muted small">${S.fmt.escape(t.status ?? "")}</div></div>
      </div>`).join("")}`).join("") || S.ui.empty(S.t("common.emptyTx"));
  }
});
