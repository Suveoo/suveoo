/* wealth-goals.js — P41 攒钱目标（第二十二期：目标陪伴 / AI Savings Coach）
 * 数据：/api/goals（DO 富化 saved/pct/on_track/predicted_at/has_monthly_task）。
 * 写操作全走 S.api.mutate 两段式（YELLOW 确认卡 = BankAction IR + 五道验证，与表单/AI 同规）：
 * 建/调/弃 = goal_* intent；存入 = goal_contribute（dynamic：日累计>¥1000 服务端自动升红出 OTP）。
 * 设计律：进度环主视觉 + 简单大标题（工具页不做渐变 Hero，/wealth/my 先例克制版）。 */
S.router.register("wealth-goals", async ({ user }) => {
  const c = document.getElementById("content");
  if (!user) { location.replace("/account/login?next=/wealth/goals"); return; }
  const esc = S.fmt.escape;
  c.innerHTML = `
    <h1>${esc(S.t("wealth.goals"))}</h1>
    <p class="muted small gl-sub">${esc(S.t("goals.sub"))}</p>
    <div class="card gl-new-card">
      <button class="btn btn-primary gl-new-btn" id="gl-new">${esc(S.t("goals.new"))}</button>
      <form class="gl-form" id="gl-form" novalidate>
        <label class="field"><span class="lb">${esc(S.t("goals.name"))}</span>
          <input class="input" id="gl-name" maxlength="40" placeholder="${esc(S.t("goals.namePh"))}"></label>
        <label class="field"><span class="lb">${esc(S.t("goals.target"))}</span>
          <input class="input mono" id="gl-target" inputmode="decimal" placeholder="20000.00"></label>
        <label class="field"><span class="lb">${esc(S.t("goals.deadline"))}</span>
          <input class="input mono" id="gl-deadline" inputmode="numeric" placeholder="${esc(S.t("goals.deadlinePh"))}"></label>
        <button class="btn btn-primary" type="submit">${esc(S.t("goals.create"))}</button>
      </form>
    </div>
    <div id="gl-list">${S.ui.skeleton(3)}</div>
    ${S.sim.footnote()}`;

  /* 新建目标（YELLOW 两段式） */
  const form = document.getElementById("gl-form");
  document.getElementById("gl-new").onclick = () => form.classList.toggle("open");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("gl-name").value.trim();
    const target = document.getElementById("gl-target").value.trim();
    const deadline = document.getElementById("gl-deadline").value.trim();
    if (!name || !/^\d+(\.\d{1,2})?$/.test(target)) { S.ui.toast(S.t("common.badAmount"), true); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) { S.ui.toast(S.t("goals.deadlinePh"), true); return; }
    const r = await S.api.mutate("/api/goals", { name, target_amount: target, deadline }, { subject: name });
    if (r.cancelled) return;
    if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
    else S.ui.toast(r.data?.message ?? r.data?.reason ?? r.data?.error?.message ?? "failed", true);
  };

  const r = await S.api.get("/api/goals");
  const box = document.getElementById("gl-list");
  if (!r.ok) { box.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const goals = r.data.goals ?? [];
  if (!goals.length) {
    box.innerHTML = S.ui.empty(S.t("goals.emptyTitle")) + `
      <div class="card gl-empty-tip"><p class="muted small">${esc(S.t("goals.emptyTip"))}</p>
      <button class="btn btn-light btn-sm" id="gl-ask-empty">${S.ui.icon("ai", 12)} ${esc(S.t("goals.askAi"))}</button></div>`;
    const b = document.getElementById("gl-ask-empty");
    if (b) b.onclick = () => S.router.ai(S.t("goals.emptyAskQ"));
    return;
  }

  /* 进度环（SVG stroke-dasharray；reduced-motion 下 CSS 关过渡） */
  const R = 44, CIRC = 2 * Math.PI * R;
  const ring = (pct, done) => `
    <svg class="gl-ring${done ? " done" : ""}" viewBox="0 0 100 100" role="img" aria-label="${Math.round(pct)}%">
      <circle class="tr" cx="50" cy="50" r="${R}"></circle>
      <circle class="pr" cx="50" cy="50" r="${R}" style="stroke-dasharray:${(Math.min(100, pct) * CIRC / 100).toFixed(1)} ${CIRC.toFixed(1)}"></circle>
      <text x="50" y="50"><tspan class="n" dy="-2">${Math.round(pct)}</tspan><tspan class="u" dy="14">%</tspan></text>
    </svg>`;

  const badge = (g) => g.status === "ACHIEVED" ? S.ui.badge(S.t("goals.achievedBadge"), "badge-green")
    : g.status === "ABANDONED" ? S.ui.badge(S.t("goals.abandonedBadge"), "badge-navy")
    : g.on_track ? S.ui.badge(S.t("goals.onTrack"), "badge-green") : S.ui.badge(S.t("goals.offTrack"), "badge-yellow");

  box.innerHTML = goals.map((g) => {
    const active = g.status === "ACTIVE";
    const predicted = active && g.predicted_at ? S.fmt.datetime(g.predicted_at) : null;
    return `
    <div class="card gl-card${active ? "" : " ended"}" data-id="${g.id}">
      <div class="gl-head">
        ${ring(Number(g.pct ?? 0), g.status === "ACHIEVED")}
        <div class="gl-info">
          <div class="row" style="gap:8px;flex-wrap:wrap"><b class="gl-name">${esc(g.name)}</b>${badge(g)}</div>
          <div class="gl-nums"><span class="mono gl-saved">¥${S.fmt.moneyPlain(g.saved)}</span><span class="muted">/ ¥${S.fmt.moneyPlain(g.target)}</span></div>
          <div class="muted small">${esc(S.t("goals.deadlineLabel"))} <span class="mono">${esc(g.deadline)}</span> · ${esc(S.t("goals.monthly"))} ¥${S.fmt.moneyPlain(g.monthly_plan)}</div>
          ${predicted ? `<div class="muted small">${esc(S.t("goals.predict", predicted))}</div>` : active ? `<div class="muted small">${esc(S.t("goals.noPredict"))}</div>` : ""}
          ${g.has_monthly_task ? `<div class="gl-task-chip">${S.ui.icon("clock", 12)} ${esc(S.t("goals.linkedTask"))}</div>` : ""}
        </div>
      </div>
      ${active ? `
      <div class="gl-acts">
        <button class="btn btn-primary btn-sm gl-put" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.contribute"))}</button>
        <button class="btn btn-light btn-sm gl-adj" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.adjust"))}</button>
        <button class="btn btn-ghost btn-sm gl-abd" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.abandon"))}</button>
        <span class="grow"></span>
        <button class="ai-chip ask" data-q="${esc(S.t("goals.askAiQ", g.name))}">${S.ui.icon("ai", 12)} ${esc(S.t("goals.askAi"))}</button>
      </div>
      <form class="gl-form gl-inline" data-kind="put" data-id="${g.id}" novalidate>
        <label class="field"><span class="lb">${esc(S.t("goals.contribute"))}（CNY）</span>
          <input class="input mono" inputmode="decimal" placeholder="${esc(S.t("goals.contributePh"))}"></label>
        <button class="btn btn-primary btn-sm" type="submit">${esc(S.t("goals.contribute"))}（YELLOW）</button>
      </form>
      <form class="gl-form gl-inline" data-kind="adj" data-id="${g.id}" novalidate>
        <label class="field"><span class="lb">${esc(S.t("goals.adjustTarget"))}</span>
          <input class="input mono" inputmode="decimal" placeholder="30000.00"></label>
        <label class="field"><span class="lb">${esc(S.t("goals.adjustDeadline"))}</span>
          <input class="input mono" inputmode="numeric" placeholder="YYYY-MM-DD"></label>
        <button class="btn btn-primary btn-sm" type="submit">${esc(S.t("goals.adjust"))}（YELLOW）</button>
      </form>` : ""}
    </div>`;
  }).join("") + `<p class="muted small gl-note">${esc(S.t("goals.note"))}</p>`;

  /* 存入/调整内联表单开合 + 提交（两段式 mutate） */
  S.ui.$$("#gl-list .gl-put").forEach((b) => b.onclick = () => {
    const card = b.closest(".gl-card");
    card.querySelector('.gl-inline[data-kind="adj"]').classList.remove("open");
    card.querySelector('.gl-inline[data-kind="put"]').classList.toggle("open");
  });
  S.ui.$$("#gl-list .gl-adj").forEach((b) => b.onclick = () => {
    const card = b.closest(".gl-card");
    card.querySelector('.gl-inline[data-kind="put"]').classList.remove("open");
    card.querySelector('.gl-inline[data-kind="adj"]').classList.toggle("open");
  });
  S.ui.$$("#gl-list .gl-inline").forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const inputs = [...f.querySelectorAll("input")];
      if (f.dataset.kind === "put") {
        const amount = inputs[0].value.trim();
        if (!/^\d+(\.\d{1,2})?$/.test(amount)) { S.ui.toast(S.t("common.badAmount"), true); return; }
        const r = await S.api.mutate(`/api/goals/${f.dataset.id}/contribute`, { amount }, { subject: f.dataset.id ? (goals.find((x) => String(x.id) === f.dataset.id)?.name) : null });
        if (r.cancelled) return;
        if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
        else S.ui.toast(r.data?.message ?? r.data?.reason ?? r.data?.error?.message ?? "failed", true);
      } else {
        const target = inputs[0].value.trim(), deadline = inputs[1].value.trim();
        if (!target && !deadline) { S.ui.toast(S.t("goals.adjustTarget"), true); return; }
        const body = {};
        if (target) body.target_amount = target;
        if (deadline) body.deadline = deadline;
        const r = await S.api.mutate(`/api/goals/${f.dataset.id}`, body, { method: "PATCH", subject: goals.find((x) => String(x.id) === f.dataset.id)?.name });
        if (r.cancelled) return;
        if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
        else S.ui.toast(r.data?.message ?? r.data?.reason ?? r.data?.error?.message ?? "failed", true);
      }
    };
  });
  /* 放弃（YELLOW 确认卡自带后果说明） */
  S.ui.$$("#gl-list .gl-abd").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const r = await S.api.mutate(`/api/goals/${b.dataset.id}/abandon`, {}, { subject: b.dataset.name });
    if (r.cancelled) { b.disabled = false; return; }
    if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
    else { S.ui.toast(r.data?.message ?? r.data?.reason ?? r.data?.error?.message ?? "failed", true); b.disabled = false; }
  });
  S.ui.$$("#gl-list .ask").forEach((b) => { b.onclick = () => S.router.ai(b.dataset.q); });
});
