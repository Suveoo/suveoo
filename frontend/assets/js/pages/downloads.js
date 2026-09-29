/* downloads.js — P28 月度报告（pdf-lib 服务端生成；状态徽章）；
   第三十六轮：说明卡移除，列表首尾留白收紧，列表外下方安全提示区（线性图标直接图案、无容器无标题） */
S.router.register("downloads", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("dl.title"))}</h1>
    <div class="card dl-list">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/reports");
  const el = c.querySelector(".dl-list");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  el.innerHTML = (r.data.months ?? []).map((m) => `
    <div class="list-row">
      <span class="avatar">${S.ui.icon("doc", 14)}</span>
      <div class="grow"><b class="mono">${S.fmt.escape(m)}</b>
        <div class="muted small">${S.fmt.escape(S.t("dl.statementNote"))} · <span class="dl-status" data-m="${S.fmt.escape(m)}">${S.fmt.escape(S.t("dl.statusPending"))}</span></div></div>
      <button class="btn btn-sm btn-light gen" data-m="${S.fmt.escape(m)}">${S.fmt.escape(S.t("dl.gen"))}</button>
      <button class="btn btn-sm btn-primary dl hidden" data-m="${S.fmt.escape(m)}">${S.ui.icon("download", 12)} ${S.fmt.escape(S.t("dl.download"))}</button>
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
  /* 安全提示区（列表容器外下方）：线性图标直接图案（无 squircle 外套）×4 条，细分隔线隔开 */
  el.insertAdjacentHTML("afterend", `
    <div class="dl-safe">
      <div class="dl-safe-row"><span class="ds-ico ds-red">${S.ui.icon("shield", 18)}</span><span>${S.fmt.escape(S.t("dl.safe1"))}</span></div>
      <hr class="ds-sep">
      <div class="dl-safe-row"><span class="ds-ico ds-amber">${S.ui.icon("lock", 18)}</span><span>${S.fmt.escape(S.t("dl.safe2"))}</span></div>
      <hr class="ds-sep">
      <div class="dl-safe-row"><span class="ds-ico ds-navy">${S.ui.icon("eye", 18)}</span><span>${S.fmt.escape(S.t("dl.safe3"))}</span></div>
      <hr class="ds-sep">
      <div class="dl-safe-row"><span class="ds-ico ds-slate">${S.ui.icon("globe2", 18)}</span><span>${S.fmt.escape(S.t("dl.safe4"))}</span></div>
    </div>`);
  el.innerHTML = (r.data.months ?? []).map((m) => `
    <div class="list-row">
      <span class="avatar">${S.ui.icon("doc", 14)}</span>
      <div class="grow"><b class="mono">${S.fmt.escape(m)}</b>
        <div class="muted small">${S.fmt.escape(S.t("dl.statementNote"))} · <span class="dl-status" data-m="${S.fmt.escape(m)}">${S.fmt.escape(S.t("dl.statusPending"))}</span></div></div>
      <button class="btn btn-sm btn-light gen" data-m="${S.fmt.escape(m)}">${S.fmt.escape(S.t("dl.gen"))}</button>
      <button class="btn btn-sm btn-primary dl hidden" data-m="${S.fmt.escape(m)}">${S.ui.icon("download", 12)} ${S.fmt.escape(S.t("dl.download"))}</button>
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
  /* 已生成月份：HEAD 探测 /api/reports/{m} 直接点亮下载态 */
  S.ui.$$(".dl-status").forEach(async (s) => {
    const probe = await fetch(`/api/reports/${s.dataset.m}`, { method: "HEAD", headers: S.api.token ? { authorization: `Bearer ${S.api.token}` } : {} }).catch(() => null);
    if (probe && probe.ok) {
      s.innerHTML = `<span class="badge badge-green">${S.ui.icon("check", 12)} ${S.fmt.escape(S.t("dl.statusReady"))}</span>`;
      document.querySelector(`.gen[data-m="${s.dataset.m}"]`)?.classList.add("hidden");
      document.querySelector(`.dl[data-m="${s.dataset.m}"]`)?.classList.remove("hidden");
    } else {
      s.innerHTML = `<span class="badge badge-gray">${S.fmt.escape(S.t("dl.statusPending"))}</span>`;
    }
  });
  S.ui.$$(".gen").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "…";
      const r2 = await S.api.post(`/api/reports/${b.dataset.m}`, {});
      b.disabled = false;
      b.textContent = S.t("dl.gen");
      if (r2.data?.ok) {
        b.classList.add("hidden");
        document.querySelector(`.dl[data-m="${b.dataset.m}"]`)?.classList.remove("hidden");
        const st = document.querySelector(`.dl-status[data-m="${b.dataset.m}"]`);
        if (st) st.innerHTML = `<span class="badge badge-green">${S.ui.icon("check", 12)} ${S.fmt.escape(S.t("dl.statusReady"))}</span>`;
        S.ui.toast(S.t("common.opOk"));
      } else S.ui.toast(r2.data?.error?.message ?? S.t("common.genFailed"), true);
    };
  });
  S.ui.$$(".dl").forEach((b) => {
    b.onclick = () => S.api.download(`/api/reports/${b.dataset.m}`, `suveoo-statement-${b.dataset.m}.pdf`);
  });
});
