/* security.js — P29 安全中心 */
S.router.register("security", async ({ user }) => {
  const c = document.getElementById("content");
  const sec = (await S.api.get("/api/security")).data ?? {};
  c.innerHTML = `<h1>${S.fmt.escape(S.t("sec.title"))}</h1>${S.sim.banner()}
    <div class="card">
      <div class="list-row"><span class="avatar">${S.ui.icon("lock", 14)}</span>
        <div class="grow"><b>${S.fmt.escape(S.t("sec.password"))}</b><div class="muted small">${S.fmt.escape(S.t("sec.oldNotNeeded"))}</div></div>
        <button class="btn btn-sm btn-light" id="chg">${S.fmt.escape(S.t("sec.changePass"))}</button></div>
      <div class="list-row"><span class="avatar">${S.ui.icon("shield", 14)}</span>
        <div class="grow"><b>${S.fmt.escape(S.t("sec.2fa"))}</b><div class="muted small">${S.fmt.escape(S.t("sec.passkeyNote"))}</div></div>
        <label class="switch"><input type="checkbox" id="tfa" ${sec.twofa_enabled ? "checked" : ""}><span class="tk"></span></label></div>
      <div class="list-row"><span class="avatar">${S.ui.icon("chart", 14)}</span>
        <div class="grow"><b>${S.fmt.escape(S.t("sec.pr"))}</b><div class="muted small">${S.fmt.escape(S.t("wealth.prLevel"))}：PR${user?.pr_level ?? 3}（${S.fmt.escape(S.t("wealth.riskMatch"))}）</div></div>
        <button class="btn btn-sm btn-ghost" id="retest">${S.fmt.escape(S.t("sec.retest"))}</button></div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("sec.audit"))}</h2></div>
    <div class="card" id="audit">${S.ui.skeleton(4)}</div>`;
  document.getElementById("retest").onclick = () => S.router.ai(S.t("prompt.retest"));
  document.getElementById("chg").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("sec.changePass"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("consent.otp"))}</span>
        <div class="gc-otp"><input class="input mono" id="cp-otp" maxlength="6"><button class="btn btn-light" id="cp-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.newPass"))}（8-32）</span><input class="input" type="password" id="cp-pw"></label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.save"))}</button></div>`);
    m.el.querySelector("#cx").onclick = m.close;
    m.el.querySelector("#cp-send").onclick = async () => {
      const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email: user?.email?.includes("*") ? undefined : user?.email });
      S.ui.toast(r.status === 429 ? S.t("consent.tooFast") : S.t("consent.codeSent"), r.status === 429);
    };
    m.el.querySelector("#ok").onclick = async () => {
      const r2 = await S.api.patch("/api/security/password", { otp: m.el.querySelector("#cp-otp").value.trim(), new_password: m.el.querySelector("#cp-pw").value });
      if (r2.ok) { m.close(); S.ui.toast(S.t("common.opOk")); }
      else S.ui.toast(r2.data?.error?.message ?? r2.data?.error?.code ?? "failed", true);
    };
  };
  document.getElementById("tfa").onchange = async (e) => {
    const otp = await S.ctl.otp({
      email: user?.email,
      send: async () => (await S.api.post("/api/auth/email-code", { scene: "redstep" })).ok,
    });
    if (!otp) { e.target.checked = !e.target.checked; return; }
    const r = await S.api.post("/api/security/2fa", { enabled: e.target.checked, otp });
    if (r.ok) S.ui.toast(S.t("common.opOk"));
    else { e.target.checked = !e.target.checked; S.ui.toast(r2msg(r), true); }
  };
  const r2msg = (r) => r.data?.error?.message ?? r.data?.error?.code ?? "failed";
  const a = await S.api.get("/api/audit/me");
  document.getElementById("audit").innerHTML = (a.data?.audit ?? []).map((x) => `
    <div class="list-row"><span class="avatar mono small">${S.ui.icon("doc", 12)}</span>
      <div class="grow"><b>${S.fmt.escape(x.action)}</b>
        <div class="muted small mono">${S.fmt.datetime(x.ts)} · ${S.fmt.escape(x.channel ?? "")} ${x.trace_id ? "· " + S.fmt.escape(String(x.trace_id).slice(0, 14)) + "…" : ""}</div></div>
      <span class="badge badge-green">${S.ui.icon("check", 12)}</span></div>`).join("") || S.ui.empty(S.t("common.noData"));
});
