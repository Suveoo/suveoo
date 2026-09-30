/* transfer-history.js — P10 转账记录（第十二轮改版：统计条 + 搜索 + 方向/日期 chips + 导出 CSV + 分类图标 + 日期分组；
   仅转账类流水（scope=transfers），全量收支见 /account/transactions。点击行回执弹窗保留。 */
S.router.register("transfer-history", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between" style="align-items:center"><h1 style="margin:0">${S.fmt.escape(S.t("pay.history"))}</h1>
      <button class="btn btn-sm btn-light th-export" id="th-export">${S.ui.icon("download", 14)} ${S.fmt.escape(S.t("hist.export"))}</button></div>
    <div class="th-stats" id="th-stats">${S.ui.skeleton(1)}</div>
    <div class="help-search card th-search">
      <span class="hs-ic">${S.ui.icon("doc", 18)}</span>
      <input class="input" id="th-q" type="search" placeholder="${S.fmt.escape(S.t("hist.searchPh"))}" autocomplete="off">
      <span class="muted small mono" id="th-count"></span>
    </div>
    <div class="th-chips" id="th-chips"></div>
    <div class="card" id="th-card">${S.ui.skeleton(6)}</div>`;
  const r = await S.api.get("/api/transfers?scope=transfers");
  const card = document.getElementById("th-card");
  if (!r.ok) { card.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const all = [...(r.data.txs ?? [])];          /* 已加载全集（分页追加） */
  let cursor = r.data.next_cursor;
  const filters = { q: "", dir: "all", days: 0 }; /* days: 0=全部 7/30 */

  /* 统计条（基于已加载全集；num 风格中等数字） */
  const yuan = (cents) => (Number(cents) / 100).toFixed(2);
  const renderStats = () => {
    const sum = (dir) => all.filter((t) => t.direction === dir).reduce((a, t) => a + Number(t.amount_cents), 0);
    document.getElementById("th-stats").innerHTML = `
      <div class="th-stat"><span class="lb">${S.fmt.escape(S.t("hist.inSum"))}</span><span class="n mono" style="color:var(--color-green)">+¥${S.fmt.moneyPlain(yuan(sum("IN")))}</span></div>
      <div class="th-stat"><span class="lb">${S.fmt.escape(S.t("hist.outSum"))}</span><span class="n mono">-¥${S.fmt.moneyPlain(yuan(sum("OUT")))}</span></div>
      <div class="th-stat"><span class="lb">${S.fmt.escape(S.t("hist.count"))}</span><span class="n mono">${all.length}</span></div>`;
  };

  /* chips：方向 + 时间范围（hpill 同款，激活 navy） */
  const chipDefs = [
    ["dir", "all", "hist.dirAll"], ["dir", "IN", "hist.dirIn"], ["dir", "OUT", "hist.dirOut"],
    ["days", 0, "hist.dAll"], ["days", 7, "hist.d7"], ["days", 30, "hist.d30"],
  ];
  const renderChips = () => {
    document.getElementById("th-chips").innerHTML = chipDefs.map(([k, v, key]) =>
      `<button class="hpill${String(filters[k]) === String(v) ? " on" : ""}" data-k="${k}" data-v="${v}">${S.fmt.escape(S.t(key))}</button>`).join("");
    S.ui.$$("#th-chips .hpill").forEach((b) => {
      b.onclick = () => { filters[b.dataset.k] = b.dataset.k === "days" ? Number(b.dataset.v) : b.dataset.v; renderChips(); apply(); };
    });
  };

  /* 过滤：搜索（收款人/备注/单号）+ 方向 + 时间窗 */
  const match = (t) => {
    if (filters.dir !== "all" && t.direction !== filters.dir) return false;
    if (filters.days) { const cut = Date.now() - filters.days * 86400_000; if (new Date(t.ts).getTime() < cut) return false; }
    if (filters.q) {
      const hay = `${t.counterparty ?? ""} ${t.memo ?? ""} ${t.id}`.toLowerCase();
      if (!hay.includes(filters.q)) return false;
    }
    return true;
  };

  /* 日期分组（pay.js dayKey 同款北京日差值） */
  const dayKey = (ts) => {
    const b = new Date(new Date(ts).getTime() + 8 * 3600_000);
    const n = new Date(Date.now() + 8 * 3600_000);
    const diff = Math.round((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / 86400_000);
    return diff === 0 ? "pay.today" : diff === 1 ? "pay.yesterday" : "pay.earlier";
  };
  /* channel → 彩色 squircle 图标（form/ai=即时转账 ic-pay-sky；task=预约执行 ic-clock-violet） */
  const txIcon = (t) => (t.channel === "task" ? "ic-clock-violet" : "ic-pay-sky");

  const receipt = (t) => S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.receipt"))}</h2>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.txId"))}</span><span class="v mono">${S.fmt.escape(t.id)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.date"))}</span><span class="v">${S.fmt.datetime(t.ts)}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.counterparty"))}</span><span class="v">${S.fmt.escape(t.counterparty ?? "")}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.amount"))}</span><span class="v mono">¥${S.fmt.moneyPlain(yuan(t.amount_cents))}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.note"))}</span><span class="v">${S.fmt.escape(t.memo ?? "—")}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.channel"))}</span><span class="v">${S.fmt.escape(t.channel === "ai" ? S.t("channel.ai") : t.channel === "task" ? S.t("channel.task") : S.t("channel.form"))}</span></div>
      ${t.trace_id ? `<div class="gc-kv"><span class="muted">Trace</span><span class="v mono small">${S.fmt.escape(t.trace_id)}</span></div>` : ""}`);

  const renderList = () => {
    const list = all.filter(match);
    document.getElementById("th-count").textContent = filters.q ? `${list.length} ${S.t("help.results")}` : "";
    if (!list.length) { card.innerHTML = S.ui.empty(S.t(all.length ? "hist.noMatch" : "common.emptyTx")); return; }
    let html = "", lastKey = "";
    for (const t of list) {
      const k = dayKey(t.ts);
      if (k !== lastKey) { html += `<div class="muted small pay-day">${S.fmt.escape(S.t(k))}</div>`; lastKey = k; }
      html += `
      <div class="list-row tx-row pay-tx" data-tx='${S.fmt.escape(JSON.stringify(t))}'>
        <span class="qi-wrap" style="width:34px;height:34px">${S.ui.icon(txIcon(t), 26)}</span>
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b>
          <div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.channel === "task" ? S.t("hist.taskIcon") : S.t("pay.intrabank"))}</div></div>
        <div style="text-align:right"><div class="amt mono" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain(yuan(t.amount_cents))}</div>
        <div class="muted small">${S.fmt.escape(t.status ?? "")}</div></div>
      </div>`;
    }
    card.innerHTML = html;
    S.ui.$$(".tx-row", card).forEach((row) => { row.onclick = () => receipt(JSON.parse(row.dataset.tx)); });
  };
  const apply = () => { renderList(); renderStats(); };

  /* 导出 CSV（已加载全集；BOM 保 Excel 中文；转义逗号/引号/换行） */
  document.getElementById("th-export").onclick = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["单号", "时间", "收款人", "方向", "金额", "状态", "备注", "渠道", "Trace"],
      ...all.map((t) => [t.id, S.fmt.datetime(t.ts), t.counterparty ?? "", t.direction === "IN" ? "收入" : "支出", yuan(t.amount_cents), t.status ?? "", t.memo ?? "", t.channel ?? "", t.trace_id ?? ""])];
    const csv = "\uFEFF" + rows.map((r2) => r2.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `suveoo-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    S.ui.toast(S.t("hist.exported"));
  };

  /* 加载更多（追加后重渲染统计与列表） */
  const moreWrap = () => {
    const w = document.getElementById("more-wrap");
    if (!w) return;
    if (!cursor) { w.innerHTML = ""; return; }
    w.innerHTML = `<button class="btn btn-ghost" id="more">${S.fmt.escape(S.t("common.more"))}</button>`;
    document.getElementById("more").onclick = async () => {
      const r2 = await S.api.get(`/api/transfers?scope=transfers&cursor=${cursor}`);
      all.push(...(r2.data?.txs ?? []));
      cursor = r2.data?.next_cursor;
      apply();
      moreWrap();
    };
  };

  const q = document.getElementById("th-q");
  q.addEventListener("input", () => { filters.q = q.value.trim().toLowerCase(); renderList(); });
  renderStats();
  renderChips();
  renderList();
  card.insertAdjacentHTML("afterend", `<div class="center" style="margin-top:12px" id="more-wrap"></div>`);
  if (!all.length) card.innerHTML = S.ui.empty(S.t("common.emptyTx"));
  moreWrap();
});
