/* intrabank.js — P08 行内转账（表单通道走五道验证）
   第二十八轮大改：去外层大卡改分节表单；快捷收款人/转入本人其他双彩色 chip；
   收款账号 16 位鲁棒输入（全角/空格归一 + 4 位分组 + Luhn 即时校验 + 本人卡识别）；
   本人互转填真实姓名与完整 16 位卡号（reveal）、不锁死、同卡即时警示；付款卡双列紧凑选卡。 */
S.router.register("intrabank", async ({ user } = {}) => {
  const c = document.getElementById("content");
  const presetPayee = new URLSearchParams(location.search).get("payee");
  const presetFrom = new URLSearchParams(location.search).get("from");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("transfer.title"))}</h1>
    <div class="tf-form">
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.to"))}</div>
        <div class="tf-namerow">
          <input class="input" id="t-name" placeholder="${S.fmt.escape(S.t("transfer.namePh"))}" autocomplete="off">
          <button class="ai-chip" id="ai-fill" type="button"><span id="ai-fill-txt">${S.fmt.escape(S.t("transfer.aiAsk"))}</span></button>
        </div>
        <label class="field" style="margin:10px 0 0"><span class="lb">${S.fmt.escape(S.t("transfer.toAccount"))}</span>
          <input class="input mono" id="t-acct" placeholder="${S.fmt.escape(S.t("transfer.acctPh"))}" maxlength="19" inputmode="numeric" autocomplete="off"></label>
        <div class="tf-st" id="t-acctst">${S.fmt.escape(S.t("transfer.acctHint"))}</div>
        <div class="tf-quick">
          <button class="tf-qchip" id="pick-payee" type="button">${S.ui.iconC("ic-users-sky", 18)} ${S.fmt.escape(S.t("payees.title"))}</button>
          <button class="tf-qchip" id="self-tab" type="button">${S.ui.iconC("ic-card-navy", 18)} ${S.fmt.escape(S.t("transfer.self"))}</button>
        </div>
        <div class="tf-warn" id="t-samewarn" hidden>${S.ui.icon("shield", 15)}<div>${S.fmt.escape(S.t("transfer.sameCard"))}</div></div>
      </div>
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.amount"))} <span class="tf-fee">${S.ui.icon("check", 12)} ${S.fmt.escape(S.t("transfer.freeFee"))}</span></div>
        <div class="tf-amtrow">
          <span class="tf-amtwrap"><span class="cur">¥</span><input class="input input-lg" id="t-amt" placeholder="0.00" inputmode="decimal"></span>
          <button class="btn btn-ghost" id="t-allout" type="button">${S.fmt.escape(S.t("transfer.allOut"))}</button>
        </div>
        <div class="tf-amthint">${S.fmt.escape(S.t("transfer.tierHint"))}</div>
      </div>
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.from"))}</div>
        <div id="t-from" class="tf-cards">${S.ui.skeleton(2)}</div>
      </div>
      <div class="tf-group">
        <label class="field" style="margin-bottom:6px"><span class="lb">${S.fmt.escape(S.t("transfer.memo"))}</span>
          <input class="input" id="t-memo" maxlength="60"></label>
        <div class="field-hint">${S.fmt.escape(S.t("transfer.memoHint"))}</div>
      </div>
      <div id="t-err" class="banner" style="display:none;background:var(--color-red-bg);color:var(--color-red)"></div>
      <div class="tf-submit"><button class="btn btn-primary" id="t-go" type="button">${S.ui.icon("send", 16)} ${S.fmt.escape(S.t("transfer.submit"))}</button></div>
    </div>`;

  const cards = (await S.api.get("/api/cards")).data?.cards ?? [];
  const debits = cards.filter((x) => x.kind === "debit");
  /* 付款卡列表含信用卡（B3 信用支付）：信用标签徽章 + 显示可用额度而非余额 */
  const payFrom = cards.filter((x) => (x.kind === "debit" || x.kind === "credit") && x.status === "ACTIVE");
  let fromSlug = presetFrom || (debits.find((d) => d.is_default) ?? debits[0])?.slug;
  /* 完整卡号按需 reveal（本人互转回填 + 同卡精确比对；带缓存） */
  const fullNums = {};
  const getFull = async (slug) => {
    if (!slug || fullNums[slug]) return fullNums[slug] ?? null;
    const r = await S.api.get(`/api/cards/${slug}/reveal`);
    fullNums[slug] = r.data?.number ?? null;
    return fullNums[slug];
  };
  const fromBox = document.getElementById("t-from");
  const availOf = (d) => d.kind === "credit" ? d.available : d.balance;
  const renderFrom = () => {
    fromBox.innerHTML = payFrom.map((d) => `
      <label class="tf-card${d.slug === fromSlug ? " on" : ""}">
        <input type="radio" name="from" value="${d.slug}" ${d.slug === fromSlug ? "checked" : ""}>
        <img class="bc-art" src="${S.fmt.cardFront(d)}" alt="">
        <span class="tf-cinfo"><span class="tf-cnum">${S.fmt.escape(d.number)}${d.kind === "credit" ? ` ${S.ui.badge(S.t("cards.creditTag"), "badge-navy")}` : ""}</span>
          <span class="tf-cmeta">${S.fmt.escape(d.network)} · ${S.fmt.escape(d.kind === "credit" ? S.t("cards.credit") : S.t("cards.classIc", d.class_label))}${d.is_default ? ` · ${S.fmt.escape(S.t("cards.default"))}` : ""}</span></span>
        <span class="tf-cright"><span class="tf-cbal">${S.fmt.escape(S.t("transfer.available"))} ¥${S.fmt.escape(availOf(d))}</span>${d.held ? `<span class="tf-cbal held">${S.fmt.escape(S.t("transfer.held", d.held))}</span>` : ""}</span>
        <span class="tf-check">${S.ui.icon("check", 13)}</span>
      </label>`).join("");
    S.ui.$$("[name=from]", fromBox).forEach((r) => {
      r.onchange = () => { fromSlug = r.value; renderFrom(); syncAcct(); };
    });
  };
  renderFrom();
  const goBtn = document.getElementById("t-go");
  if (!payFrom.length) goBtn.disabled = true;

  /* 收款方真实性错误的行内提示（服务端结构化 code → i18n；不再笼统 toast） */
  const showErr = (r) => {
    const reason = r?.data?.reason ?? r?.data?.error?.code ?? null;
    const map = {
      ACCOUNT_NOT_FOUND: S.t("transfer.acctNotFound"),
      NAME_MISMATCH: S.t("transfer.nameMismatch"),
      INVALID_CARD_FORMAT: S.t("transfer.invalidAccount"),
      PAYEE_NOT_FOUND: S.t("transfer.acctNotFound"),
      INSUFFICIENT_CREDIT: S.t("transfer.insufficientCredit"),
      CIRCUIT_LOCKED: (r?.data?.minutesLeft ?? "?") + "",
    };
    const box = document.getElementById("t-err");
    box.style.display = "flex";
    box.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(reason === "CIRCUIT_LOCKED" ? S.t("circuit.blockedMsg", r?.data?.minutesLeft ?? "—") : map[reason] ?? r?.data?.error?.message ?? S.t("transfer.failed"))}</div>`;
  };
  const hideErr = () => { const b = document.getElementById("t-err"); b.style.display = "none"; b.innerHTML = ""; };

  /* ---- 收款账号鲁棒输入：全角/空格归一 → 16 位 → 4 位分组展示；Luhn 即时校验 + 本人卡/同卡识别 ---- */
  let selfTransfer = null; /* 已选本人卡 slug；账号被手改偏离即失效回落 acct: 通道 */
  const acctEl = document.getElementById("t-acct");
  const acctSt = document.getElementById("t-acctst");
  const samewarn = document.getElementById("t-samewarn");
  const acctDigits = () => S.fmt.digits16(acctEl.value);
  const setSameWarn = (on) => { samewarn.hidden = !on; goBtn.disabled = !payFrom.length || on; };
  const syncAcct = async () => {
    const d = acctDigits();
    if (selfTransfer && fullNums[selfTransfer] && d !== S.fmt.digits16(fullNums[selfTransfer])) selfTransfer = null;
    if (d.length === 16) {
      if (!S.fmt.luhn16(d)) { acctSt.className = "tf-st bad"; acctSt.innerHTML = `${S.ui.icon("shield", 13)} ${S.fmt.escape(S.t("transfer.acctBad"))}`; setSameWarn(false); return; }
      /* 同卡精确比对：与付款卡完整卡号（按需 reveal）逐一对照 */
      if (fromSlug) {
        const f = await getFull(fromSlug);
        if (f && S.fmt.digits16(f) === d) { acctSt.className = "tf-st bad"; acctSt.innerHTML = `${S.ui.icon("check", 13)} ${S.fmt.escape(S.t("transfer.acctOk"))}`; setSameWarn(true); return; }
      }
      const ownHit = Object.values(fullNums).find((n) => n && S.fmt.digits16(n) === d);
      acctSt.className = "tf-st ok";
      acctSt.innerHTML = `${S.ui.icon("check", 13)} ${S.fmt.escape(S.t("transfer.acctOk"))}${ownHit ? ` · ${S.fmt.escape(S.t("transfer.acctOwn"))}` : ""}`;
      setSameWarn(false);
    } else {
      acctSt.className = "tf-st";
      acctSt.innerHTML = S.fmt.escape(S.t("transfer.acctHint"));
      setSameWarn(false);
    }
  };
  acctEl.addEventListener("input", () => {
    /* 每 4 位自动分组：粘贴 "6222880177757477"/"6222 8801 7775 7477" 同样归一 */
    const d = S.fmt.digits16(acctEl.value);
    const grouped = S.fmt.groupCard(d);
    if (acctEl.value !== grouped) acctEl.value = grouped;
    hideErr();
    syncAcct();
  });

  /* ---- 常用收款人抽屉 ---- */
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
        acctEl.value = S.fmt.groupCard(row.dataset.acct);
        selfTransfer = null;
        hideErr();
        syncAcct();
        syncAiBtn(); /* 程序化回填也切换 AI 按钮语义（核对态） */
        m.close();
      };
    });
  };

  /* ---- 转入本人其他：借记可选中（回填真实姓名 + 完整 16 位，不锁死）；
     信用卡按真实银行口径引导走「立即还款」（信用卡只作付款卡） ---- */
  document.getElementById("self-tab").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.self"))}</h2><div id="pp-list"></div>`, { large: false });
    m.el.querySelector("#pp-list").innerHTML = cards.filter((x) => x.status === "ACTIVE").map((d) => d.kind === "credit" ? `
      <a class="list-row" href="/account/card/${d.slug}/settings" style="text-decoration:none;color:inherit">
        <img class="bc-art" src="${S.fmt.cardFront(d)}" alt="" style="width:56px;height:36px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b> ${S.ui.badge(S.t("cards.credit"), "badge-navy")}<div class="muted small">${S.fmt.escape(S.t("transfer.selfRepay"))}</div></div>
        <span class="small" style="color:var(--color-navy);white-space:nowrap">${S.fmt.escape(S.t("transfer.selfRepayGo"))}</span></a>` : `
      <div class="list-row" style="cursor:pointer" data-slug="${d.slug}">
        <img class="bc-art" src="${S.fmt.cardFront(d)}" alt="" style="width:56px;height:36px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b><div class="muted small">${S.fmt.escape(S.t("cards.classIc", d.class_label))} · ${S.fmt.escape(S.t("transfer.available"))} ¥${S.fmt.escape(d.balance)}</div></div>
        ${d.is_default ? S.ui.badge(S.t("cards.default"), "badge-gray") : ""}</div>`).join("");
    S.ui.$$(".list-row[data-slug]", m.el).forEach((row) => {
      row.onclick = async () => {
        selfTransfer = row.dataset.slug;
        document.getElementById("t-name").value = user?.name ?? ""; /* 真实姓名：本人互转的收款人就是本人 */
        const full = await getFull(selfTransfer);
        acctEl.value = full ? S.fmt.groupCard(full) : ""; /* 完整 16 位（reveal），4 位分组 */
        acctEl.readOnly = false; /* 不锁死：允许手改，改偏即回落 acct: 通道 */
        hideErr();
        syncAcct();
        syncAiBtn();
        m.close();
      };
    });
  };

  /* ---- 全部转出：按当前付款卡可用额填充（信用卡=可用额度） ---- */
  document.getElementById("t-allout").onclick = () => {
    const card = payFrom.find((d) => d.slug === fromSlug);
    if (!card) return;
    const v = Number(String(availOf(card)).replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0) { S.ui.toast(S.t("transfer.noAvail"), true); return; }
    document.getElementById("t-amt").value = v.toFixed(2);
    syncAiBtn();
  };

  /* AI 入口（第七期大扫除）：语义是"问/核/补"，不是"替我办"——
     表单为空 → 开放式问句，让 AI 反问要素（收款人/金额/付款卡/备注）；
     已填 → 把已填要素如实带给 AI 请它核对（contacts_search 等工具）并引导出确认卡。
     绝不让 AI 编造收款人或金额；发出的语句不含任何"并执行"类指令。 */
  const aiBtn = document.getElementById("ai-fill");
  const aiTxt = document.getElementById("ai-fill-txt");
  const formVals = () => ({
    name: document.getElementById("t-name").value.trim(),
    acct: acctDigits(),
    amt: document.getElementById("t-amt").value.trim(),
    memo: document.getElementById("t-memo").value.trim(),
  });
  const syncAiBtn = () => {
    const f = formVals();
    aiTxt.textContent = S.t(f.name || f.acct || f.amt || f.memo ? "transfer.aiCheck" : "transfer.aiAsk");
  };
  ["t-name", "t-acct", "t-amt", "t-memo"].forEach((id) => document.getElementById(id).addEventListener("input", syncAiBtn));
  aiBtn.onclick = () => {
    const f = formVals();
    if (!(f.name || f.acct || f.amt || f.memo)) { S.router.ai(S.t("transfer.aiQEmpty")); return; }
    const card = payFrom.find((d) => d.slug === fromSlug);
    const cardTxt = card ? String(card.number).replace(/\D/g, "").slice(-4) : "";
    S.router.ai(S.t("transfer.aiQFilled", f.name || "—", f.acct.slice(-4) || "—", f.amt || "—", f.memo || "—", cardTxt ? "**** " + cardTxt : "—"));
  };
  if (presetPayee) {
    const r = await S.api.get("/api/payees");
    const p = (r.data?.payees ?? []).find((x) => String(x.id) === presetPayee);
    if (p) { document.getElementById("t-name").value = p.name; acctEl.value = S.fmt.groupCard(p.account); syncAcct(); syncAiBtn(); }
  }

  goBtn.onclick = async () => {
    const name = document.getElementById("t-name").value.trim();
    const acct = acctDigits();
    const amount = document.getElementById("t-amt").value.trim();
    const memo = document.getElementById("t-memo").value.trim();
    hideErr();
    if (!name || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) { S.ui.toast(S.t("transfer.fillNameAmount"), true); return; }
    if (!selfTransfer && !/^\d{16}$/.test(acct)) { showErr({ data: { reason: "INVALID_CARD_FORMAT" } }); return; }
    const body = selfTransfer
      ? { to_card: selfTransfer, amount, memo: memo || undefined, from_card: fromSlug }
      : { recipient_name: name, recipient_account: acct, amount, memo: memo || undefined, from_card: fromSlug };
    goBtn.disabled = true;
    S.ga4.event("transfer_submit", { amount });
    const r = await S.api.mutate("/api/transfers/intrabank", body);
    goBtn.disabled = !payFrom.length || !samewarn.hidden;
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
