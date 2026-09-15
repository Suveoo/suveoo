/* card-history.js — P25 单卡交易明细（类别 chips + 月度收支柱图 + 分页；slug 取自 URL） */
S.router.register("card-history", async () => {
  const c = document.getElementById("content");
  const slug = (location.pathname.match(/\/account\/card\/([a-z0-9-]+)/) ?? [])[1];
  c.innerHTML = `<h1>${S.fmt.escape(S.t("cards.history"))} <span class="muted small mono">${S.fmt.escape(slug ?? "")}</span></h1>
    <div class="tabs" id="ch-chips"></div>
    <div class="card" style="margin-top:12px">${S.ui.skeleton(6)}</div>`;
  const card = (await S.api.get(`/api/cards/${slug}`)).data?.card;
  if (card) c.querySelector("h1 .mono").textContent = `${card.number} · ${card.network}`;
  const r = await S.api.get(`/api/cards/${slug}/transactions`);
  const el = c.querySelector(".card");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const all = r.data.txs ?? [];
  let nextCursor = r.data.next_cursor ?? null; // 服务端当前一次返回，cursor 预留兼容
  /* 类别 chips：全部 + 数据中出现过的类别 */
  const cats = [...new Set(all.map((t) => t.category).filter(Boolean))];
  let cat = "ALL";
  c.querySelector("#ch-chips").innerHTML = ["ALL", ...cats].map((x) =>
    `<button class="tab${x === cat ? " active" : ""}" data-c="${S.fmt.escape(x)}">${x === "ALL" ? S.fmt.escape(S.t("common.all")) : S.fmt.escape(x)}</button>`).join("");
  S.ui.$$("#ch-chips .tab").forEach((t) => { t.onclick = () => { cat = t.dataset.c; S.ui.$$("#ch-chips .tab").forEach((x) => x.classList.toggle("active", x === t)); page = 0; render(); }; });
  /* 月度收支聚合（近 6 个自然月，有数据的月份） */
  const monthKey = (ts) => (ts ?? "").slice(0, 7);
  const months = [...new Set(all.map((t) => monthKey(t.ts)))].filter(Boolean).sort().slice(-6);
  const mIn = months.map((m) => all.filter((t) => monthKey(t.ts) === m && t.direction === "IN").reduce((a, t) => a + Number(t.amount_cents) / 100, 0));
  const mOut = months.map((m) => all.filter((t) => monthKey(t.ts) === m && t.direction === "OUT").reduce((a, t) => a + Number(t.amount_cents) / 100, 0));
  const PAGE = 10;
  let page = 0;
  const render = () => {
    const list = all.filter((t) => cat === "ALL" || t.category === cat);
    const shown = list.slice(0, (page + 1) * PAGE);
    const byDay = {};
    for (const t of shown) (byDay[t.ts?.slice(0, 10) ?? "—"] ??= []).push(t);
    el.innerHTML = `
      ${months.length ? `<div class="section-title" style="margin-top:0"><h3>${S.fmt.escape(S.t("dash.inout"))}</h3></div>
        ${S.charts.bar([{ name: S.t("ch.inLabel"), values: mIn.map((v) => +v.toFixed(2)) }, { name: S.t("ch.outLabel"), values: mOut.map((v) => +v.toFixed(2)) }], { labels: months })}` : ""}
      <div class="section-title"><h3>${S.fmt.escape(S.t("cards.history"))}</h3></div>
      ${Object.entries(byDay).map(([day, rows]) => `
        <div class="muted small" style="margin:10px 0 2px">${S.fmt.escape(day)}</div>
        ${rows.map((t) => `<div class="list-row">
          <span class="avatar">${S.ui.icon(t.direction === "IN" ? "plus" : "pay", 12)}</span>
          <div class="grow"><b>${S.fmt.escape(t.counterparty ?? "—")}</b><div class="muted small">${S.fmt.escape(t.category ?? "")}${t.memo ? " · " + S.fmt.escape(t.memo.slice(0, 30)) : ""}</div></div>
          <div class="amt mono" style="color:${t.direction === "IN" ? "var(--color-green)" : "inherit"}">${t.direction === "IN" ? "+" : "-"}¥${S.fmt.moneyPlain((Number(t.amount_cents) / 100).toFixed(2))}</div>
        </div>`).join("")}`).join("") || S.ui.empty(S.t("common.emptyTx"))}
      ${shown.length < list.length || nextCursor ? `<button class="btn btn-ghost btn-block" id="ch-more" style="margin-top:12px">${S.fmt.escape(S.t("ch.loadMore"))}（${shown.length}/${list.length}）</button>` : ""}`;
    const more = document.getElementById("ch-more");
    if (more) more.onclick = () => { page++; render(); };
  };
  render();
});
