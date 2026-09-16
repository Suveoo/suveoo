/* intrabank.js — P08 行内转账（表单通道走五道验证） */
S.router.register("intrabank", async () => {
  const c = document.getElementById("content");
  const presetPayee = new URLSearchParams(location.search).get("payee");
  const presetFrom = new URLSearchParams(location.search).get("from");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("transfer.title"))}</h1>${S.sim.banner()}
    <div class="card" style="max-width:560px">
      <div class="row between" style="margin-bottom:12px">
        <label class="field" style="flex:1;margin:0"><span class="lb">${S.fmt.escape(S.t("transfer.toName"))}</span>
          <input class="input" id="t-name" placeholder="${S.fmt.escape(S.t("transfer.namePh"))}"></label>
        <button class="ai-chip" id="ai-fill" style="flex:none;margin-top:22px">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("transfer.aiFill"))}</button>
      </div>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toAccount"))}</span>
        <input class="input mono" id="t-acct" placeholder="6222 88xx xxxx xxxx" maxlength="16" inputmode="numeric">
        <div class="field-hint">${S.fmt.escape(S.t("transfer.choosePayee"))} → <button class="linklike" id="pick-payee" style="color:var(--color-navy)">${S.ui.icon("account", 12)} ${S.fmt.escape(S.t("payees.title"))}</button>
        · <button class="linklike" id="self-tab" style="color:var(--color-navy)">${S.fmt.escape(S.t("transfer.self"))}</button></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.amount"))}</span>
        <div class="row"><input class="input input-lg" id="t-amt" placeholder="0.00" inputmode="decimal">
        <span class="muted small">${S.fmt.escape(S.t("transfer.freeFee"))}</span></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.from"))}</span>
        <div id="t-from" class="stack" style="gap:8px">${S.ui.skeleton(2)}</div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.memo"))}</span>
        <input class="input" id="t-memo" maxlength="60"></label>
      <div class="field-hint">${S.fmt.escape(S.t("transfer.memoHint"))}</div>
      <div id="t-err" class="banner" style="display:none;background:var(--color-red-bg);color:var(--color-red)"></div>
      <button class="btn btn-primary btn-block" id="t-go" style="margin-top:16px">${S.ui.icon("send", 16)} ${S.fmt.escape(S.t("transfer.submit"))}</button>
    </div>`;

  const cards = (await S.api.get("/api/cards")).data?.cards ?? [];
  const debits = cards.filter((x) => x.kind === "debit");
  /* 付款卡列表含信用卡（B3 信用支付）：信用标签徽章 + 显示可用额度而非余额 */
  const payFrom = cards.filter((x) => (x.kind === "debit" || x.kind === "credit") && x.status === "ACTIVE");
  let fromSlug = presetFrom || (debits.find((d) => d.is_default) ?? debits[0])?.slug;
  const fromBox = document.getElementById("t-from");
  const renderFrom = () => {
    fromBox.innerHTML = payFrom.map((d) => `
      <label class="row card card-pad-sm" style="cursor:pointer;gap:10px;margin:0">
        <input type="radio" name="from" value="${d.slug}" ${d.slug === fromSlug ? "checked" : ""} ${d.status !== "ACTIVE" ? "disabled" : ""}>
        <img class="bc-art" src="/${d.art}" alt="" style="width:64px;height:40px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b>
          <div class="muted small">${S.fmt.escape(d.network)} · ${S.fmt.escape(d.kind === "credit" ? S.t("cards.credit") : S.t("cards.classIc", d.class_label))}</div></div>
        <div style="text-align:right">
          ${d.kind === "credit" ? `<div>${S.ui.badge(S.t("cards.creditTag"), "badge-navy")}</div>` : ""}
          <div class="mono small">${S.fmt.escape(S.t("transfer.available"))} ¥${d.kind === "credit" ? S.fmt.escape(d.available) : S.fmt.escape(d.balance)}${d.held ? `（${S.fmt.escape(S.t("genui.budget"))} ¥${d.held}）` : ""}</div>
        </div>
      </label>`).join("");
    S.ui.$$("[name=from]", fromBox).forEach((r) => { r.onchange = () => (fromSlug = r.value); });
  };
  renderFrom();
  if (!payFrom.length) { document.getElementById("t-go").disabled = true; }

  /* 收款方真实性错误的行内提示（服务端结构化 code → i18n；不再笼统 toast） */
  const showErr = (r) => {
    const reason = r?.data?.reason ?? r?.data?.error?.code ?? null;
    const map = {
      ACCOUNT_NOT_FOUND: S.t("transfer.acctNotFound"),
      NAME_MISMATCH: S.t("transfer.nameMismatch"),
      INVALID_CARD_FORMAT: S.t("transfer.invalidAccount"),
      PAYEE_NOT_FOUND: S.t("transfer.acctNotFound"),
      INSUFFICIENT_CREDIT: S.t("transfer.insufficientCredit"),
    };
    const box = document.getElementById("t-err");
    box.style.display = "flex";
    box.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(map[reason] ?? r?.data?.error?.message ?? S.t("transfer.failed"))}</div>`;
  };
  const hideErr = () => { const b = document.getElementById("t-err"); b.style.display = "none"; b.innerHTML = ""; };

  /* 收款人选择 / 本人互转 */
  document.getElementById("pick-payee").onclick = async () => {
    const r = await S.api.get("/api/payees");
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("payees.title"))}</h2><div id="pp-list">${S.ui.skeleton(3)}</div>`, { large: false });
    m.el.querySelector("#pp-list").innerHTML = (r.data?.payees ?? []).map((p) => `
      <div class="list-row" style="cursor:${p.verified === false ? "not-allowed" : "pointer"}" data-id="${p.id}" data-name="${S.fmt.escape(p.name)}" data-acct="${p.account ?? ""}" data-ok="${p.verified === false ? "0" : "1"}">
        <span class="avatar">${S.fmt.escape(p.name.slice(0, 1))}</span>
        <div class="grow"><b>${S.fmt.escape(p.name)}</b><div class="muted small mono">${S.fmt.escape(p.account ?? "—")}</div></div>
        ${p.verified === false ? S.ui.badge(S.t("payees.unverified"), "badge-gray") : `<span class="badge badge-gray">${S.fmt.escape(p.group_label ?? "")}</span>`}</div>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".list-row", m.el).forEach((row) => {
      row.onclick = () => {
        if (row.dataset.ok === "0") { S.ui.toast(S.t("payees.unverified"), true); return; } /* 未迁移的旧 payee：拦截使用 */
        document.getElementById("t-name").value = row.dataset.name;
        document.getElementById("t-acct").value = row.dataset.acct;
        hideErr();
        m.close();
      };
    });
  };
  document.getElementById("self-tab").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.self"))}</h2><div id="pp-list"></div>`);
    m.el.querySelector("#pp-list").innerHTML = debits.map((d) => `
      <div class="list-row" style="cursor:pointer" data-slug="${d.slug}" data-name="${S.fmt.escape(d.number)}">
        <img class="bc-art" src="/${d.art}" alt="" style="width:64px;height:40px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b><div class="muted small">¥${d.balance}</div></div></div>`).join("");
    S.ui.$$(".list-row", m.el).forEach((row) => {
      row.onclick = () => {
        selfTransfer = row.dataset.slug;
        document.getElementById("t-name").value = S.t("transfer.self");
        document.getElementById("t-acct").value = row.dataset.name.replace(/\D/g, "");
        document.getElementById("t-acct").readOnly = true;
        m.close();
      };
    });
  };
  let selfTransfer = null;

  document.getElementById("ai-fill").onclick = () => S.router.ai(S.t("prompt.transferFill"));
  if (presetPayee) {
    const r = await S.api.get("/api/payees");
    const p = (r.data?.payees ?? []).find((x) => String(x.id) === presetPayee);
    if (p) { document.getElementById("t-name").value = p.name; document.getElementById("t-acct").value = p.account; }
  }

  document.getElementById("t-go").onclick = async () => {
    const name = document.getElementById("t-name").value.trim();
    const acct = document.getElementById("t-acct").value.replace(/\s/g, "");
    const amount = document.getElementById("t-amt").value.trim();
    const memo = document.getElementById("t-memo").value.trim();
    hideErr();
    if (!name || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) { S.ui.toast(S.t("transfer.fillNameAmount"), true); return; }
    if (!selfTransfer && !/^\d{16}$/.test(acct)) { showErr({ data: { reason: "INVALID_CARD_FORMAT" } }); return; }
    const body = selfTransfer
      ? { to_card: selfTransfer, amount, memo: memo || undefined, from_card: fromSlug }
      : { recipient_name: name, recipient_account: acct, amount, memo: memo || undefined, from_card: fromSlug };
    const btn = document.getElementById("t-go");
    btn.disabled = true;
    S.ga4.event("transfer_submit", { amount });
    const r = await S.api.mutate("/api/transfers/intrabank", body);
    btn.disabled = false;
    if (r.cancelled) return;
    if (r.data?.status === "EXECUTED" && r.data.result?.ok) {
      S.ga4.event("transfer_confirm", { amount });
      const res = r.data.result;
      S.ui.modal(`<h2>${S.ui.icon("check", 20)} ${S.fmt.escape(S.t("transfer.success"))}</h2>
        <div class="genui-card" style="max-width:none"><div class="gc-amount">¥ ${S.fmt.moneyPlain(amount)}</div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("genui.to"))}</span><span class="v">${S.fmt.escape(res.to ?? name)}</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("common.txId"))}</span><span class="v mono">${S.fmt.escape(res.tx_id)}</span></div>
        <div class="gc-kv"><span class="muted">Trace</span><span class="v mono small">${S.fmt.escape(r.data.trace_id)}</span></div></div>
        ${S.sim.footnote()}
        <div class="modal-actions"><a class="btn btn-ghost" href="/transfer/history">${S.fmt.escape(S.t("pay.history"))}</a>
        <button class="btn btn-primary" onclick="location.reload()">${S.fmt.escape(S.t("common.done"))}</button></div>`);
    } else {
      /* 收款方真实性拦截等业务拒绝：行内红条呈现结构化原因 */
      showErr(r);
      S.ui.toast(S.t("transfer.failed"), true);
    }
  };
});
