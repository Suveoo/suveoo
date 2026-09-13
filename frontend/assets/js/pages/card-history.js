/* card-history.js — P25 单卡交易明细（slug 取自 URL） */
S.router.register("card-history", async () => {
  const c = document.getElementById("content");
  const slug = (location.pathname.match(/\/account\/card\/([a-z0-9-]+)/) ?? [])[1];
  c.innerHTML = `<h1>${S.fmt.escape(S.t("cards.history"))} <span class="muted small mono">${S.fmt.escape(slug ?? "")}</span></h1>
    <div class="card">${S.ui.skeleton(6)}</div>`;
  const card = (await S.api.get(`/api/cards/${slug}`)).data?.card;
  if (card) {
    c.querySelector("h1 .mono").textContent = `${card.number} · ${card.network}`;
  }
  const r = await S.api.get(`/api/cards/${slug}/transactions`);
  const el = c.querySelector(".card");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const byDay = {};
  for (const t of r.data.txs ?? []) (byDay[t.ts?.slice(0, 10) ?? "—"] ??= []).push(t);
  el.innerHTML = Object.entries(byDay).map(([day, list]) => `
    <div class="muted small" style="margin:10px 0 2px">${S.fmt.escape(day)}</div>
    ${list.map((t) => `<div class="list-row">
      <span class="avatar">${S.ui.icon(t.direction === "IN" ? "plus" : "pay", 12)}</span>
      <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b><div class="muted small">${S.fmt.escape(t.category ?? "")}${t.memo ? " · " + S.fmt.escape(t.memo.slice(0, 30)) : ""}</div></div>
      <div class="amt" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
    </div>`).join("")}`).join("") || S.ui.empty(S.t("common.emptyTx"));
});
