/* transactions.js — P31 交易记录（D 改版：页顶"结果优先"结论区——本月收/支/结余 + 分类环比 + 主要变化来源；全部流水原样保留在下方，一条不删） */
S.router.register("transactions", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("pay.txHistory"))}</h1>
    <div id="tx-summary"></div>
    <div class="card">${S.ui.skeleton(6)}</div>`;
  const el = c.querySelector(".card");
  let cursor = "0";
  const load = async () => {
    const r = await S.api.get(`/api/transfers?scope=all${cursor && cursor !== "0" ? `&cursor=${cursor}` : ""}`);
    if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return null; }
    return r.data;
  };
  /* 结论区（零 LLM、纯聚合）：本月收/支/结余 + 环比 + 主要变化来自哪类 */
  S.api.get("/api/dashboard").then((r) => { if (!r.ok) return; renderSummary(r.data); }).catch(() => {});
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
          { colors: ["#1E2A78", "#B7C0E8"], labels: names })
      : "";
    document.getElementById("tx-summary").innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="row between" style="align-items:center"><b>${S.fmt.escape(S.t("tx.summaryTitle"))} · ${now.toLocaleDateString(S.i18n.lang || "zh-CN", { month: "long" })}</b></div>
        <div class="tx-sum-row">
          <div><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("ch.inLabel"))}</span><span class="n trend-up">¥${y(g.inT)}</span></div>${pill(pct(g.inT, g.inL))}</div>
          <div><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("ch.outLabel"))}</span><span class="n">¥${y(g.outT)}</span></div>${pill(pct(g.outT, g.outL), true)}</div>
          <div><div class="num-xl"><span class="lb">${S.fmt.escape(S.t("tx.net"))}</span><span class="n ${g.inT - g.outT >= 0 ? "trend-up" : "trend-down"}">¥${y(g.inT - g.outT)}</span></div></div>
        </div>
        ${mainChange ? `<div class="tx-main-change">${S.ui.icon("trend", 14)} ${S.fmt.escape(mainChange)}</div>` : ""}
        ${chart ? `<div class="section-title" style="margin:14px 0 6px"><h2 style="font-size:14px">${S.fmt.escape(S.t("tx.catCompare"))}</h2></div>${chart}` : ""}
      </div>`;
  };
  const first = await load();
  if (!first) return;
  let next = first.next_cursor;
  el.innerHTML = `<div id="tx-list"></div><div class="center" style="margin-top:12px" id="more-wrap"></div>`;
  const render = (list) => {
    document.getElementById("tx-list").insertAdjacentHTML("beforeend", list.map((t) => `
      <div class="list-row tx-row" data-tx='${S.fmt.escape(JSON.stringify(t))}'>
        <img src="/assets/images/suveoo-logo-circular.svg" width="32" height="32" alt="">
        <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b>
          <div class="muted small">${S.fmt.datetime(t.ts)} · ${S.fmt.escape(t.category ?? "")}${t.channel === "ai" ? " · " + S.fmt.escape(S.t("channel.ai")) : ""}${t.channel === "task" ? " · " + S.fmt.escape(S.t("history.taskTag")) : ""}</div></div>
        <div style="text-align:right"><div class="amt" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
        <div class="muted small">${S.fmt.escape(t.status ?? "")}</div></div>
      </div>`).join(""));
    S.ui.$$(".tx-row").forEach((row) => {
      row.onclick = () => {
        const t = JSON.parse(row.dataset.tx);
        S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.receipt"))}</h2>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.txId"))}</span><span class="v mono">${S.fmt.escape(t.id)}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.date"))}</span><span class="v">${S.fmt.datetime(t.ts)}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.counterparty"))}</span><span class="v">${S.fmt.escape(t.counterparty ?? "")}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("contact.category"))}</span><span class="v">${S.fmt.escape(t.category ?? "")}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.amount"))}</span><span class="v mono">¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.note"))}</span><span class="v">${S.fmt.escape(t.memo ?? "—")}</span></div>
          <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.channel"))}</span><span class="v">${S.fmt.escape(t.channel === "ai" ? S.t("channel.ai") : t.channel === "task" ? S.t("channel.task") : t.channel === "mcp" ? "MCP" : S.t("channel.form"))}</span></div>
          ${t.trace_id ? `<div class="gc-kv"><span class="muted">Trace</span><span class="v mono small">${S.fmt.escape(t.trace_id)}</span></div>` : ""}`);
      };
    });
  };
  render(first.txs ?? []);
  const mw = document.getElementById("more-wrap");
  if (!next && !(first.txs ?? []).length) { el.innerHTML = S.ui.empty(S.t("common.emptyTx")); return; }
  if (next) {
    mw.innerHTML = `<button class="btn btn-ghost" id="more">${S.fmt.escape(S.t("common.more"))}</button>`;
    document.getElementById("more").onclick = async () => {
      cursor = next;
      const r2 = await load();
      if (!r2) return;
      render(r2.txs ?? []);
      next = r2.next_cursor;
      if (!next) mw.innerHTML = "";
    };
  }
});
