/* transactions.js — P31 交易记录（全量收支：转账/消费/缴费/理财/外汇…一切流水） */
S.router.register("transactions", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("pay.txHistory"))}</h1>
    <div class="card">${S.ui.skeleton(6)}</div>`;
  const el = c.querySelector(".card");
  let cursor = "0";
  const load = async () => {
    const r = await S.api.get(`/api/transfers?scope=all${cursor && cursor !== "0" ? `&cursor=${cursor}` : ""}`);
    if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return null; }
    return r.data;
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
