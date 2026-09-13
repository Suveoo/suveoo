/* deposits.js — P17 全部存款方案 */
S.router.register("deposits", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("deps.title"))}</h1>${S.sim.banner()}<div class="grid grid-2" id="grid">${S.ui.skeleton(4)}</div>`;
  const deps = (await Promise.all(["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)))).filter(Boolean);
  if (!deps.length) { document.getElementById("grid").innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  document.getElementById("grid").innerHTML = deps.map((d) => `
    <div class="card">
      <div class="row between"><b>${S.fmt.escape(d.name)}</b><span class="fret">${d.rate}%</span></div>
      <div class="muted small" style="margin:6px 0">${S.fmt.escape(S.t("deps.term"))}：${S.fmt.escape(d.term)} · ${S.fmt.escape(S.t("deps.minFrom", d.min))}</div>
      <div class="muted small">${S.fmt.escape(d.rules)}</div>
      <a class="btn btn-sm btn-light" style="margin-top:10px" href="/wealth/deposits/${d.slug}">${S.fmt.escape(S.t("deps.detail"))}</a>
    </div>`).join("");
});
