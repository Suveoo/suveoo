/* card-loss.js — 第一百二十六轮：卡片挂失专属页（/account/card/{slug}/report-loss）
 * 三态：①表单态（无进行中挂失）——卡面/卡号/卡种/别名 + 补办勾选×邮寄地址 + 费用清单联动（¥20↔¥53）
 *       + 费用付款卡（排除本卡）+ /contact 入口；红级流走 S.api.mutate（确认卡内含 OTP，统一打包挂失+费用支付）。
 * ②挂失中态（loss=requested）——本页变进度详情页：冻结横幅/费用凭证/邮寄地址/下一步指引 + 「确认签收并激活」（红级）。
 * ③激活完成——toast 后回卡片管理页。 */
S.router.register("card-loss", async () => {
  const c = document.getElementById("content");
  const slug = (location.pathname.match(/\/account\/card\/([a-z0-9-]+)\/report-loss/) ?? [])[1];
  if (!slug) { c.innerHTML = `<h1>${S.fmt.escape(S.t("loss.title"))}</h1><div class="card">${S.ui.empty(S.t("loss.cardMissing"))}</div>`; return; }
  c.innerHTML = `<h1>${S.fmt.escape(S.t("loss.title"))}</h1><div class="card">${S.ui.skeleton(3)}</div>`;
  const [cr, lr, ar] = await Promise.all([
    S.api.get(`/api/cards/${slug}`),
    S.api.get(`/api/cards/${slug}/loss`),
    S.api.get("/api/cards"),
  ]);
  if (!cr.ok) { c.innerHTML = `<h1>${S.fmt.escape(S.t("loss.title"))}</h1><div class="card">${S.ui.empty(S.t(cr.data?.error === "NOT_FOUND" ? "loss.cardMissing" : "common.loadFailed"))}</div>`; return; }
  const cd = cr.data.card;
  const cards = ar.ok ? (ar.data.cards ?? []) : [cd]; /* 卡面去重需全列表（cardFront 第二参数） */
  const loss = lr.ok ? lr.data.loss : null;
  const kindTxt = cd.kind === "credit" ? S.t("cards.credit") : S.t("cards.classIc", cd.class_label);
  const cardHead = `
    <div class="cl-card">
      <img class="bc-art" src="${S.fmt.cardFront(cd, cards)}" alt="">
      <div class="grow">
        <b class="mono cl-num">${S.fmt.escape(cd.number)}</b>
        <div class="muted small">${S.fmt.escape(kindTxt)} · ${S.fmt.escape(cd.network)}${cd.alias ? ` · ${S.fmt.escape(cd.alias)}` : ""}${cd.is_default ? ` · ${S.fmt.escape(S.t("cards.default"))}` : ""}</div>
      </div>
    </div>`;

  /* ===== ②挂失中态：进度详情页 ===== */
  if (loss && loss.status === "requested") {
    const fees = [[S.t("loss.feeReport"), (loss.fee_report / 100).toFixed(2)]];
    if (loss.replace_new) fees.push([S.t("loss.feeReissue"), (loss.fee_reissue / 100).toFixed(2)], [S.t("loss.feeShip"), (loss.fee_ship / 100).toFixed(2)]);
    const totalC = loss.fee_report + (loss.replace_new ? loss.fee_reissue + loss.fee_ship : 0);
    c.innerHTML = `
      <div class="row between"><h1>${S.fmt.escape(S.t("loss.statusTitle"))}</h1><a class="btn btn-ghost btn-sm" href="/account/cards">← ${S.fmt.escape(S.t("cards.title"))}</a></div>
      <div class="card">
        ${cardHead}
        <div class="cl-banner">${S.ui.icon("snow", 16)} ${S.fmt.escape(S.t("loss.frozen"))} <span class="muted small">${S.fmt.escape(S.t("loss.requestedAt"))}：${S.fmt.escape(String(loss.created_at).slice(0, 16).replace("T", " "))}</span></div>
        <div class="section-title cs-sec"><h3>${S.fmt.escape(S.t("loss.feesPaid"))}</h3></div>
        ${fees.map(([k, v]) => `<div class="gc-kv"><span class="muted">${S.fmt.escape(k)}</span><span class="v mono">¥ ${S.fmt.escape(v)}</span></div>`).join("")}
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.total"))}</span><span class="v mono"><b>¥ ${(totalC / 100).toFixed(2)}</b></span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.voucher"))}</span><span class="v mono"><a href="/account/card/${cd.slug}/history">${S.fmt.escape(loss.tx_id)}</a></span></div>
        ${loss.replace_new ? `<div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.mailLabel"))}</span><span class="v">${S.fmt.escape(loss.mail_to ?? "—")}</span></div>` : ""}
        <div class="section-title cs-sec"><h3>${S.fmt.escape(S.t("loss.next"))}</h3></div>
        <p class="muted small" style="margin:0 0 4px">${S.fmt.escape(S.t(loss.replace_new ? "loss.nextReplace" : "loss.nextNo"))}</p>
        <button class="btn btn-primary" id="cl-act" style="margin-top:10px">${S.ui.icon("check", 14)} ${S.fmt.escape(S.t("loss.actBtn"))}</button>
        <p class="muted small" style="margin-top:10px"><a href="/contact">${S.fmt.escape(S.t("loss.contact"))}</a>${S.fmt.escape(S.t("common.simPrice"))}</p>
      </div>`;
    const act = document.getElementById("cl-act");
    act.onclick = async () => {
      S.ui.btnBusy(act, true);
      try {
        const r2 = await S.api.mutate(`/api/cards/${slug}/loss/activate`, {});
        if (r2.cancelled) return;
        if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("loss.actOk")); setTimeout(() => { location.href = "/account/cards"; }, 900); }
        else S.ui.toast(S.fmt.blockedMsg(r2), true);
      } finally { S.ui.btnBusy(act, false); }
    };
    return;
  }

  /* ===== ①表单态：挂失申请 ===== */
  const payOptions = cards.filter((x) => x.slug !== cd.slug && x.status === "ACTIVE");
  const defaultPay = payOptions.find((x) => x.kind === "debit" && x.is_default) ?? payOptions[0];
  let payIdx = Math.max(0, payOptions.indexOf(defaultPay));
  const payLabel = (x) => `${x.kind === "credit" ? S.t("cards.credit") : S.t("cards.classIc", x.class_label)}（${String(x.number).slice(-4)}）${x.alias ? ` · ${x.alias}` : ""}`;
  c.innerHTML = `
    <div class="row between"><h1>${S.fmt.escape(S.t("loss.title"))}</h1><a class="btn btn-ghost btn-sm" href="/account/card/${cd.slug}/settings">← ${S.fmt.escape(S.t("card.settings"))}</a></div>
    <div class="card">
      ${cardHead}
      <div class="cl-banner cl-warn">${S.ui.icon("shield", 16)} ${S.fmt.escape(S.t("loss.warn"))}</div>
      <label class="row cl-replace" style="gap:8px"><span class="switch"><input type="checkbox" id="cl-rep"><span class="tk"></span></span><span><b>${S.fmt.escape(S.t("loss.replace"))}</b><div class="muted small">${S.fmt.escape(S.t("loss.replaceHint"))}</div></span></label>
      <label class="field cl-mail" id="cl-mail-wrap" hidden><span class="lb">${S.fmt.escape(S.t("loss.mailTo"))}</span>
        <textarea class="input" id="cl-mail" rows="2" placeholder="${S.fmt.escape(S.t("loss.mailToPh"))}"></textarea></label>
      <div class="section-title cs-sec"><h3>${S.fmt.escape(S.t("loss.fees"))}</h3></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.feeReport"))}</span><span class="v mono">¥ 20.00</span></div>
      <div id="cl-fee-rep" hidden>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.feeReissue"))}</span><span class="v mono">¥ 15.00</span></div>
        <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.feeShip"))}</span><span class="v mono">¥ 18.00</span></div>
      </div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("loss.total"))}</span><span class="v mono cl-total"><b>¥ 20.00</b></span></div>
      <div class="cl-paylb"><span class="lb">${S.fmt.escape(S.t("loss.payCard"))}</span><span class="muted small">${S.fmt.escape(S.t("loss.payCardHint"))}</span></div>
      <div class="cl-sel" id="cl-sel">
        <button type="button" class="cl-sel-btn" id="cl-sel-btn" aria-haspopup="listbox" aria-expanded="false"><span class="cl-sel-cur" id="cl-sel-cur"></span>${S.ui.icon("chevron", 14)}</button>
        <div class="cl-sel-list" id="cl-sel-list" role="listbox" hidden>
          ${payOptions.map((x, i) => `<button type="button" class="cl-sel-opt" data-i="${i}" role="option"><span class="cl-sel-kind ${x.kind === "credit" ? "credit" : "debit"}"></span><span class="grow cl-sel-name">${S.fmt.escape(payLabel(x))}</span><span class="mono cl-sel-bal">¥ ${S.fmt.escape(x.available ?? x.balance)}</span></button>`).join("")}
        </div>
      </div>
      <button class="btn btn-danger" id="cl-go" style="margin-top:14px;width:100%">${S.ui.icon("snow", 14)} ${S.fmt.escape(S.t("loss.submit"))}</button>
      <p class="muted small" style="margin-top:10px"><a href="/contact">${S.fmt.escape(S.t("loss.contact"))}</a>${S.fmt.escape(S.t("common.simPrice"))}</p>
    </div>`;

  /* 自绘付款卡选择器（第一百二十七轮：禁用系统原生 select） */
  const selBtn = document.getElementById("cl-sel-btn");
  const selList = document.getElementById("cl-sel-list");
  const selCur = document.getElementById("cl-sel-cur");
  const paintSel = () => {
    const x = payOptions[payIdx];
    selCur.textContent = payLabel(x);
    selList.querySelectorAll(".cl-sel-opt").forEach((o) => o.classList.toggle("on", Number(o.dataset.i) === payIdx));
  };
  paintSel();
  const closeSel = () => { selList.hidden = true; selBtn.setAttribute("aria-expanded", "false"); };
  selBtn.onclick = (e) => { e.stopPropagation(); selList.hidden = !selList.hidden; selBtn.setAttribute("aria-expanded", String(!selList.hidden)); };
  selList.querySelectorAll(".cl-sel-opt").forEach((o) => {
    o.onclick = (e) => { e.stopPropagation(); payIdx = Number(o.dataset.i); paintSel(); closeSel(); };
  });
  document.addEventListener("click", closeSel);

  const rep = document.getElementById("cl-rep");
  const mailWrap = document.getElementById("cl-mail-wrap");
  const feeRep = document.getElementById("cl-fee-rep");
  const totalEl = document.querySelector(".cl-total b");
  rep.onchange = () => {
    mailWrap.hidden = !rep.checked;
    feeRep.hidden = !rep.checked;
    totalEl.textContent = rep.checked ? "¥ 53.00" : "¥ 20.00";
  };
  const go = document.getElementById("cl-go");
  go.onclick = async () => {
    const replaceNew = rep.checked;
    const mailTo = document.getElementById("cl-mail").value.trim();
    if (replaceNew && mailTo.length < 5) { S.ui.toast(S.t("loss.mailNeed"), true); return; }
    const body = { replaceNew, mailTo: replaceNew ? mailTo : null, payCard: payOptions[payIdx]?.slug };
    S.ui.btnBusy(go, true);
    try {
      /* 红级统一确认卡：S.consent.modal 渲染（含 OTP 输入+通道切换）——确认挂失与费用支付一张卡打包 */
      const r2 = await S.api.mutate(`/api/cards/${slug}/loss/report`, body);
      if (r2.cancelled) return;
      if (r2.data?.status === "EXECUTED") {
        S.ui.toast(S.t("loss.okToast", r2.data.result?.tx_id ?? ""));
        setTimeout(() => location.reload(), 900); /* 本页转挂失中详情态 */
      } else S.ui.toast(S.fmt.blockedMsg(r2), true);
    } finally { S.ui.btnBusy(go, false); }
  };
});
