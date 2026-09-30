/* fx.js — P19 外汇牌价与兑换（2026-09 任务四升级：实时牌价结算（服务端卖/买价，JPY 每 100 口径）、
   可选结算卡（购汇支付卡/结汇收款卡）、我的外币余额卡；行内错误提示）。 */
S.router.register("fx", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("fx.title"))}</h1>
    <div class="row between wrap" style="gap:8px;margin:4px 0 8px">
      <span class="muted small" id="upd">…</span>
      <span class="row" style="gap:8px">
        <span class="badge" id="src" style="background:var(--color-primary-tint);color:var(--color-primary)"></span>
        <button class="btn btn-sm btn-light" id="refresh">${S.fmt.escape(S.t("fx.refresh"))}</button>
      </span>
    </div>
    <div class="card" style="margin-top:4px;overflow-x:auto" id="tbl">${S.ui.skeleton(4)}</div>
    <p class="muted small" style="margin-top:8px">${S.fmt.escape(S.t("fx.spreadNote"))}</p>
    <div class="section-title"><h2>${S.fmt.escape(S.t("fx.converter"))}</h2></div>
    <div class="card" style="max-width:520px">
      <div class="tabs"><button class="tab active" data-dir="buy">${S.fmt.escape(S.t("fx.dirBuy"))}</button><button class="tab" data-dir="sell">${S.fmt.escape(S.t("fx.dirSell"))}</button></div>
      <label class="field"><span class="lb" id="x-amt-lb">${S.fmt.escape(S.t("fx.cny"))}</span><input class="input input-lg" id="x-amt" value="1000" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("fx.currency"))}</span><span id="x-cur"></span></label>
      <label class="field"><span class="lb" id="x-card-lb">${S.fmt.escape(S.t("fx.payCard"))}</span><span id="x-card"></span>
        <div class="field-hint" id="x-fx-avail" style="display:none"></div></label>
      <div class="gc-kv"><span class="muted" id="x-desc">—</span><span class="v mono" id="x-out">—</span></div>
      <div id="x-err" class="banner" style="display:none;background:var(--color-red-bg);color:var(--color-red);margin-top:10px"></div>
      <button class="btn btn-primary btn-block" style="margin-top:12px" id="x-go">${S.fmt.escape(S.t("fx.exchange"))}</button>
      <div class="progressbar" style="margin-top:14px"><i style="width:34%"></i></div>
      <div class="muted small" style="margin-top:4px">${S.fmt.escape(S.t("fx.quota"))} · ${S.fmt.escape(S.t("fx.quotaUsed"))}</div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("fx.myBalances"))}</h2></div>
    <div class="card" style="max-width:520px" id="fxb">${S.ui.skeleton(2)}</div>`;
  let fx = { quotes: [] };
  let curSel, cardSel;
  let dir = "buy";
  const allCards = []; /* 全部卡片（结算卡选项按方向过滤） */
  const quoteOf = (code) => fx.quotes.find((q) => q.code === code) ?? fx.quotes[0];
  const renderMeta = () => {
    const u = document.getElementById("upd");
    const s = document.getElementById("src");
    if (fx.source === "live") { u.textContent = `${S.t("fx.updated", S.fmt.datetime(fx.updated_at))} · ${fx.provider ?? ""}`; s.textContent = S.t("fx.sourceLive"); }
    else if (fx.source === "fallback") { u.textContent = S.t("fx.updated", S.fmt.datetime(fx.updated_at)); s.textContent = S.t("fx.sourceFallback"); s.style.background = "var(--color-surface)"; s.style.color = "var(--color-ink-2)"; }
    else { u.textContent = S.t("fx.updated", S.fmt.datetime(fx.updated_at)); s.textContent = fx.source ?? ""; }
  };
  const renderTable = () => {
    /* 序列按自然日逐日积累（服务端去重采样）：不足 7 点时如实提示"积累中"，不伪造历史填充 */
    const accumulating = fx.quotes.some((q) => (q.spark ?? []).length < 7);
    /* 货币名永不折行（业内惯例：两字与多字名均单行）；"（100）"单位后缀作为整块可折到第二行 */
    const nameCell = (name) => {
      const i = name.indexOf("（");
      return i > 0
        ? `<span class="fx-name">${S.fmt.escape(name.slice(0, i))}</span><span class="fx-unit">${S.fmt.escape(name.slice(i))}</span>`
        : `<span class="fx-name">${S.fmt.escape(name)}</span>`;
    };
    document.getElementById("tbl").innerHTML = `<table class="table fx-table"><thead><tr>
      <th></th><th><span class="hh-l">${S.fmt.escape(S.t("fx.buy"))}</span><span class="hh-s">${S.fmt.escape(S.t("fx.buyShort"))}</span></th><th><span class="hh-l">${S.fmt.escape(S.t("fx.sell"))}</span><span class="hh-s">${S.fmt.escape(S.t("fx.sellShort"))}</span></th><th>${S.fmt.escape(S.t("fx.mid"))}</th><th>7D</th></tr></thead><tbody>
      ${fx.quotes.map((q) => `<tr><td class="fx-cell"><img class="fx-flag" src="${q.flag}" alt="">${nameCell(q.name)}</td>
        <td class="mono">${q.buy}</td><td class="mono">${q.sell}</td><td class="mono">${q.mid}</td><td>${S.charts.spark(q.spark, { color: "auto" })}</td></tr>`).join("")}
      </tbody></table>${accumulating ? `<div class="muted small" style="padding:8px 12px">${S.fmt.escape(S.t("fx.sparkAccumulating"))}</div>` : ""}`;
  };
  const buildSelect = () => {
    const fresh = S.ctl.select({
      label: S.t("fx.currency"),
      options: fx.quotes.map((q) => ({ v: q.code, label: `${q.name} (${q.code})` })),
      value: curSel?.value ?? "USD",
    });
    fresh.id = "x-cur";
    fresh.addEventListener("input", calc);
    document.getElementById("x-cur").replaceWith(fresh);
    curSel = fresh;
  };
  const calc = () => {
    if (!curSel) return;
    const q = quoteOf(curSel.value);
    const unit = curSel.value === "JPY" ? 100 : 1; /* JPY 牌价为每 100 日元 */
    const amt = Number(document.getElementById("x-amt").value) || 0;
    /* 购汇按银行卖出价（sell）、结汇按银行买入价（buy），与真实银行结算口径一致 */
    const price = Number(dir === "buy" ? q?.sell ?? 1 : q?.buy ?? 1);
    const out = dir === "buy" ? (amt / price) * unit : (amt * price) / unit;
    const curName = q ? `${q.name} (${q.code})` : "";
    document.getElementById("x-amt-lb").textContent = dir === "buy" ? S.t("fx.cny") : `${curName}`;
    document.getElementById("x-card-lb").textContent = dir === "buy" ? S.t("fx.payCard") : S.t("fx.receiveCard");
    document.getElementById("x-desc").textContent = dir === "buy" ? `${S.fmt.escape(curName)} @ ${S.fmt.escape(String(q?.sell ?? ""))} ≈` : `@ ${S.fmt.escape(String(q?.buy ?? ""))} CNY ≈`;
    document.getElementById("x-out").textContent = dir === "buy" ? out.toFixed(2) : "¥ " + S.fmt.moneyPlain(out);
    renderFxBalanceHint();
  };
  /* 结汇方向：显示所选币种可用余额（余额不足行内预警） */
  const fxBalances = [];
  const renderFxBalanceHint = () => {
    const el = document.getElementById("x-fx-avail");
    if (dir !== "sell" || !curSel) { el.style.display = "none"; return; }
    const b = fxBalances.find((x) => x.currency === curSel.value);
    el.style.display = "block";
    el.innerHTML = b
      ? `${S.fmt.escape(S.t("fx.availForeign", b.amount, b.currency))} · ≈¥${S.fmt.escape(b.cny_estimate ?? "—")}`
      : `${S.fmt.escape(S.t("fx.noBalances"))}`;
  };
  const renderFxBalances = () => {
    const el = document.getElementById("fxb");
    el.innerHTML = fxBalances.length ? fxBalances.map((b) => `
      <div class="list-row"><img class="fx-flag" src="${b.flag ?? ""}" alt="">
        <div class="grow"><b>${S.fmt.escape(b.name ?? b.currency)}</b><div class="muted small mono">${S.fmt.escape(b.currency)}</div></div>
        <div style="text-align:right"><b class="mono">${S.fmt.escape(b.amount)}</b>
        <div class="muted small mono">≈ ¥${S.fmt.escape(b.cny_estimate ?? "—")}</div></div></div>`).join("")
      : S.ui.empty(S.t("fx.noBalances"));
  };
  const loadBalances = async () => {
    const r = await S.api.get("/api/fx/balances");
    if (r.ok && r.data) { fxBalances.length = 0; fxBalances.push(...(r.data.balances ?? [])); }
    renderFxBalances();
    renderFxBalanceHint();
  };
  const showErr = (msg) => {
    const box = document.getElementById("x-err");
    box.style.display = "flex";
    box.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(msg)}</div>`;
  };
  const hideErr = () => { const b = document.getElementById("x-err"); b.style.display = "none"; b.innerHTML = ""; };
  /* 结算卡选项（B3）：购汇=支付卡（借记 + 信用卡信用支付，信用显示可用额度）；结汇=收款卡（仅借记）。
   * 方向切换时重建列表，已选卡在新方向不可用时回落默认借记卡。 */
  const buildCardSelect = () => {
    const list = dir === "buy"
      ? allCards.filter((x) => (x.kind === "debit" || x.kind === "credit") && x.status === "ACTIVE")
      : allCards.filter((x) => x.kind === "debit" && x.status === "ACTIVE");
    const keep = list.some((x) => x.slug === cardSel?.value) ? cardSel.value : (list.find((x) => x.is_default) ?? list[0])?.slug;
    const fresh = S.ctl.select({
      label: dir === "buy" ? S.t("fx.payCard") : S.t("fx.receiveCard"),
      options: list.map((d) => ({
        v: d.slug,
        label: d.kind === "credit"
          ? `${d.number} · ${S.t("cards.creditTag")} · ${S.t("transfer.available")} ¥${d.available}`
          : `${d.number} · ¥${d.balance}`,
      })),
      value: keep,
    });
    fresh.id = "x-card";
    fresh.addEventListener("input", calc);
    document.getElementById("x-card").replaceWith(fresh);
    cardSel = fresh;
  };
  const load = async (refresh = false) => {
    const r = await fetch(`/api/fx${refresh ? "?refresh=1" : ""}`);
    fx = (await r.json().catch(() => fx)) ?? fx;
    renderMeta();
    renderTable();
    buildSelect();
    calc();
  };
  document.getElementById("refresh").onclick = async () => {
    document.getElementById("refresh").disabled = true;
    await load(true);
    document.getElementById("refresh").disabled = false;
  };
  S.ui.$$("[data-dir]").forEach((t) => { t.onclick = () => { dir = t.dataset.dir; hideErr(); S.ui.$$("[data-dir]").forEach((x) => x.classList.toggle("active", x === t)); calc(); buildCardSelect(); }; });
  document.getElementById("x-amt").oninput = () => { hideErr(); calc(); };
  document.getElementById("x-go").onclick = async () => {
    hideErr();
    const amt = document.getElementById("x-amt").value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) { showErr(S.t("common.badAmount")); return; }
    const body = {
      direction: dir, currency: curSel.value,
      from_card: cardSel?.value || undefined,
      ...(dir === "buy" ? { amount_cny: amt } : { amount_foreign: amt }),
    };
    const r = await S.api.mutate("/api/fx/exchange", body, { action: "fx_exchange" });
    if (r.cancelled) return;
    if (r.data?.status === "EXECUTED" && r.data.result?.ok) {
      S.ui.toast(S.t("common.opOk"));
      await loadBalances();
      await load();
    } else {
      const reason = r.data?.reason ?? r.data?.error?.code ?? null;
      showErr(reason === "INSUFFICIENT_FX" ? S.t("fx.insufficientFx")
        : reason === "INSUFFICIENT_CREDIT" ? S.t("transfer.insufficientCredit")
        : reason === "INSUFFICIENT_BALANCE" ? S.t("common.insufficient") : r.data?.error?.message ?? S.t("common.opFailed"));
    }
  };
  /* 初始化：牌价 + 结算卡选择（购汇含信用卡信用支付；结汇仅借记）+ 外币余额 */
  await load();
  allCards.push(...(((await S.api.get("/api/cards")).data?.cards) ?? []));
  buildCardSelect();
  await loadBalances();
  calc();
});
