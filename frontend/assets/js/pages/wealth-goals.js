/* wealth-goals.js — P41 攒钱目标（第二十三期改版：新建目标摩尔斯展开 + 自定义日历 + 环号同行 % + 桌面纵向分隔线 + 平滑开合动画）
 * 数据：/api/goals（DO 富化 saved/pct/on_track/predicted_at/has_monthly_task）。
 * 写操作全走 S.api.mutate 两段式（YELLOW 确认卡 = BankAction IR + 五道验证，与表单/AI 同规）：
 * 建/调/弃 = goal_* intent；存入 = goal_contribute（dynamic：日累计>¥1000 服务端自动升红出 OTP）。
 * auto_monthly（第二十三期）：新建勾选一次确认即挂月度任务；调整卡内开关（true 无则建 / false 取消）。
 * 设计律：进度环主视觉 + 简单大标题（工具页不做渐变 Hero）。 */
S.router.register("wealth-goals", async ({ user }) => {
  const c = document.getElementById("content");
  if (!user) { location.replace("/account/login?next=/wealth/goals"); return; }
  const esc = S.fmt.escape;
  c.innerHTML = `
    <h1>${esc(S.t("wealth.goals"))}</h1>
    <button class="gl-new" id="gl-new" type="button"><span class="gl-new-t">${S.ui.icon("plus", 14)} ${esc(S.t("goals.new"))}</span>
      <form class="gl-new-body" id="gl-form" novalidate><div class="gl-new-inner">
        <label class="field"><span class="lb">${esc(S.t("goals.name"))}</span>
          <input class="input" id="gl-name" maxlength="40" placeholder="${esc(S.t("goals.namePh"))}"></label>
        <label class="field"><span class="lb">${esc(S.t("goals.target"))}</span>
          <input class="input mono" id="gl-target" inputmode="decimal" placeholder="20000.00"></label>
        <label class="field"><span class="lb">${esc(S.t("goals.deadline"))}</span>
          <button type="button" class="input gl-date" id="gl-deadline" aria-haspopup="dialog">${esc(S.t("goals.pickDate"))}</button></label>
        <label class="gl-auto"><input type="checkbox" id="gl-auto"><span>${esc(S.t("goals.autoMonthly"))}</span></label>
        <button class="btn btn-primary" type="submit">${esc(S.t("goals.create"))}</button>
      </div></form>
    </button>
    <div id="gl-list">${S.ui.skeleton(3)}</div>`;

  /* 新建目标：胶囊按钮向外（右下）扩张成白卡——宽度 JS 定桩后过渡到 100%，底色/圆角/内距同步形变 */
  let newDeadline = "";
  const newBtn = document.getElementById("gl-new");
  newBtn.addEventListener("click", (e) => {
    if (e.target.closest("#gl-form")) return;
    if (!newBtn.classList.contains("open")) {
      newBtn.style.width = newBtn.offsetWidth + "px";
      void newBtn.offsetWidth; /* 强制回流，确保宽度过渡起点生效 */
      newBtn.classList.add("open");
      requestAnimationFrame(() => { newBtn.style.width = "100%"; setTimeout(() => document.getElementById("gl-name")?.focus(), 260); });
    }
  });
  document.getElementById("gl-deadline").onclick = async () => {
    const v = await S.ctl.calendar({ value: newDeadline });
    if (v) { newDeadline = v; document.getElementById("gl-deadline").textContent = v; document.getElementById("gl-deadline").classList.add("has"); }
  };
  const form = document.getElementById("gl-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("gl-name").value.trim();
    const target = document.getElementById("gl-target").value.trim();
    if (!name || !/^\d+(\.\d{1,2})?$/.test(target)) { S.ui.toast(S.t("common.badAmount"), true); return; }
    if (!newDeadline) { S.ui.toast(S.t("goals.pickDate"), true); return; }
    const r = await S.api.mutate("/api/goals", { name, target_amount: target, deadline: newDeadline, auto_monthly: document.getElementById("gl-auto").checked }, { subject: name });
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

  /* 进度环：数字与 % 同一行（% 上标式贴右），reduced-motion 下 CSS 关过渡 */
  const R = 44, CIRC = 2 * Math.PI * R;
  const ring = (pct, done) => {
    const n = Math.round(Math.min(100, pct));
    return `
    <svg class="gl-ring${done ? " done" : ""}" viewBox="0 0 100 100" role="img" aria-label="${n}%">
      <circle class="tr" cx="50" cy="50" r="${R}"></circle>
      <circle class="pr" cx="50" cy="50" r="${R}" style="stroke-dasharray:${(Math.min(100, pct) * CIRC / 100).toFixed(1)} ${CIRC.toFixed(1)}"></circle>
      <text x="50" y="50"><tspan class="n">${n}</tspan><tspan class="u">%</tspan></text>
    </svg>`;
  };

  const badge = (g) => g.status === "ACHIEVED" ? S.ui.badge(S.t("goals.achievedBadge"), "badge-green")
    : g.status === "ABANDONED" ? S.ui.badge(S.t("goals.abandonedBadge"), "badge-navy")
    : g.on_track ? S.ui.badge(S.t("goals.onTrack"), "badge-green") : S.ui.badge(S.t("goals.offTrack"), "badge-yellow");

  box.innerHTML = goals.map((g) => {
    const active = g.status === "ACTIVE";
    const predicted = active && g.predicted_at ? S.fmt.datetime(g.predicted_at) : null;
    return `
    <div class="card gl-card${active ? "" : " ended"}" data-id="${g.id}">
      <div class="gl-main">
        <div class="gl-head">
          ${ring(Number(g.pct ?? 0), g.status === "ACHIEVED")}
          <div class="gl-info">
            <div class="row gl-namerow"><b class="gl-name">${esc(g.name)}</b><span class="gl-badge-m">${badge(g)}</span></div>
            <div class="gl-nums"><span class="mono gl-saved">¥${S.fmt.moneyPlain(g.saved)}</span><span class="muted">/ ¥${S.fmt.moneyPlain(g.target)}</span></div>
            <div class="gl-bar"><i style="width:${Math.min(100, Number(g.pct ?? 0)).toFixed(1)}%"></i></div>
          </div>
        </div>
        ${active ? `
        <div class="gl-acts">
          <button class="btn btn-primary btn-sm gl-put" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.contribute"))}</button>
          <button class="btn btn-light btn-sm gl-adj" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.adjust"))}</button>
          <button class="btn btn-ghost btn-sm gl-abd" data-id="${g.id}" data-name="${esc(g.name)}">${esc(S.t("goals.abandon"))}</button>
        </div>` : ""}
      </div>
      <div class="gl-side">
        <div class="gl-badge-d">${badge(g)}</div>
        <div class="muted small">${esc(S.t("goals.deadlineLabel"))} <span class="mono">${esc(g.deadline)}</span></div>
        <div class="muted small gl-meta-m">${esc(S.t("goals.monthly"))} ¥${S.fmt.moneyPlain(g.monthly_plan)}</div>
        ${predicted ? `<div class="muted small gl-meta-p">${esc(S.t("goals.predict", predicted))}</div>` : active ? `<div class="muted small gl-meta-p">${esc(S.t("goals.noPredict"))}</div>` : ""}
        ${g.has_monthly_task ? `<div class="gl-task-chip">${S.ui.icon("clock", 12)} ${esc(S.t("goals.linkedTask"))}</div>` : ""}
        <button class="ai-chip ask" data-q="${esc(S.t("goals.askAiQ", g.name))}">${S.ui.icon("ai", 12)} ${esc(S.t("goals.askAi"))}</button>
      </div>
      ${active ? `
      <form class="gl-form gl-inline" data-kind="put" data-id="${g.id}" novalidate>
        <div class="gl-inline-in">
          <label class="field"><span class="lb">${esc(S.t("goals.contribute"))}（CNY）</span>
            <input class="input mono" inputmode="decimal" placeholder="${esc(S.t("goals.contributePh"))}"></label>
          <button class="btn btn-primary btn-sm" type="submit">${esc(S.t("goals.contribute"))}</button>
        </div>
      </form>
      <form class="gl-form gl-inline" data-kind="adj" data-id="${g.id}" data-auto="${g.has_monthly_task ? "1" : "0"}" novalidate>
        <div class="gl-inline-in">
          <label class="field"><span class="lb">${esc(S.t("goals.adjustTarget"))}</span>
            <input class="input mono" inputmode="decimal" placeholder="30000.00"></label>
          <label class="field"><span class="lb">${esc(S.t("goals.adjustDeadline"))}</span>
            <button type="button" class="input gl-date gl-adj-date">${esc(S.t("goals.pickDate"))}</button></label>
          <label class="gl-auto"><input type="checkbox" class="gl-adj-auto" ${g.has_monthly_task ? "checked" : ""}><span>${esc(S.t("goals.autoMonthly"))}</span></label>
          <button class="btn btn-primary btn-sm" type="submit">${esc(S.t("goals.adjust"))}</button>
        </div>
      </form>` : ""}
    </div>`;
  }).join("") + `<p class="muted small gl-note">${esc(S.t("goals.note"))}</p>`;

  /* 存入/调整开合：grid-rows 0fr→1fr 平滑展开；调整卡截止日期走日历；auto 勾选三态（未动不发字段） */
  const toggleInline = (card, kind) => {
    const put = card.querySelector('.gl-inline[data-kind="put"]');
    const adj = card.querySelector('.gl-inline[data-kind="adj"]');
    (kind === "put" ? adj : put).classList.remove("open");
    (kind === "put" ? put : adj).classList.toggle("open");
  };
  S.ui.$$("#gl-list .gl-put").forEach((b) => b.onclick = () => toggleInline(b.closest(".gl-card"), "put"));
  S.ui.$$("#gl-list .gl-adj").forEach((b) => b.onclick = () => toggleInline(b.closest(".gl-card"), "adj"));
  S.ui.$$("#gl-list .gl-adj-date").forEach((btn) => {
    btn.onclick = async () => {
      const v = await S.ctl.calendar({ value: btn.dataset.v ?? "" });
      if (v) { btn.dataset.v = v; btn.textContent = v; btn.classList.add("has"); }
    };
  });
  S.ui.$$("#gl-list .gl-inline").forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const g = goals.find((x) => String(x.id) === f.dataset.id);
      if (f.dataset.kind === "put") {
        const amount = f.querySelector("input").value.trim();
        if (!/^\d+(\.\d{1,2})?$/.test(amount)) { S.ui.toast(S.t("common.badAmount"), true); return; }
        const r = await S.api.mutate(`/api/goals/${f.dataset.id}/contribute`, { amount }, { subject: g?.name });
        if (r.cancelled) return;
        if (r.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
        else S.ui.toast(r.data?.message ?? r.data?.reason ?? r.data?.error?.message ?? "failed", true);
      } else {
        const target = f.querySelectorAll("input")[0].value.trim();
        const deadline = f.querySelector(".gl-adj-date").dataset.v ?? "";
        const autoBox = f.querySelector(".gl-adj-auto");
        const autoChanged = autoBox.checked !== (f.dataset.auto === "1");
        if (!target && !deadline && !autoChanged) { S.ui.toast(S.t("goals.adjustTarget"), true); return; }
        const body = {};
        if (target) body.target_amount = target;
        if (deadline) body.deadline = deadline;
        if (autoChanged) body.auto_monthly = autoBox.checked;
        const r = await S.api.mutate(`/api/goals/${f.dataset.id}`, body, { method: "PATCH", subject: g?.name });
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
