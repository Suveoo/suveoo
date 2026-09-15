/* card-settings.js — P26 单卡设置（Debit/Credit 差异化） */
S.router.register("card-settings", async () => {
  const c = document.getElementById("content");
  const slug = (location.pathname.match(/\/account\/card\/([a-z0-9-]+)/) ?? [])[1];
  c.innerHTML = `<h1>${S.fmt.escape(S.t("card.settings"))}</h1>${S.sim.banner()}<div class="card" id="pane">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get(`/api/cards/${slug}`);
  const pane = document.getElementById("pane");
  if (!r.ok) { pane.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const cd = r.data.card;
  const isCredit = cd.kind === "credit";
  pane.innerHTML = `
    <div class="bc-main" style="margin-bottom:16px"><img class="bc-art" src="/${cd.art}" alt="">
      <div><b class="mono">${S.fmt.escape(cd.number)}</b><div class="muted small">${S.fmt.escape(cd.network)} · ${S.fmt.escape(cd.alias ?? slug)}</div></div></div>
    <label class="field"><span class="lb">${S.fmt.escape(S.t("card.alias"))}</span>
      <div class="row"><input class="input" id="cs-alias" value="${S.fmt.escape(cd.alias ?? "")}"><button class="btn btn-light" id="cs-alias-go" style="flex:none">${S.fmt.escape(S.t("common.save"))}</button></div></label>
    ${cd.is_default ? S.ui.badge(S.t("cards.default"), "badge-navy") : `<button class="btn btn-ghost btn-sm" id="cs-default">${S.fmt.escape(S.t("card.setDefault"))}</button>`}
    ${isCredit ? `
      <div class="section-title" style="margin-top:8px"><h3>${S.fmt.escape(S.t("card.repayInfo"))}</h3></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cs.repayCycle"))}</span><span class="v mono">${S.fmt.escape(S.t("cs.repayCycleVal"))}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("cards.creditLimit"))}</span><span class="v mono">¥ ${cd.limit}</span></div>
      <h3 style="margin-top:16px">${S.fmt.escape(S.t("card.geo"))}</h3>
      <p class="muted small">${S.fmt.escape(S.t("cs.geoNote"))}</p>
      <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" id="cs-geo"><span class="tk"></span></span><span class="small">${S.fmt.escape(S.t("cs.geoLabel"))}</span></label>` : `
      <div class="section-title" style="margin-top:8px"><h3>${S.fmt.escape(S.t("limits.title"))}</h3></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("limits.single"))}</span><span class="v mono">¥ ${cd.limit_single}</span></div>
      <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("limits.daily"))}</span><span class="v mono">¥ ${cd.limit_daily}</span></div>
      <a class="btn btn-ghost btn-sm" style="margin-top:8px" href="/transfer/limits">${S.fmt.escape(S.t("limits.adjust"))}</a>`}
    <div class="row" style="margin-top:20px">
      <button class="btn btn-danger" id="cs-fz">${S.ui.icon("snow", 14)} ${S.fmt.escape(cd.status === "FROZEN" ? S.t("cards.unfreeze") : S.t("cards.freeze"))}（RED）</button>
    </div>`;
  document.getElementById("cs-alias-go").onclick = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}`, { alias: document.getElementById("cs-alias").value.trim() || undefined });
    if (!r2.cancelled) S.ui.toast(r2.data?.status === "EXECUTED" ? S.t("common.opOk") : r2.data?.reason ?? "failed", r2.data?.status !== "EXECUTED");
  };
  const def = document.getElementById("cs-default");
  if (def) def.onclick = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}`, { is_default: 1 });
    if (!r2.cancelled && r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 700); }
  };
  const geo = document.getElementById("cs-geo");
  if (geo) geo.onchange = async () => {
    const r2 = await S.api.mutate(`/api/cards/${slug}/limits`, { limit_single: "3500.00", limit_daily: "3500.00" });
    if (r2.cancelled) { geo.checked = !geo.checked; return; }
    S.ui.toast(r2.data?.status === "EXECUTED" ? S.t("cs.geoOn") : r2.data?.reason ?? "failed", r2.data?.status !== "EXECUTED");
    if (r2.data?.status !== "EXECUTED") geo.checked = !geo.checked;
  };
  document.getElementById("cs-fz").onclick = async () => {
    const intent = cd.status === "FROZEN" ? "unfreeze" : "freeze";
    const otp = await S.ctl.otp({
      email: (await S.auth.session())?.email,
      send: async () => (await S.api.post("/api/auth/email-code", { scene: "redstep" })).ok,
    });
    if (!otp) return;
    const r2 = await S.api.post(`/api/cards/${slug}/${intent}`, { otp });
    if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
    else S.ui.toast(r2.data?.reason ?? "failed", true);
  };
});
