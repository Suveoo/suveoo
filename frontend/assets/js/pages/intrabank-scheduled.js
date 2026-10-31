/* intrabank-scheduled.js — P09 预约转账（双时区显示）
   第二十八轮大改：与行内转账同款分节表单（快捷收款人/问问 AI/备注/免手续费/鲁棒卡号/同卡警示全对齐）；
   执行时间改自绘日历时分秒（点数值可直输，模糊遮罩锁滚）；重复补「每年」；手机执行时间占满整行；
   长程任务中心行尾「查看全部 →」直达 /ai/tasks。 */
S.router.register("intrabank-scheduled", async ({ user } = {}) => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("sch.title"))}</h1>
    <div class="tf-form">
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.to"))}</div>
        <div class="tf-namerow">
          <input class="input" id="s-name" placeholder="${S.fmt.escape(S.t("transfer.namePh"))}" autocomplete="off">
          <button class="ai-chip" id="ai-fill" type="button"><span id="ai-fill-txt">${S.fmt.escape(S.t("transfer.aiAsk"))}</span></button>
        </div>
        <label class="field" style="margin:10px 0 0"><span class="lb">${S.fmt.escape(S.t("transfer.toAccount"))}</span>
          <input class="input mono" id="s-acct" placeholder="${S.fmt.escape(S.t('transfer.acctPh') + S.t('transfer.acctPhAppend'))}" maxlength="40" autocomplete="off"></label>
        <div class="tf-st" id="s-acctst">${S.fmt.escape(S.t("transfer.acctHint"))}</div>
        <div class="tf-quick">
          <button class="tf-qchip" id="pick-payee" type="button">${S.ui.iconC("ic-users-sky", 18)} ${S.fmt.escape(S.t("payees.title"))}</button>
          <button class="tf-qchip" id="self-tab" type="button">${S.ui.iconC("ic-card-navy", 18)} ${S.fmt.escape(S.t("transfer.self"))}</button>
        </div>
        <div class="tf-warn" id="s-samewarn" hidden>${S.ui.icon("shield", 15)}<div>${S.fmt.escape(S.t("transfer.sameCard"))}</div></div>
      </div>
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.amount"))} <span class="tf-fee">${S.ui.icon("check", 12)} ${S.fmt.escape(S.t("transfer.freeFee"))}</span></div>
        <div class="tf-amtrow">
          <span class="tf-amtwrap"><span class="cur">¥</span><input class="input input-lg" id="s-amt" placeholder="0.00" inputmode="decimal"></span>
          <button class="btn btn-ghost" id="s-allout" type="button">${S.fmt.escape(S.t("transfer.allOut"))}</button>
        </div>
        <div class="tf-amthint">${S.fmt.escape(S.t("sch.tierHint"))}</div>
      </div>
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("transfer.from"))}</div>
        <div id="s-from" class="tf-cards">${S.ui.skeleton(2)}</div>
      </div>
      <div class="tf-group">
        <div class="tf-lb">${S.fmt.escape(S.t("sch.plan"))}</div>
        <div class="tf-whenrow">
          <div><div class="field-hint" style="margin:0 0 6px">${S.fmt.escape(S.t("sch.when"))}</div>
            <button class="tf-when" id="s-when" type="button"><span class="ph">${S.fmt.escape(S.t("sch.whenPh"))}</span> ${S.ui.icon("clock", 16)}</button></div>
          <div><div class="field-hint" style="margin:0 0 6px">${S.fmt.escape(S.t("sch.repeat"))}</div><span id="s-rep"></span></div>
        </div>
        <div class="banner" style="margin-top:12px">${S.ui.icon("clock", 16)}<div>${S.fmt.escape(S.t("sch.tzNote"))}<div id="tz-dual" class="mono" style="margin-top:4px"></div></div></div>
      </div>
      <div class="tf-group">
        <label class="field" style="margin-bottom:6px"><span class="lb">${S.fmt.escape(S.t("transfer.memo"))}</span>
          <input class="input" id="s-memo" maxlength="60"></label>
        <div class="field-hint">${S.fmt.escape(S.t("sch.memoHint"))}</div>
      </div>
      <div id="s-err" class="banner" style="display:none;background:var(--color-red-bg);color:var(--color-red)"></div>
      <div class="tf-submit"><button class="btn btn-primary" id="s-go" type="button">${S.ui.icon("clock", 16)} ${S.fmt.escape(S.t("sch.submit"))}</button></div>
    </div>
    <div class="section-title" style="margin-top:28px"><h2>${S.fmt.escape(S.t("tasks.title"))}</h2><a class="more" href="/ai/tasks">${S.fmt.escape(S.t("common.viewAll"))} →</a></div>
    <div class="card" id="tasks">${S.ui.skeleton(2)}</div>`;

  /* 付款卡选择：预约转账到期自动扣款，仅可挂借记卡（信用支付是即时消费语义，不进长程任务） */
  const presetFrom = new URLSearchParams(location.search).get("from");
  const allCards = (await S.api.get("/api/cards")).data?.cards ?? [];
  const debits = allCards.filter((x) => x.kind === "debit" && x.status === "ACTIVE");
  let fromSlug = presetFrom || (debits.find((d) => d.is_default) ?? debits[0])?.slug;
  const fullNums = {};
  const getFull = async (slug) => {
    if (!slug || fullNums[slug]) return fullNums[slug] ?? null;
    const r = await S.api.get(`/api/cards/${slug}/reveal`);
    fullNums[slug] = r.data?.number ?? null;
    return fullNums[slug];
  };
  const box = document.getElementById("s-from");
  const renderFrom = () => {
    box.innerHTML = debits.map((d) => `
      <label class="tf-card${d.slug === fromSlug ? " on" : ""}">
        <input type="radio" name="from" value="${d.slug}" ${d.slug === fromSlug ? "checked" : ""}>
        <img class="bc-art" src="${S.fmt.cardFront(d, allCards)}" alt="">
        <span class="tf-cinfo"><span class="tf-cnum">${S.fmt.escape(d.number)}${d.is_default ? ` <span class="tf-def">${S.fmt.escape(S.t("cards.default"))}</span>` : ""}</span>
          <span class="tf-cmeta">${S.fmt.escape(d.network)} · ${S.fmt.escape(S.t("cards.classIc", d.class_label))}</span></span>
        <span class="tf-cright"><span class="tf-cbal">${S.fmt.escape(S.t("transfer.available"))} ¥${S.fmt.escape(d.balance)}</span>${d.held ? `<span class="tf-cbal held">${S.fmt.escape(S.t("transfer.held", d.held))}</span>` : ""}</span>
        <span class="tf-check">${S.ui.icon("check", 13)}</span>
      </label>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$("[name=from]", box).forEach((r) => {
      r.onchange = () => { fromSlug = r.value; renderFrom(); syncAcct(); };
    });
  };
  renderFrom();

  /* ---- 鲁棒收款账号（与行内转账同款：归一分组 + Luhn + 本人卡/同卡识别 + contact 收款） ---- */
  let selfNum = null; /* 已选本人卡完整卡号；手改偏离即清空（预约执行按卡号入账） */
  let contactAcct = null; /* 第九十五轮补齐：contact 收款（手机号/邮箱→唯一账户默认卡；与即时转账同语义，服务端建单时钉死卡号+真名） */
  const acctEl = document.getElementById("s-acct");
  const acctSt = document.getElementById("s-acctst");
  const samewarn = document.getElementById("s-samewarn");
  const goBtn = document.getElementById("s-go");
  const acctDigits = () => S.fmt.digits16(acctEl.value);
  const setSameWarn = (on) => { samewarn.hidden = !on; goBtn.disabled = !debits.length || on; };
  let lookupSeq = 0, lookupTimer = null;
  const runContactLookup = async (rawV, isPhone) => {
    const seq = ++lookupSeq;
    const r = await S.api.get("/api/payees/lookup?contact=" + encodeURIComponent(isPhone ? S.phone.normCN(rawV) : rawV));
    if (seq !== lookupSeq) return;
    if (r.ok && r.data?.found) {
      contactAcct = isPhone ? S.phone.normCN(rawV) : rawV;
      /* P2-12：服务端只回 found（不再回姓名/掩码），姓名由用户自行填写——
         避免"输入手机号即查实名"的免费查询接口 */
      acctSt.className = "tf-st ok";
      acctSt.innerHTML = `${S.ui.icon("check", 13)} ${S.fmt.escape(S.t("transfer.contactFound", "已找到 Suveoo 用户"))} · ${S.fmt.escape(S.t("transfer.nameManual", "请填写收款人姓名以便核对"))}`;
      setSameWarn(false);
    } else {
      contactAcct = null;
      acctSt.className = "tf-st bad";
      acctSt.innerHTML = `${S.ui.icon("x", 13)} ${S.fmt.escape(S.t("transfer.contactNotFound", "未找到绑定该手机号/邮箱的用户"))}`;
      setSameWarn(false);
    }
  };
  const syncAcct = async () => {
    const d = acctDigits();
    if (selfNum && d !== S.fmt.digits16(selfNum)) selfNum = null;
    const rawV = acctEl.value.trim();
    const isPhone = !!S.phone.normCN(rawV);
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawV);
    if (isPhone || isEmail) {
      contactAcct = null;
      acctSt.className = "tf-st"; acctSt.innerHTML = '<span class="spin sm"></span>';
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(() => runContactLookup(rawV, isPhone), 250);
      return;
    }
    clearTimeout(lookupTimer);
    lookupSeq++;
    contactAcct = null;
    if (d.length === 16) {
      if (!S.fmt.luhn16(d)) { acctSt.className = "tf-st bad"; acctSt.innerHTML = `${S.ui.icon("shield", 13)} ${S.fmt.escape(S.t("transfer.acctBad"))}`; setSameWarn(false); return; }
      if (fromSlug) {
        const f = await getFull(fromSlug);
        if (f && S.fmt.digits16(f) === d) { acctSt.className = "tf-st ok"; acctSt.innerHTML = `${S.ui.icon("check", 13)} ${S.fmt.escape(S.t("transfer.acctOk"))}`; setSameWarn(true); return; }
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
    /* 邮箱/手机号形态不套卡号分组（contact 收款；与即时转账页同修复） */
    const rawV = acctEl.value;
    const contactForm = rawV.includes("@") || !!S.phone.normCN(rawV);
    if (!contactForm) {
      const grouped = S.fmt.groupCard(rawV);
      if (rawV !== grouped) acctEl.value = grouped;
    }
    hideErr();
    syncAcct();
  });
  const showErr = (r) => {
    if (r?.data?.reason === "CIRCUIT_LOCKED") {
      const el0 = document.getElementById("s-err");
      el0.style.display = "flex";
      el0.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("circuit.blockedMsg", r?.data?.minutesLeft ?? "—"))}</div>`;
      return;
    }
    /* 第一百轮：具体化失败原因（blockedMsg 映射 67 类失败码+细节提取） */
    const msg = S.fmt.blockedMsg(r, "transfer.failed");
    const el = document.getElementById("s-err");
    el.style.display = "flex";
    el.innerHTML = `${S.ui.icon("shield", 16)}<div>${S.fmt.escape(msg)}</div>`;
  };
  const hideErr = () => { const el = document.getElementById("s-err"); el.style.display = "none"; el.innerHTML = ""; };

  /* ---- 快捷收款人 / 转入本人其他（与行内转账同款；预约执行按 16 位卡号入账） ---- */
  document.getElementById("pick-payee").onclick = async () => {
    const r = await S.api.get("/api/payees");
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("payees.title"))}</h2><div id="pp-list">${S.ui.skeleton(3)}</div>`, { large: false });
    m.el.querySelector("#pp-list").innerHTML = (r.data?.payees ?? []).map((p) => `
      <div class="list-row" style="cursor:${p.verified === false ? "not-allowed" : "pointer"}" data-name="${S.fmt.escape(p.name)}" data-acct="${p.account ?? ""}" data-ok="${p.verified === false ? "0" : "1"}">
        <span class="avatar">${S.fmt.escape(p.name.slice(0, 1))}</span>
        <div class="grow"><b>${S.fmt.escape(p.name)}</b><div class="muted small mono">${S.fmt.escape(p.account ?? "—")}</div></div>
        ${p.verified === false ? S.ui.badge(S.t("payees.unverified"), "badge-gray") : `<span class="badge badge-gray">${S.fmt.escape(p.group_label ?? "")}</span>`}</div>`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".list-row", m.el).forEach((row) => {
      row.onclick = () => {
        if (row.dataset.ok === "0") { S.ui.toast(S.t("payees.unverified"), true); return; }
        document.getElementById("s-name").value = row.dataset.name;
        acctEl.value = S.fmt.groupCard(row.dataset.acct);
        selfNum = null;
        hideErr(); syncAcct(); syncAiBtn();
        m.close();
      };
    });
  };
  document.getElementById("self-tab").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("transfer.self"))}</h2><div id="pp-list"></div>`, { large: false });
    m.el.querySelector("#pp-list").innerHTML = allCards.filter((x) => x.status === "ACTIVE").map((d) => d.kind === "credit" ? `
      <a class="list-row" href="/account/cards" style="text-decoration:none;color:inherit">
        <img class="bc-art" src="${S.fmt.cardFront(d, allCards)}" alt="" style="width:56px;height:36px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b><div class="muted small">${S.fmt.escape(S.t("transfer.selfRepay"))}</div></div>
        ${S.ui.badge(S.t("cards.credit"), "badge-navy")}<span class="small" style="color:var(--color-navy);white-space:nowrap">${S.fmt.escape(S.t("transfer.selfRepayGo"))}</span></a>` : `
      <div class="list-row" style="cursor:pointer" data-slug="${d.slug}">
        <img class="bc-art" src="${S.fmt.cardFront(d, allCards)}" alt="" style="width:56px;height:36px">
        <div class="grow"><b class="mono">${S.fmt.escape(d.number)}</b><div class="muted small">${S.fmt.escape(S.t("cards.classIc", d.class_label))} · ${S.fmt.escape(S.t("transfer.available"))} ¥${S.fmt.escape(d.balance)}</div></div>
        ${d.is_default ? S.ui.badge(S.t("cards.default"), "badge-gray") : ""}</div>`).join("");
    S.ui.$$(".list-row[data-slug]", m.el).forEach((row) => {
      row.onclick = async () => {
        document.getElementById("s-name").value = user?.name ?? "";
        const full = await getFull(row.dataset.slug);
        selfNum = full ?? null;
        acctEl.value = full ? S.fmt.groupCard(full) : "";
        acctEl.readOnly = false;
        hideErr(); syncAcct(); syncAiBtn();
        m.close();
      };
    });
  };

  /* ---- 全部转出（按所选借记卡可用余额） ---- */
  document.getElementById("s-allout").onclick = () => {
    const card = debits.find((d) => d.slug === fromSlug);
    if (!card) return;
    const v = Number(String(card.balance).replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0) { S.ui.toast(S.t("transfer.noAvail"), true); return; }
    document.getElementById("s-amt").value = v.toFixed(2);
    syncAiBtn();
  };

  /* ---- 执行时间：自绘日历（年月日 + 时分秒，点数值可直输） ---- */
  const whenBtn = document.getElementById("s-when");
  let whenVal = ""; /* "YYYY-MM-DD HH:mm:ss"（本地时区） */
  const parseWhen = () => {
    const m = whenVal.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const syncTz = () => {
    const d = parseWhen();
    const el = document.getElementById("tz-dual");
    if (!d) { el.textContent = ""; return; }
    const t = S.fmt.dualTime(d.toISOString());
    el.textContent = `${t.local} / ${t.beijing}`;
  };
  whenBtn.onclick = async () => {
    const v = await S.ctl.calendar({ value: whenVal, time: true });
    if (!v) return;
    whenVal = v;
    whenBtn.innerHTML = `${S.fmt.escape(v)} ${S.ui.icon("clock", 16)}`;
    syncTz();
    hideErr();
  };

  /* ---- 重复：单次 / 每月 / 每年 ---- */
  const repSel = S.ctl.select({ label: S.t("sch.repeat"), options: [{ v: "once", label: S.t("sch.once") }, { v: "monthly", label: S.t("sch.monthly") }, { v: "yearly", label: S.t("sch.yearly") }], value: "once" });
  repSel.id = "s-rep";
  document.getElementById("s-rep").replaceWith(repSel);

  /* ---- AI 双态入口（问/核，非替我办） ---- */
  const aiTxt = document.getElementById("ai-fill-txt");
  const formVals = () => ({
    name: document.getElementById("s-name").value.trim(),
    acct: acctDigits(),
    amt: document.getElementById("s-amt").value.trim(),
    memo: document.getElementById("s-memo").value.trim(),
  });
  const syncAiBtn = () => {
    const f = formVals();
    aiTxt.textContent = S.t(f.name || f.acct || f.amt || f.memo || whenVal ? "transfer.aiCheck" : "transfer.aiAsk");
  };
  ["s-name", "s-acct", "s-amt", "s-memo"].forEach((id) => document.getElementById(id).addEventListener("input", syncAiBtn));
  document.getElementById("ai-fill").onclick = () => {
    const f = formVals();
    const rep = { once: S.t("sch.once"), monthly: S.t("sch.monthly"), yearly: S.t("sch.yearly") }[repSel.value] ?? repSel.value;
    if (!(f.name || f.acct || f.amt || f.memo || whenVal)) { S.router.ai(S.t("sch.aiQEmpty")); return; }
    S.router.ai(S.t("sch.aiQFilled", f.name || "—", f.acct.slice(-4) || "—", f.amt || "—", whenVal || "—", rep, "—"));
  };

  /* ---- 提交（黄级确认卡走 S.api.mutate） ---- */
  goBtn.onclick = async () => {
    const whenDate = parseWhen();
    const body = {
      recipient_name: document.getElementById("s-name").value.trim(),
      /* contact 收款（手机号/邮箱）原样上送——服务端建单时定位唯一账户默认卡并钉死卡号+真名 */
      recipient_account: contactAcct || acctDigits(),
      amount: document.getElementById("s-amt").value.trim(),
      memo: document.getElementById("s-memo").value.trim() || undefined,
      execute_at: whenDate ? whenDate.toISOString() : null,
      repeat: repSel.value,
      from_card: fromSlug ?? undefined,
    };
    if (!body.recipient_name || (!contactAcct && !/^\d{16}$/.test(body.recipient_account)) || !/^\d+(\.\d{1,2})?$/.test(body.amount ?? "") || !body.execute_at) {
      S.ui.toast(S.t("sched.fillAll"), true); return;
    }
    S.ui.btnBusy(goBtn, true);
    try {
      const r = await S.api.mutate("/api/schedules", body, {
        subject: body.recipient_name,
        proc: { key: "sched.procTitle" }, /* 执行段处理中覆盖层（第六十一轮） */
      });
      if (r.cancelled) return;
    if (r.data?.status === "EXECUTED") {
      S.ui.modal(`<h2>${S.ui.icon("check", 20)} ${S.fmt.escape(S.t("sch.created"))}</h2>
        <div class="genui-card" style="max-width:none">
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("genui.to"))}</span><span class="v">${S.fmt.escape(body.recipient_name)}</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("sch.when"))}</span><span class="v mono">${S.fmt.escape(whenVal)}<div class="muted small" style="font-family:var(--font-sans)">${S.fmt.escape(document.getElementById("tz-dual").textContent)}</div></span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("sch.repeat"))}</span><span class="v">${S.fmt.escape({ once: S.t("sch.once"), monthly: S.t("sch.monthly"), yearly: S.t("sch.yearly") }[repSel.value])}</span></div></div>
        ${S.sim.footnote()}
        <div class="modal-actions"><a class="btn btn-ghost" href="/ai/tasks">${S.fmt.escape(S.t("tasks.title"))}</a>
        <button class="btn btn-primary" onclick="location.reload()">${S.fmt.escape(S.t("common.done"))}</button></div>`);
    } else {
      /* 收款方真实性等结构化拒绝：行内红条具体原因（与 toast 同文案） */
      showErr(r);
      S.ui.toast(S.fmt.blockedMsg(r, "transfer.failed"), true);
    }
    } finally {
      S.ui.btnBusy(goBtn, false);
      goBtn.disabled = !debits.length || !samewarn.hidden;
    }
  };

  /* ---- 长程任务中心（仅预约转账类） ---- */
  const t = await S.api.get("/api/tasks");
  const taskBox = document.getElementById("tasks");
  taskBox.innerHTML = (t.data?.tasks ?? []).filter((x) => x.type === "scheduled_transfer").map((x) => `
    <div class="list-row"><span class="avatar">${S.ui.icon("clock", 14)}</span>
      <div class="grow"><b>${S.fmt.escape(x.title)}</b><div class="muted small mono">${S.fmt.escape(S.t("tasks.next"))} ${x.next_run_at ? S.fmt.datetimeSec(x.next_run_at) : "—"}</div></div>
      ${S.ui.badge(S.t("tasks.status." + x.status) ?? x.status, x.status === "DONE" ? "badge-green" : x.status === "PENDING" ? "badge-yellow" : "badge-gray")}
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
});
