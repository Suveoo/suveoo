/* downloads.js — P28 月度报告（pdf-lib 服务端生成；含数据口径说明与状态徽章） */
S.router.register("downloads", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("dl.title"))}</h1>${S.sim.banner()}
    <div class="banner">${S.ui.icon("doc", 16)}<div>${S.fmt.escape(S.t("dl.hint"))}</div></div>
    <div class="card" style="margin-top:12px">
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("dl.dataNoteLb"))}</span><span class="v small">${S.fmt.escape(S.t("dl.dataNote"))}</span></div>
    </div>
    <div class="card" style="margin-top:12px">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/reports");
  const el = c.querySelectorAll(".card")[1];
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
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
