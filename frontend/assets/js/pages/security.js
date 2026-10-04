/* security.js — P29 安全中心（A1/A2：改密与关闭 2FA 须当前密码；改密成功就地换新纪元 token） */
S.router.register("security", async ({ user }) => {
  const c = document.getElementById("content");
  const sec = (await S.api.get("/api/security")).data ?? {};
  const pwInput = (id, ac = "new-password") => `<span class="pw-field"><input class="input" id="${id}" type="password" autocomplete="${ac}">
      <button type="button" class="eye-toggle" data-eye="${id}" aria-label="${S.fmt.escape(S.t("common.showPass"))}" title="${S.fmt.escape(S.t("common.showPass"))}">${S.ui.icon("eye", 18)}</button></span>`;
  c.innerHTML = `<h1>${S.fmt.escape(S.t("sec.title"))}</h1>
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
    <div class="section-title"><h2>${S.fmt.escape(S.t("sec.phoneTitle", "手机号管理"))}</h2></div>
    <div class="card" id="ph-sec-card">${S.ui.skeleton(2)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("sec.audit"))}</h2></div>
    <div class="card" id="audit">${S.ui.skeleton(4)}</div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("circuit.title"))}</h2></div>
    <div class="card" id="cb-card">${S.ui.skeleton(2)}</div>`;
  /* ===== 第八十五轮：手机号管理（绑定/换绑/解绑/默认接码通道） ===== */
  (async () => {
    const box = document.getElementById("ph-sec-card");
    if (!box) return;
    const r = await S.api.get("/api/security");
    const d = r.data ?? {};
    const masked = d.phone_masked || "";
    const render = () => {
      box.innerHTML = `
        <div class="row between" style="gap:12px;flex-wrap:wrap">
          <div class="grow"><b>${S.fmt.escape(S.t("sec.phoneCur", "当前绑定"))}</b>
            <div class="muted small">${masked ? S.fmt.escape(masked) : S.fmt.escape(S.t("ph.unbound", "未绑定"))}</div></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-light" id="ph-bind">${S.fmt.escape(masked ? S.t("sec.phoneChange", "更换绑定") : S.t("ph.bindNow", "立即绑定"))}</button>
            ${masked ? `<button class="btn btn-sm btn-light" id="ph-unbind">${S.fmt.escape(S.t("sec.phoneUnbind", "解除绑定"))}</button>` : ""}
          </div>
        </div>
        ${masked ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--color-line)">
          <b class="small">${S.fmt.escape(S.t("sec.otpChannel", "默认接收验证码方式"))}</b>
          <div class="row" style="gap:14px;margin-top:6px">
            <label class="row small" style="gap:6px;cursor:pointer"><input type="radio" name="otpch" value="phone" ${d.otp_channel === "phone" ? "checked" : ""}>${S.fmt.escape(S.t("ph.sms", "短信") + " " + masked)}</label>
            <label class="row small" style="gap:6px;cursor:pointer"><input type="radio" name="otpch" value="email" ${d.otp_channel === "email" ? "checked" : ""}>${S.fmt.escape(S.t("ph.emailCh", "邮箱"))}</label>
          </div>
          <p class="muted small" style="margin:6px 0 0">${S.fmt.escape(S.t("sec.otpChannelNote", "红级操作、两步验证、找回密码与解冻默认经此通道接收验证码（操作时仍可单次切换）。"))}</p>
        </div>` : ""}`;
      box.querySelector("#ph-bind").onclick = () => S.phone.bindModal({ onDone: () => setTimeout(() => location.reload(), 600) });
      const ub = box.querySelector("#ph-unbind");
      if (ub) ub.onclick = () => {
        const m2 = S.ui.modal(`<h3 style="font-size:16px">${S.fmt.escape(S.t("sec.phoneUnbind", "解除绑定"))}</h3>
          <p class="muted small" style="line-height:1.6">${S.fmt.escape(S.t("sec.unbindWhy", "为保护账户安全，解绑需验证邮箱验证码。解绑后该手机号将被释放，可绑定其他账户；验证码将改由邮箱接收。"))}</p>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("ph.code"))}</span>
            <div class="row" style="gap:8px"><input class="input grow mono" id="ub-code" inputmode="numeric" maxlength="6" placeholder="······">
            <button type="button" class="btn btn-light" id="ub-send" style="flex:none">${S.fmt.escape(S.t("ph.send"))}</button></div></label>
          <div class="modal-actions"><button class="btn" id="ub-no">${S.fmt.escape(S.t("common.cancel"))}</button>
          <button class="btn btn-primary" id="ub-ok">${S.fmt.escape(S.t("sec.phoneUnbind", "解除绑定"))}</button></div>`);
        m2.el.querySelector("#ub-no").onclick = () => m2.close();
        m2.el.querySelector("#ub-send").onclick = async () => {
          const b = m2.el.querySelector("#ub-send"); b.disabled = true;
          const rr = await S.api.post("/api/auth/email-code", { scene: "phoneunbind" });
          if (!rr.ok) { b.disabled = false; S.ui.toast(rr.data?.error?.message ?? S.t("ph.sendFail"), true); return; }
          S.ui.toast(S.t("ph.sent") + " " + (rr.data?.masked ?? ""));
        };
        m2.el.querySelector("#ub-ok").onclick = async () => {
          const rr = await S.api.post("/api/account/phone", { action: "unbind", code: m2.el.querySelector("#ub-code").value.trim() });
          if (!rr.ok) { S.ui.toast(rr.data?.error?.message ?? S.t("common.opFail"), true); return; }
          m2.close(); S.ui.toast(S.t("sec.unbound", "已解除绑定")); setTimeout(() => location.reload(), 600);
        };
      };
      box.querySelectorAll('input[name="otpch"]').forEach((radio) => {
        radio.onchange = async () => {
          const rr = await S.api.post("/api/account/phone", { action: "set_channel", channel: radio.value });
          if (!rr.ok) { S.ui.toast(rr.data?.error?.message ?? S.t("common.opFail"), true); location.reload(); return; }
          S.ui.toast(S.t("common.opOk"));
        };
      });
    };
    render();
  })();

  document.getElementById("chg").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("sec.changePass"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.curPass"))}</span>${pwInput("cp-cur", "current-password")}</label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("consent.otp"))} <span class="muted small ck-chan" id="cp-chan"></span></span>
        <div class="gc-otp"><input class="input mono" id="cp-otp" maxlength="6"><button class="btn btn-light" id="cp-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button></div></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("sec.newPass"))}（8-32）</span>${pwInput("cp-pw")}</label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.confirmPass"))}</span>${pwInput("cp-pw2")}</label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.save"))}</button></div>`);
    S.ui.bindEyes(m.el);
    m.el.querySelector("#cx").onclick = m.close;
    /* 打开即显示默认接码通道接收方（绑手机号=短信掩码），与发送后一致；
     * 第九十八轮：双通道齐全直接预挂 pending 切换条（队长令：打开即可见切换按钮） */
    { const dsc = S.phone?.otpDescFromSession?.(user);
      if (dsc) { cpSw = S.phone.otpSwitcher(dsc, "redstep", {}, { pending: true }); if (cpSw) m.el.querySelector("#cp-otp").closest(".gc-otp").after(cpSw); }
      else if (user?.otp_channel === "phone" && user?.phone) m.el.querySelector("#cp-chan").textContent = user.phone; }
    m.el.querySelector("#cp-send").onclick = async () => {
      const btn = m.el.querySelector("#cp-send");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = S.t("ctl.sending"); /* 发送中动态反馈（第九十八轮） */
      const r = await S.api.post("/api/auth/email-code", { scene: "redstep" });
      if (!r.ok) { btn.disabled = false; btn.textContent = prev; S.ui.toast(r.data?.error?.message ?? S.t("consent.tooFast"), true); return; }
      /* 响应带实际通道/掩码/alt——按绑定默认通道发码（绑手机号=短信），以实际响应重建切换条 */
      if (r.data?.masked) {
        const chan = m.el.querySelector("#cp-chan");
        if (chan) chan.textContent = r.data.masked;
        if (cpSw) cpSw.remove();
        cpSw = S.phone.otpSwitcher(r.data, "redstep", {}) ?? null;
        if (cpSw) m.el.querySelector("#cp-otp").closest(".gc-otp").after(cpSw);
      }
      S.ui.toast(S.t("consent.codeSent"));
      let cd = 60;
      const tick = setInterval(() => {
        cd--;
        if (cd <= 0) { clearInterval(tick); btn.disabled = false; btn.textContent = prev; return; }
        btn.textContent = S.t("consent.resendIn", cd);
      }, 1000);
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
      /* 第九十五轮：send 返回完整响应——S.ctl.otp 据此显示实际通道并挂切换条 */
      send: async () => await S.api.post("/api/auth/email-code", { scene: "redstep" }),
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
    return r?.data?.error?.message ?? r?.data?.error?.code ?? S.t("common.opFailed");
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
        <div id="cb-sw"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <input class="input mono" id="cb-code" maxlength="6" inputmode="numeric" placeholder="${S.fmt.escape(S.t("consent.otp"))}" style="max-width:160px">
          <button class="btn btn-light" id="cb-send">${S.fmt.escape(S.t("consent.getCode"))}</button>
          <button class="btn btn-primary" id="cb-unlock">${S.ui.icon("unlock", 14)} ${S.fmt.escape(S.t("circuit.unlock"))}</button>
        </div>`;
      /* 第九十八轮：锁定态即预挂 pending 切换条（安全中心页首屏 /api/security 已有 phone_masked/otp_channel；
       * 队长令：打开即可见切换按钮，不必先点一次获取验证码） */
      { const dsc = S.phone?.otpDescFromSession?.({ phone: sec.phone_masked || null, email: user?.email, otp_channel: sec.otp_channel });
        if (dsc) { const sw0 = S.phone.otpSwitcher(dsc, "cbunlock", {}, { pending: true }); if (sw0) document.getElementById("cb-sw").appendChild(sw0); } }
      document.getElementById("cb-send").onclick = async () => {
        /* 第九十五轮：统一走 email-code（cbunlock 场景）——服务端按绑定默认通道分流（绑手机号=短信），
         * 响应带 channel/masked/alt，挂切换条（与改密/风险测评同体验）；解锁校验双通道均算数不变 */
        const sb = document.getElementById("cb-send");
        const prev = sb.textContent;
        sb.disabled = true; sb.textContent = S.t("ctl.sending");
        const r2 = await S.api.post("/api/auth/email-code", { scene: "cbunlock" });
        if (!r2.ok) { sb.disabled = false; sb.textContent = prev; S.ui.toast(r2.data?.error?.message ?? r2msg(r2), true); return; }
        const holder = document.getElementById("cb-sw");
        holder.replaceChildren();
        const sw = S.phone.otpSwitcher(r2.data, "cbunlock", {});
        if (sw) holder.appendChild(sw);
        S.ui.toast(S.t("circuit.codeSent"));
        let cd2 = 60;
        const tk = setInterval(() => {
          cd2--;
          if (cd2 <= 0) { clearInterval(tk); sb.disabled = false; sb.textContent = prev; return; }
          sb.textContent = S.t("consent.resendIn", cd2);
        }, 1000);
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
