/* transactions.js — P31 交易记录（第十四轮改版：结论区图表重排 + 搜索/方向/时间/分类筛选 + 导出 CSV；
   全部流水原样保留，点击行回执弹窗保留。无渐变 Hero——工具页简单大标题。） */
S.router.register("transactions", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between" style="align-items:center"><h1 style="margin:0">${S.fmt.escape(S.t("pay.txHistory"))}</h1>
      <button class="btn btn-sm btn-light th-export" id="tx-export">${S.ui.icon("download", 14)} ${S.fmt.escape(S.t("hist.export"))}</button></div>
    <div id="tx-summary"></div>
    <div class="help-search card th-search">
      <span class="hs-ic">${S.ui.icon("doc", 18)}</span>
      <input class="input" id="tx-q" type="search" placeholder="${S.fmt.escape(S.t("tx.searchPh"))}" autocomplete="off">
      <span class="muted small mono" id="tx-count"></span>
    </div>
    <div class="th-chips" id="tx-chips"></div>
    <div class="card" id="tx-list-card"><div class="tl-head" id="tl-head"></div><div id="tx-list">${S.ui.skeleton(6)}</div></div>`;
  const el = document.getElementById("tx-list");
  let cursor = "0";
  const all = [];
  const filters = { q: "", dir: "all", days: 0, cat: "" };
  const load = async () => {
    const r = await S.api.get(`/api/transfers?scope=all${cursor && cursor !== "0" ? `&cursor=${cursor}` : ""}`);
    if (!r.ok) return null;
    return r.data;
  };

  /* ---- 结论区（零 LLM、纯聚合）：本月收/支/结余 + 环比（pill 移到标签右侧）+ 分类环比（标题-图空白压缩） ---- */
  S.api.get("/api/dashboard").then((r) => { if (r.ok) renderSummary(r.data); }).catch(() => {});
  const renderSummary = (dash) => {
    const now = new Date();
    const thisM = now.toISOString().slice(0, 7);
    const lastM = new Date(now.getTime() - 26 * 86400000).toISOString().slice(0, 7);
    const g = { inT: 0, outT: 0, inL: 0, outL: 0 };
    for (const r of dash.monthly ?? []) {
      if (r.m === thisM) { if (r.direction === "IN") g.inT = Number(r.total); else g.outT = Number(r.total); }
      if (r.m === lastM) { if (r.direction === "IN") g.inL = Number(r.total); else g.outL = Number(r.total); }
    }
    if (!g.inT && !g.outT) return; /* 无本月数据不渲染结论区（流水列表照常） */
    const y = (cents) => S.fmt.moneyPlain((cents / 100).toFixed(2));
    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
    const pill = (p, inverse) => {
      if (p == null) return "";
      const up = p >= 0;
      const cls = inverse ? (up ? "down" : "up") : (up ? "up" : "down");
      return `<span class="trend-pill ${cls}">${up ? "↑" : "↓"} ${Math.abs(p)}%</span>`;
    };
    /* 分类环比（OUT）：本月 vs 上月，取两月合计 Top6 类别 */
    const cat = {};
    for (const r of dash.by_category_month ?? []) {
      if (r.direction !== "OUT" || !r.category) continue;
      cat[r.category] = cat[r.category] || { t: 0, l: 0 };
      if (r.m === thisM) cat[r.category].t += Number(r.total);
      if (r.m === lastM) cat[r.category].l += Number(r.total);
    }
    const names = Object.keys(cat).sort((a, b) => (cat[b].t + cat[b].l) - (cat[a].t + cat[a].l)).slice(0, 6);
    let mainChange = "";
    let mainDelta = 0, mainCat = null;
    for (const k of Object.keys(cat)) {
      const d = cat[k].t - cat[k].l;
      if (Math.abs(d) > Math.abs(mainDelta)) { mainDelta = d; mainCat = k; }
    }
    if (mainCat && mainDelta !== 0) {
      mainChange = mainDelta > 0
        ? S.t("tx.mainUp", mainCat, y(Math.abs(mainDelta)))
        : S.t("tx.mainDown", mainCat, y(Math.abs(mainDelta)));
    }
    const chart = names.length
      ? S.charts.bar(
          [{ name: S.t("tx.thisMonth"), values: names.map((k) => Math.round(cat[k].t / 100)) }, { name: S.t("tx.lastMonth"), values: names.map((k) => Math.round(cat[k].l / 100)) }],
          { colors: ["#1E2A78", "#B7C0E8"], labels: names, padT: 8, noLegend: true })
      : "";
    /* 图例（本月/上月）由调用方拼进标题行右侧；智能分析（tx-main-change）按队长要求移到卡内最底（柱状图之下）并缩小 */
    const legendHtml = names.length ? `<span class="tx-legend"><i style="background:#1E2A78"></i>${S.fmt.escape(S.t("tx.thisMonth"))}</span><span class="tx-legend"><i style="background:#B7C0E8"></i>${S.fmt.escape(S.t("tx.lastMonth"))}</span>` : "";
    /* 环比胶囊移到"收入/支出"标签右侧（tx-cell-h 行内）；分类环比标题下距 2px 压空白 */
    document.getElementById("tx-summary").innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="row between" style="align-items:center"><b>${S.fmt.escape(S.t("tx.summaryTitle"))} · ${now.toLocaleDateString(S.i18n.lang || "zh-CN", { month: "long" })}</b></div>
        <div class="tx-sum-row">
          <div class="tx-cell"><div class="tx-cell-h"><span class="lb2">${S.fmt.escape(S.t("ch.inLabel"))}</span>${pill(pct(g.inT, g.inL))}</div><span class="n trend-up">¥${y(g.inT)}</span></div>
          <div class="tx-cell"><div class="tx-cell-h"><span class="lb2">${S.fmt.escape(S.t("ch.outLabel"))}</span>${pill(pct(g.outT, g.outL), true)}</div><span class="n">¥${y(g.outT)}</span></div>
          <div class="tx-cell"><div class="tx-cell-h"><span class="lb2">${S.fmt.escape(S.t("tx.net"))}</span></div><span class="n ${g.inT - g.outT >= 0 ? "trend-up" : "trend-down"}">¥${y(g.inT - g.outT)}</span></div>
        </div>
        ${chart ? `<div class="tx-cat-title"><span>${S.fmt.escape(S.t("tx.catCompare"))}</span><span class="tx-legend-row">${legendHtml}</span></div>${chart}` : ""}
        ${mainChange ? `<div class="tx-main-change">${S.ui.icon("trend", 12)} ${S.fmt.escape(mainChange)}</div>` : ""}
      </div>`;
  };

  /* ---- 列表（过滤+分组+回执）：all 全集持有，筛选后全量重绘 ---- */
  await (async () => {
    const first = await load();
    if (!first) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    all.push(...(first.txs ?? []));
    cursor = first.next_cursor;
  })();
  if (!all.length && !cursor) { el.innerHTML = S.ui.empty(S.t("common.emptyTx")); }
  /* 分类 → 彩色 squircle 图标（pay/transactions/account 三副本律：改一处须同步三处） */
  const CAT_ICON = {
    "转账": "ic-pay-sky", "餐饮": "ic-star-orange", "购物": "ic-card-rose", "交通": "ic-exchange-teal",
    "娱乐": "ic-ai-violet", "生活服务": "ic-doc-gold", "医疗": "ic-shield-rose", "订阅": "ic-bell-teal",
    "理财": "ic-wealth-gold", "数码科技": "ic-chart-violet", "潮流收藏": "ic-trend-rose", "信用还款": "ic-card-navy",
  };
  const dayKey = (ts) => {
    const b = new Date(new Date(ts).getTime() + 8 * 3600_000), n = new Date(Date.now() + 8 * 3600_000);
    const n0 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    const diff = Math.round((n0 - b0) / 86400_000);
    return diff === 0 ? "pay.today" : diff === 1 ? "pay.yesterday" : "pay.earlier";
  };
  const yuan = (cents) => (Number(cents) / 100).toFixed(2);
  const match = (t) => {
    if (filters.dir !== "all" && t.direction !== filters.dir) return false;
    if (filters.days) { const cut = Date.now() - filters.days * 86400_000; if (new Date(t.ts).getTime() < cut) return false; }
    if (filters.cat && (t.category ?? "") !== filters.cat) return false;
    if (filters.q) {
      const hay = `${t.counterparty ?? ""} ${t.memo ?? ""} ${t.category ?? ""} ${t.id}`.toLowerCase();
      if (!hay.includes(filters.q)) return false;
    }
    return true;
  };
  const receipt = (t) => S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.receipt"))}</h2>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.txId"))}</span><span class="v mono">${S.fmt.escape(t.id)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.date"))}</span><span class="v">${S.fmt.datetime(t.ts)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.counterparty"))}</span><span class="v">${S.fmt.escape(t.counterparty ?? "")}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("contact.category"))}</span><span class="v">${S.fmt.escape(t.category ?? "")}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.amount"))}</span><span class="v mono">¥${S.fmt.moneyPlain(yuan(t.amount_cents))}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.note"))}</span><span class="v">${S.fmt.escape(t.memo ?? "—")}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.channel"))}</span><span class="v">${S.fmt.escape(t.channel === "ai" ? S.t("channel.ai") : t.channel === "task" ? S.t("channel.task") : t.channel === "mcp" ? "MCP" : S.t("channel.form"))}</span></div>
      ${t.trace_id ? `<div class="gc-kv"><span class="muted">Trace</span><span class="v mono small">${S.fmt.escape(t.trace_id)}</span></div>` : ""}`);
  const renderList = () => {
    const list = all.filter(match);
    document.getElementById("tx-count").textContent = (filters.q || filters.cat) ? `${list.length} ${S.t("help.results")}` : "";
    if (!list.length) { el.innerHTML = S.ui.empty(S.t(all.length ? "hist.noMatch" : "common.emptyTx")); return; }
    let html = "", lastDay = null;
    for (const t of list) {
      const dk = dayKey(t.ts);
      if (dk !== lastDay) { html += `<div class="muted small pay-day">${S.fmt.escape(S.t(dk))}</div>`; lastDay = dk; }
      html += `
      <div class="list-row tx-row pay-tx" data-tx='${S.fmt.escape(JSON.stringify(t))}'>
        <span class="qi-wrap" style="width:34px;height:34px;flex:none">${S.ui.icon(CAT_ICON[t.category] ?? "ic-doc-navy", 26)}</span>
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b>
          <div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.category ?? "")}${t.channel === "ai" ? " · " + S.fmt.escape(S.t("channel.ai")) : ""}${t.channel === "task" ? " · " + S.fmt.escape(S.t("history.taskTag")) : ""}</div></div>
        <div style="text-align:right"><div class="amt" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain(yuan(t.amount_cents))}</div>
        <div class="muted small">${S.fmt.escape(t.status ?? "")}</div></div>
      </div>`;
    }
    el.innerHTML = html;
    S.ui.$$(".tx-row", el).forEach((row) => { row.onclick = () => receipt(JSON.parse(row.dataset.tx)); });
  };

  /* ---- chips（方向/时间，hpill 激活 navy）；分类下拉（动态类别集）挪进列表卡内部左上（第十四轮队长要求） ---- */
  const chipDefs = [
    ["dir", "all", "hist.dirAll"], ["dir", "IN", "hist.dirIn"], ["dir", "OUT", "hist.dirOut"],
    ["days", 0, "hist.dAll"], ["days", 7, "hist.d7"], ["days", 30, "hist.d30"],
  ];
  const renderChips = () => {
    document.getElementById("tx-chips").innerHTML = chipDefs.map(([k, v, key]) =>
      `<button class="hpill${String(filters[k]) === String(v) ? " on" : ""}" data-k="${k}" data-v="${v}">${S.fmt.escape(S.t(key))}</button>`).join("");
    S.ui.$$("#tx-chips .hpill").forEach((b) => {
      b.onclick = () => { filters[b.dataset.k] = b.dataset.k === "days" ? Number(b.dataset.v) : b.dataset.v; renderChips(); renderList(); };
    });
  };
  const catSet = [...new Set(all.map((t) => t.category).filter(Boolean))];
  const catSel = S.ctl.select({
    label: S.t("tx.catCompare"), value: "",
    options: [{ v: "", label: S.t("tx.catAll") }, ...catSet.map((k) => ({ v: k, label: k }))],
    onChange: (v) => { filters.cat = v; renderList(); },
  });
  document.getElementById("tl-head").appendChild(catSel);
  const q = document.getElementById("tx-q");
  q.addEventListener("input", () => { filters.q = q.value.trim().toLowerCase(); renderList(); });
  renderChips();
  renderList();

  /* ---- 导出 CSV（已加载全集；BOM+转义，同 /transfer/history） ---- */
  document.getElementById("tx-export").onclick = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["单号", "时间", "对手方", "方向", "金额", "分类", "状态", "备注", "渠道", "Trace"],
      ...all.map((t) => [t.id, S.fmt.datetime(t.ts), t.counterparty ?? "", t.direction === "IN" ? "收入" : "支出", yuan(t.amount_cents), t.category ?? "", t.status ?? "", t.memo ?? "", t.channel ?? "", t.trace_id ?? ""])];
    const csv = "\uFEFF" + rows.map((r2) => r2.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `suveoo-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    S.ui.toast(S.t("hist.exported"));
  };

  /* ---- 加载更多（追加后重绘列表；分类下拉选项不回填——新分类少见，重进页面即全量） ---- */
  const mw = document.createElement("div");
  mw.className = "center";
  mw.style.marginTop = "12px";
  document.getElementById("tx-list-card").after(mw);
  const moreWrap = () => {
    if (!cursor) { mw.innerHTML = ""; return; }
    mw.innerHTML = `<button class="btn btn-ghost" id="tx-more">${S.fmt.escape(S.t("common.more"))}</button>`;
    document.getElementById("tx-more").onclick = async () => {
      const r2 = await load();
      if (!r2) return;
      all.push(...(r2.txs ?? []));
      cursor = r2.next_cursor;
      renderList();
      moreWrap();
    };
  };
  renderList();
  if (!cursor && !all.length) { el.innerHTML = S.ui.empty(S.t("common.emptyTx")); }
  moreWrap();
});
