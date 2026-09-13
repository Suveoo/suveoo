/* downloads.js — P28 月度报告（pdf-lib 服务端生成） */
S.router.register("downloads", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("dl.title"))}</h1>${S.sim.banner()}
    <div class="banner">${S.ui.icon("doc", 16)}<div>${S.fmt.escape(S.t("dl.hint"))}</div></div>
    <div class="card">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/reports");
  const el = c.querySelector(".card");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  el.innerHTML = (r.data.months ?? []).map((m) => `
    <div class="list-row">
      <span class="avatar">${S.ui.icon("doc", 14)}</span>
      <div class="grow"><b class="mono">${S.fmt.escape(m)}</b><div class="muted small">${S.fmt.escape(S.t("dl.statementNote"))}</div></div>
      <button class="btn btn-sm btn-light gen" data-m="${m}">${S.fmt.escape(S.t("dl.gen"))}</button>
      <button class="btn btn-sm btn-primary dl hidden" data-m="${m}">${S.ui.icon("download", 12)} ${S.fmt.escape(S.t("dl.download"))}</button>
    </div>`).join("") || S.ui.empty(S.t("common.noData"));
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
        S.ui.toast(S.t("common.opOk"));
      } else S.ui.toast(r2.data?.error?.message ?? S.t("common.genFailed"), true);
    };
  });
  S.ui.$$(".dl").forEach((b) => {
    b.onclick = () => S.api.download(`/api/reports/${b.dataset.m}`, `suveoo-statement-${b.dataset.m}.pdf`);
  });
});
