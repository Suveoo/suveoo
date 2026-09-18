/* security.js — P29 安全中心（A1/A2：改密与关闭 2FA 须当前密码；改密成功就地换新纪元 token） */
S.router.register("security", async ({ user }) => {
  const c = document.getElementById("content");
  const sec = (await S.api.get("/api/security")).data ?? {};
  const pwInput = (id, ac = "new-password") => `<span class="pw-field"><input class="input" id="${id}" type="password" autocomplete="${ac}">
      <button type="button" class="eye-toggle" data-eye="${id}" aria-label="${S.fmt.escape(S.t("common.showPass"))}" title="${S.fmt.escape(S.t("common.showPass"))}">${S.ui.icon("eye", 18)}</button></span>`;
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
        <a class="btn btn-sm btn-ghost" id="retest" href="/account/risk-assessment">${S.fmt.escape(S.t("sec.retest"))}</a></div>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("sec.audit"))}</h2></div>
    <div class="card" id="audit">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("circuit.title"))}</h2></div>
    <div class="card" id="cb-card">${S.ui.skeleton(2)}</div>`;
  document.getElementById("chg").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("sec.changePass"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.curPass"))}</span>${pwInput("cp-cur", "current-password")}</label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("consent.otp"))}</span>
        <div class="gc-otp"><input class="input mono" id="cp-otp" maxlength="6"><button class="btn btn-light" id="cp-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.newPass"))}（8-32）</span>${pwInput("cp-pw")}</label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.confirmPass"))}</span>${pwInput("cp-pw2")}</label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.save"))}</button></div>`);
    S.ui.bindEyes(m.el);
    m.el.querySelector("#cx").onclick = m.close;
    m.el.querySelector("#cp-send").onclick = async () => {
      const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email: user?.email?.includes("*") ? undefined : user?.email });
      S.ui.toast(r.status === 429 ? S.t("consent.tooFast") : S.t("consent.codeSent"), r.status === 429);
    };
    m.el.querySelector("#ok").onclick = async () => {
      const cur = m.el.querySelector("#cp-cur").value;
      const pw = m.el.querySelector("#cp-pw").value;
      const pw2 = m.el.querySelector("#cp-pw2").value;
      /* 本地校验顺序：新密码格式 → 两次一致 → 提交（当前密码正确性由服务端裁决） */
      if (!/^\S{8,32}$/.test(pw)) { S.ui.toast(S.t("reg.pwRule"), true); return; }
      if (pw !== pw2) { S.ui.toast(S.t("common.pwMismatch"), true); m.el.querySelector("#cp-pw2").focus(); return; }
      if (!cur) { S.ui.toast(S.t("sec.curPassBad"), true); m.el.querySelector("#cp-cur").focus(); return; }
      const r2 = await S.api.patch("/api/security/password", { otp: m.el.querySelector("#cp-otp").value.trim(), current_password: cur, new_password: pw });
      if (r2.ok) {
        /* 改密成功：其他设备全部下线，本设备就地换新纪元 token（不掉线） */
        if (r2.data?.token) S.api.token = r2.data.token;
        m.close();
        S.ui.toast(S.t("common.opOk"));
      } else {
        const code = r2.data?.error?.code;
        S.ui.toast(code === "WRONG_OLD_PASSWORD" ? S.t("sec.curPassBad") : r2.data?.error?.message ?? r2.data?.error?.code ?? "failed", true);
      }
    };
  };
  /* 关闭 2FA 的小弹窗：服务端返回 PASSWORD_REQUIRED 时收集当前密码后重试（与改密弹窗同款密码框） */
  const curPassModal = () => new Promise((resolve) => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("sec.curPass"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.curPass"))}</span>${pwInput("tfa-cur", "current-password")}</label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cc-x">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="cc-ok">${S.fmt.escape(S.t("common.confirm"))}</button></div>`);
    S.ui.bindEyes(m.el);
    m.el.querySelector("#cc-x").onclick = () => { m.close(); resolve(null); };
    m.el.querySelector("#cc-ok").onclick = () => { const v = m.el.querySelector("#tfa-cur").value; m.close(); resolve(v || null); };
  });
  document.getElementById("tfa").onchange = async (e) => {
    const enabling = e.target.checked;
    const revert = () => { e.target.checked = !enabling; };
    const otp = await S.ctl.otp({
      email: user?.email,
      send: async () => (await S.api.post("/api/auth/email-code", { scene: "redstep" })).ok,
    });
    if (!otp) { revert(); return; }
    let body = { enabled: enabling, otp };
    if (!enabling) {
      /* 关闭是降安全操作：先按 OTP 提交，服务端要求当前密码（PASSWORD_REQUIRED）时补收重试 */
      const probe = await S.api.post("/api/security/2fa", body);
      if (probe.ok) { S.ui.toast(S.t("common.opOk")); return; }
      const code = probe.data?.error?.code;
      if (code !== "PASSWORD_REQUIRED") { revert(); S.ui.toast(r2msg(probe), true); return; }
      const pw = await curPassModal();
      if (!pw) { revert(); return; }
      body.current_password = pw;
    }
    const r = await S.api.post("/api/security/2fa", body);
    if (r.ok) S.ui.toast(S.t("common.opOk"));
    else { revert(); S.ui.toast(r2msg(r), true); }
  };
  const r2msg = (r) => {
    const code = r?.data?.error?.code;
    if (code === "WRONG_OLD_PASSWORD") return S.t("sec.curPassBad");
    return r?.data?.error?.message ?? r?.data?.error?.code ?? "failed";
  };
  const a = await S.api.get("/api/audit/me");
  document.getElementById("audit").innerHTML = (a.data?.audit ?? []).map((x) => `
    <div class="list-row"><span class="avatar mono small">${S.ui.icon("doc", 12)}</span>
      <div class="grow"><b>${S.fmt.escape(x.action)}</b>
        <div class="muted small mono">${S.fmt.datetime(x.ts)} · ${S.fmt.escape(x.channel ?? "")} ${x.trace_id ? "· " + S.fmt.escape(String(x.trace_id).slice(0, 14)) + "…" : ""}</div></div>
      <span class="badge badge-green">${S.ui.icon("check", 12)}</span></div>`).join("") || S.ui.empty(S.t("common.noData"));

  /* 异常熔断卡：状态实时显示（正常绿 / 锁定红+剩余分钟+计数）+ 邮箱 OTP 提前解锁流 */
  {
    const card = document.getElementById("cb-card");
    const load = async () => {
      const r = await S.api.get("/api/security/circuit");
      const d = r.data;
      if (!d) { card.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
      const zh = { otp: S.t("circuit.kOtp"), inj: S.t("circuit.kInj"), grant: S.t("circuit.kGrant") };
      const counters = Object.entries(d.counters ?? {}).map(([k, v]) => `${zh[k] ?? k} ${v}/${d.thresholds?.[k] ?? "?"}`).join(" · ");
      if (!d.locked) {
        card.innerHTML = `
          <div class="list-row"><span class="avatar">${S.ui.icon("shield", 14)}</span>
            <div class="grow"><b>${S.fmt.escape(S.t("circuit.normal"))}</b><div class="muted small">${S.fmt.escape(S.t("circuit.normalNote"))}</div></div>
            ${S.ui.badge(S.t("circuit.statusOk"), "badge-green")}</div>
          <p class="muted small" style="margin:8px 0 0">${S.fmt.escape(S.t("circuit.counters"))}：${S.fmt.escape(counters || "—")}</p>`;
        return;
      }
      card.innerHTML = `
        <div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("lock", 14)}<div><b>${S.fmt.escape(S.t("circuit.locked", d.minutesLeft))}</b><div class="small" style="margin-top:4px">${S.fmt.escape(S.t("circuit.lockedNote"))}</div></div></div>
        <p class="muted small" style="margin:8px 0">${S.fmt.escape(S.t("circuit.counters"))}：${S.fmt.escape(counters || "—")}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <input class="input mono" id="cb-code" maxlength="6" inputmode="numeric" placeholder="${S.fmt.escape(S.t("consent.otp"))}" style="max-width:160px">
          <button class="btn btn-light" id="cb-send">${S.fmt.escape(S.t("consent.getCode"))}</button>
          <button class="btn btn-primary" id="cb-unlock">${S.ui.icon("unlock", 14)} ${S.fmt.escape(S.t("circuit.unlock"))}</button>
        </div>`;
      document.getElementById("cb-send").onclick = async () => {
        const r2 = await S.api.post("/api/security/circuit", { action: "send" });
        S.ui.toast(r2.ok ? S.t("circuit.codeSent") : r2msg(r2), !r2.ok);
      };
      document.getElementById("cb-unlock").onclick = async () => {
        const code = document.getElementById("cb-code").value.trim();
        if (!/^\d{6}$/.test(code)) { S.ui.toast(S.t("circuit.codeBad"), true); return; }
        const r3 = await S.api.post("/api/security/circuit", { code });
        if (r3.ok) { S.ui.toast(S.t("circuit.unlocked")); load(); }
        else S.ui.toast(r2msg(r3), true);
      };
    };
    load();
  }
});
