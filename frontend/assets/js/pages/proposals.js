/* proposals.js — P13.6 AI 提议（第六期 idle：AI 主动银行）
   战报 hero（本月已省/办妥/惯例三 num-xl）+ 待办提议卡（tint 四族）+ 本月已办妥。
   「让 AI 办」= S.api.mutate 走既有 intent 通道（黄/红确认卡 = BankAction IR + 五道验证，与表单同规）；
   执行成功后 settle 由服务端核验事实（订阅确实已退/任务确实建立…）才记账——不信任前端自报。 */
S.router.register("ai-proposals", async ({ user }) => {
  const c = document.getElementById("content");
  c.innerHTML = `
    <div class="pp-hero bg-grad-navy">
      <img class="pp-art" src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt="" loading="lazy">
      <div class="pp-hero-txt">
        <span class="pp-hero-tag">${S.ui.icon("ai", 13)} Suveoo AI</span>
        <h1>${S.fmt.escape(S.t("prop.heroTitle"))}<span class="pp-month mono" id="pp-month"></span></h1>
        <p class="pp-hero-sub">${S.fmt.escape(S.t("prop.heroSub"))}</p>
        <div class="pp-nums" id="pp-nums">
          <div class="skeleton" style="width:120px;height:44px"></div>
          <div class="skeleton" style="width:120px;height:44px"></div>
          <div class="skeleton" style="width:120px;height:44px"></div>
        </div>
      </div>
    </div>
    <div class="section-title" style="margin-top:20px"><h2>${S.fmt.escape(S.t("prop.pending"))}</h2></div>
    <div id="pp-list">${S.ui.skeleton(3)}</div>`;

  /* kind → tint 族 / 彩色图标 / 标签键（四族轮转，同族不相邻由规则顺序天然保证） */
  const KIND = {
    SAVE:    { tint: "bg-tint-gold",   tx: "tx-gold",   ico: "ic-star-gold",    label: "prop.kindSave" },
    ROUTINE: { tint: "bg-tint-teal",   tx: "tx-teal",   ico: "ic-clock-teal",   label: "prop.kindRoutine" },
    GUARD:   { tint: "bg-tint-sky",    tx: "tx-sky",    ico: "ic-shield-sky",   label: "prop.kindGuard" },
    WEALTH:  { tint: "bg-tint-violet", tx: "tx-violet", ico: "ic-wealth-violet", label: "prop.kindWealth" },
  };
  /* 规则 → 标题/副文 i18n 模板与插值（插值全部来自服务端规则引擎，非模型生成） */
  const copyOf = (p) => {
    const q = p.params ?? {};
    switch (p.rule) {
      case "dormant_sub": return [S.t("prop.rDormantT", q.merchant ?? ""), S.t("prop.rDormantB", q.days ?? 0, q.plan ?? "", q.monthly ?? "0")];
      case "low_use_sub": return [S.t("prop.rLowUseT", q.merchant ?? ""), S.t("prop.rLowUseB", q.usage ?? 0, q.monthly ?? "0")];
      case "routine_transfer": return [S.t("prop.rRoutineT", q.day ?? "", q.name ?? ""), S.t("prop.rRoutineB", q.months ?? 0, q.day ?? "", q.amount ?? "0", q.name ?? "")];
      case "bill_autopay": return [S.t("prop.rBillT", q.billName ?? ""), S.t("prop.rBillB", q.amount ?? "0", q.dueDay ?? "")];
      case "credit_debt": return [S.t("prop.rDebtT"), S.t("prop.rDebtB", q.debt ?? "0")];
      case "idle_cash": return [S.t("prop.rIdleT"), S.t("prop.rIdleB", q.balance ?? "0", q.suggest ?? "0")];
      case "goal_offtrack": return [S.t("prop.rOfftrackT", q.name ?? ""), S.t("prop.rOfftrackB", q.name ?? "", q.saved ?? "0", q.target ?? "0", q.pct ?? "0", q.catchup ?? "0")];
      case "goal_payday": return [S.t("prop.rPaydayT"), S.t("prop.rPaydayB", q.day ?? "", q.amount ?? "0", q.name ?? "")];
      default: return [q.summary ?? p.rule, ""];
    }
  };
  const doneLabelOf = (p) => {
    const q = p.params ?? {};
    switch (p.rule) {
      case "dormant_sub": case "low_use_sub": return S.t("prop.dSave", q.monthly ?? "0");
      case "routine_transfer": return S.t("prop.dRoutine", q.day ?? "");
      case "bill_autopay": return S.t("prop.dBill");
      case "credit_debt": return S.t("prop.dDebt");
      case "idle_cash": return S.t("prop.dIdle", q.suggest ?? "0");
      case "goal_offtrack": return S.t("prop.dOfftrack");
      case "goal_payday": return S.t("prop.dPayday");
      default: return S.t("prop.needVerify");
    }
  };
  const subjectOf = (p) => {
    const q = p.params ?? {};
    return q.merchant ?? q.name ?? q.billName ?? null;
  };

  const renderHero = (report) => {
    document.getElementById("pp-month").textContent = report?.month ?? "";
    document.getElementById("pp-nums").innerHTML = `
      <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("prop.numSaved"))}</span><span class="n">¥${S.fmt.moneyPlain((Number(report?.saved_cents ?? 0) / 100).toFixed(2))}</span></div>
      <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("prop.numDone"))}</span><span class="n">${report?.done_count ?? 0}</span><span class="u">${S.fmt.escape(S.t("prop.unitItems"))}</span></div>
      <div class="num-xl"><span class="lb">${S.fmt.escape(S.t("prop.numRoutine"))}</span><span class="n">${report?.routine_count ?? 0}</span><span class="u">${S.fmt.escape(S.t("prop.unitPays"))}</span></div>`;
  };

  const renderCard = (p) => {
    const k = KIND[p.kind] ?? KIND.GUARD;
    const [title, body] = copyOf(p);
    if (p.status === "EXECUTED") {
      return `<div class="pp-card ${k.tint} done">
        <span class="pp-ico">${S.ui.icon(k.ico, 34)}</span>
        <div class="pp-body">
          <div class="pp-khead"><span class="pp-check">${S.ui.icon("check", 13)}</span><b class="pp-title">${S.fmt.escape(title)}</b></div>
          <p class="pp-desc">${S.fmt.escape(doneLabelOf(p))}${p.executed_at ? ` · <span class="mono">${S.fmt.relTime(p.executed_at)}</span>` : ""}</p>
        </div>
      </div>`;
    }
    return `<div class="pp-card ${k.tint}" data-id="${p.id}">
      <span class="pp-ico">${S.ui.icon(k.ico, 34)}</span>
      <div class="pp-body">
        <div class="pp-khead"><span class="pp-kind ${k.tx}">${S.fmt.escape(S.t(k.label))}</span>${S.ui.tierBadge(p.tier)}</div>
        <b class="pp-title">${S.fmt.escape(title)}</b>
        <p class="pp-desc">${S.fmt.escape(body)}</p>
        <div class="pp-acts">
          <button class="btn btn-primary btn-sm pp-go" data-id="${p.id}">${S.fmt.escape(S.t("prop.act"))}</button>
          <button class="btn btn-ghost btn-sm pp-no" data-id="${p.id}">${S.fmt.escape(S.t("prop.dismiss"))}</button>
        </div>
      </div>
    </div>`;
  };

  const bind = (pending) => {
    S.ui.$$("#pp-list .pp-go").forEach((btn) => {
      btn.onclick = async () => {
        const p = pending.find((x) => String(x.id) === btn.dataset.id);
        if (!p) return;
        btn.disabled = true;
        btn.textContent = S.t("prop.going");
        const { endpoint, method = "POST", args } = p.params.exec ?? {};
        const r = await S.api.mutate(endpoint, args ?? {}, { method, action: p.params.exec?.intent ?? null, subject: subjectOf(p) });
        if (r.cancelled) { btn.disabled = false; btn.textContent = S.t("prop.act"); return; }
        if (r.data?.status !== "EXECUTED") {
          btn.disabled = false;
          btn.textContent = S.t("prop.act");
          S.ui.toast(S.fmt.blockedMsg(r), true);
          return;
        }
        /* 服务端核验事实后才记账（防"假装完成"）；随后就地翻卡 + 战报刷新 */
        const st = await S.api.post(`/api/proposals/${p.id}/settle`);
        if (st.ok) {
          const card = document.querySelector(`.pp-card[data-id="${p.id}"]`);
          if (card) { card.style.transition = "opacity .35s ease, transform .35s ease"; card.style.transform = "scale(.97)";
            setTimeout(() => { card.classList.add("done"); card.style.transform = ""; }, 320); }
          S.ui.toast(S.t("common.opOk"));
          if (st.data?.report) renderHero(st.data.report);
        } else {
          S.ui.toast(S.t("prop.settleFail"), true);
        }
      };
    });
    S.ui.$$("#pp-list .pp-no").forEach((btn) => {
      btn.onclick = async () => {
        const r = await S.api.post(`/api/proposals/${btn.dataset.id}/dismiss`);
        if (!r.ok) { S.ui.toast(S.fmt.blockedMsg(r), true); return; }
        const card = document.querySelector(`.pp-card[data-id="${btn.dataset.id}"]`);
        if (card) { card.style.transition = "opacity .3s ease"; card.style.opacity = "0"; setTimeout(() => card.remove(), 300); }
      };
    });
  };

  const load = async () => {
    const r = await S.api.get("/api/proposals");
    const listEl = document.getElementById("pp-list");
    if (!r.ok) { listEl.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
    const d = r.data;
    /* 到达即视为已读（第七期 idle 凸显机制的未读判定锚点）：刷新查看戳 + 清 badge 会话缓存，
       Drawer/Footer 徽标与气泡在下次页面加载时归零 */
    S.pp.markSeen();
    renderHero(d.report);
    const pending = (d.proposals ?? []).filter((p) => p.status === "PENDING");
    const done = (d.proposals ?? []).filter((p) => p.status === "EXECUTED");
    listEl.innerHTML = pending.map(renderCard).join("") || S.ui.empty(S.t("prop.empty"));
    if (done.length) {
      listEl.insertAdjacentHTML("beforeend", `
        <div class="section-title" style="margin-top:24px"><h2>${S.fmt.escape(S.t("prop.doneSec"))}</h2></div>
        ${done.map(renderCard).join("")}`);
    }
    bind(pending);
  };
  load();
});
