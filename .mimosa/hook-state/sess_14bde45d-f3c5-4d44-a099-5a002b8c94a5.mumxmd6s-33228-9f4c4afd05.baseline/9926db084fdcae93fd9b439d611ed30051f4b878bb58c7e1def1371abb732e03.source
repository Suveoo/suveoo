/* wealth-my.js — P17 我的持仓（第四十二轮 T4：基金逐项查看/赎回 + 外币资产 + 存款方案入口）
 * 数据：/api/wealth/holdings（含服务端富化 name/risk/nav/day_change/value——市值=赎回回款同公式）、
 * /api/fx/balances（折 CNY 参考值）、存款静态方案 JSON。逐项赎回走 /api/wealth/redeem（RED，两段式）。 */
S.router.register("wealth-my", async ({ user }) => {
  const c = document.getElementById("content");
  if (!user) { location.replace("/account/login?next=/wealth/my"); return; }
  c.innerHTML = `
    <h1>${S.fmt.escape(S.t("wealth.my"))}</h1>
    <div class="pay-hero bg-grad-navy wmy-hero">
      <div class="ph-ai" id="ai-bar" role="button" tabindex="0"><img src="/assets/images/suveoo-ai-logo.svg?v=${S.ui.v()}" alt=""><span class="grow"></span><span class="ph-go">${S.ui.icon("arrow-right", 14)}</span></div>
      <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("wealth.holdings"))}</span><span class="n wmy-total">—</span><span class="u">CNY</span></div>
      <div class="wmy-day" id="wmy-day"></div>
    </div>
    <div class="card" id="wmy-funds">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("acct.fxAssets"))}</h2><a class="more" href="/wealth/fx">${S.fmt.escape(S.t("wealth.allFx"))} →</a></div>
    <div class="card" id="wmy-fx">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("wealth.deposits"))}</h2><a class="more" href="/wealth/deposits">${S.fmt.escape(S.t("wealth.allDeposits"))} →</a></div>
    <div class="hscroll deps" id="wmy-deps"></div>
    ${S.sim.footnote()}`;
  /* AI 试试行（同 /pay 顶部模式）：理财语境句池按日轮换，点击直达 AI 对话（第三十一轮） */
  const rot = Math.floor(Date.now() / 86400_000);
  const aiSentence = [S.t("my.tryTop"), S.t("my.tryRisk"), S.t("my.tryFx")][rot % 3];
  const aiSpan = document.querySelector("#ai-bar .grow");
  if (aiSpan) aiSpan.textContent = S.t("pay.tryPrefix", aiSentence);
  document.getElementById("ai-bar").onclick = () => { if (aiSentence) S.router.ai(aiSentence); };

  /* 基金持仓：逐项市值/成本/当日涨跌 + 详情直达 + 逐项赎回（RED 两段式，0 值不发起） */
  const fh = await S.api.get("/api/wealth/holdings");
  const box = document.getElementById("wmy-funds");
  const fundsBoxTotal = document.querySelector(".wmy-total");
  /* 当日涨跌（第三十二轮）：day_change 为当日百分比，金额按 市值-市值/(1+dc%) 反推；涨绿跌红全按当日方向 */
  const dayDelta = (x) => {
    const v = Number(x.value ?? x.amount ?? 0), dc = Number(x.day_change ?? 0);
    return v - v / (1 + dc / 100);
  };
  if (fh.ok) {
    const list = (fh.data.holdings ?? []).filter((x) => Number(x.value ?? x.amount ?? 0) > 0);
    const all = fh.data.holdings ?? [];
    const total = all.reduce((a, x) => a + Number(x.value ?? x.amount ?? 0), 0);
    fundsBoxTotal.textContent = `¥${S.fmt.moneyPlain(total)}`;
    /* hero 当日汇总：Σ涨跌额 / Σ昨日市值 */
    const sumDelta = all.reduce((a, x) => a + dayDelta(x), 0);
    const sumBase = all.reduce((a, x) => a + Number(x.value ?? x.amount ?? 0) - dayDelta(x), 0);
    const heroDelta = document.getElementById("wmy-day");
    if (heroDelta && sumBase > 0) {
      const pctD = (sumDelta / sumBase) * 100;
      heroDelta.textContent = `${S.t("wealth.today")} ${sumDelta >= 0 ? "+" : "-"}¥${S.fmt.moneyPlain(Math.abs(sumDelta).toFixed(2))}（${sumDelta >= 0 ? "+" : "-"}${Math.abs(pctD).toFixed(2)}%）`;
      heroDelta.className = "wmy-day " + (sumDelta >= 0 ? "up" : "down");
    }
    box.innerHTML = list.map((x) => {
      const up = Number(x.day_change ?? 0) >= 0;
      const dlt = dayDelta(x);
      const pnl = Number(x.value ?? 0) - Number(x.amount ?? 0);
      return `
      <div class="wmy-item">
        <div class="row between" style="align-items:flex-start;gap:10px">
          <div class="grow" style="min-width:0">
            <div class="wmy-name">${S.fmt.escape(x.name ?? x.fund)} ${S.ui.badge("R" + (x.risk_level ?? "?"), "risk-R" + (x.risk_level ?? 1))}</div>
            <div class="muted small">${S.fmt.escape(S.t("wealth.cost"))} ¥${S.fmt.moneyPlain(x.amount ?? 0)} · ${S.fmt.escape(S.t("wealth.costNav"))} ${x.cost_nav ?? "—"} · NAV ${x.nav ?? "—"}</div>
          </div>
          <div style="text-align:right">
            <div class="num-xl"><span class="n" style="font-size:22px">¥${S.fmt.moneyPlain(x.value ?? x.amount ?? 0)}</span></div>
            <div class="small" style="color:${up ? "var(--color-green)" : "var(--color-red)"}">${up ? "↑" : "↓"} ${Math.abs(Number(x.day_change ?? 0))}% · ${S.t("wealth.today")} ${dlt >= 0 ? "+" : "-"}¥${S.fmt.moneyPlain(Math.abs(dlt).toFixed(2))}<span class="muted">（${S.fmt.escape(S.t("wealth.pnl"))} ${pnl >= 0 ? "+" : "-"}¥${S.fmt.moneyPlain(Math.abs(pnl).toFixed(2))}）</span></div>
          </div>
        </div>
        <div class="row" style="margin-top:10px;gap:8px">
          <a class="btn btn-sm btn-light" href="/wealth/funds/${S.fmt.escape(x.fund)}">${S.fmt.escape(S.t("funds.detail"))}</a>
          <button class="btn btn-sm wmy-redeem" data-id="${S.fmt.escape(x.fund)}" data-name="${S.fmt.escape(x.name ?? x.fund)}">${S.fmt.escape(S.t("wealth.redeemItem"))}（RED）</button>
        </div>
      </div>`;
    }).join("") || `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
    S.ui.$$(".wmy-redeem").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        /* 逐项全额赎回（真实银行语义：按持仓逐笔发起）；amount ALL = 服务端按市值公式回款 */
        const r = await S.api.mutate("/api/wealth/redeem", { product_id: b.dataset.id, amount: "ALL" }, { subject: b.dataset.name });
        if (r.cancelled) { b.disabled = false; return; }
        if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
        else { S.ui.toast(r.data?.reason ?? r.data?.error?.message ?? "failed", true); b.disabled = false; }
      };
    });
  } else box.innerHTML = S.ui.empty(S.t("common.loadFailed"));

  /* 外币资产：折 CNY + 换汇试算直达 */
  const fxb = await S.api.get("/api/fx/balances").catch(() => null);
  document.getElementById("wmy-fx").innerHTML = fxb?.ok ? ((fxb.data.balances ?? []).map((x) => `
    <div class="list-row"><b class="wmy-fxname">${S.fmt.escape(x.name ?? x.currency)}</b>
      <div class="grow muted small mono">${S.fmt.escape(x.amount)} ${S.fmt.escape(x.currency)}</div>
      <div style="text-align:right"><div class="amt mono">≈¥${S.fmt.moneyPlain(x.cny_estimate ?? "0")}</div>
      <a class="small" href="/wealth/tools/fx-convert">${S.fmt.escape(S.t("wealth.tryConvert"))} →</a></div></div>`).join("") || `<div class="muted small">${S.fmt.escape(S.t("wealth.emptyFx"))}</div>`) : S.ui.empty(S.t("common.loadFailed"));

  /* 存款方案：快捷条（活期/通知/定期四档）——持仓页一站式入口 */
  const deps = (await Promise.all(["demand", "notice-7d", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)))).filter(Boolean);
  document.getElementById("wmy-deps").innerHTML = deps.map((d) => `
    <div class="fund-card">
      <div class="fname">${S.fmt.escape(d.name)}</div>
      <div class="fc-mini bg-tint-teal" style="margin:8px 0"><img class="fc-art-sm" src="/assets/images/illustrations/cat-deposit.svg?v=${S.ui.v()}" alt="" loading="lazy">
        <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("deps.rate"))}</span><span class="n tx-teal" style="font-size:20px">${d.rate}</span><span class="u tx-teal">%</span></div></div>
      <div class="muted small">${S.fmt.escape(d.term)}</div>
      <a class="btn btn-sm btn-light" style="margin-top:8px" href="/wealth/deposits/${d.slug}">${S.fmt.escape(S.t("deps.detail"))}</a>
    </div>`).join("");
});
