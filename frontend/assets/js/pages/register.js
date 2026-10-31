/* register.js — P22 注册与开户（4 步向导 + 发卡） */
S.router.register("register", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="auth-wrap">
    <img class="logo" src="/assets/images/suveoo-logo-long.svg" alt="Suveoo">
    <div class="steps"><i class="on"></i><i></i><i></i><i></i></div>
    <div class="card" id="pane"></div>
    <p class="center small" style="margin-top:12px"><a href="/account/login">${S.fmt.escape(S.t("reg.haveAcct"))}</a></p>
  </div>`;
  const pane = document.getElementById("pane");
  const steps = document.querySelectorAll(".steps i");
  const setStep = (n) => steps.forEach((s, i) => s.classList.toggle("on", i < n));
  const state = { email: "", name: "", password: "", phone: "", phoneCode: "", answers: Array(8).fill(0) };
  const field = (lb, id, attrs = "", hint = "") => `<label class="field"><span class="lb">${S.fmt.escape(lb)}</span><input class="input" id="${id}" ${attrs}>${hint ? `<div class="field-hint">${S.fmt.escape(hint)}</div>` : ""}</label>`;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function step1() {
    setStep(1);
    pane.innerHTML = `<h2>${S.fmt.escape(S.t("reg.step1"))}</h2>
      ${field("Email", "r-email", 'type="email" autocomplete="email"')}
      <label class="field"><span class="lb">${S.fmt.escape(S.t("reg.code"))}</span>
        <div class="row"><input class="input mono" id="r-code" maxlength="6" inputmode="numeric"><button class="btn btn-light" id="r-send" style="flex:none;min-width:132px">${S.fmt.escape(S.t("reg.getCode"))}</button></div></label>
      ${field(S.t("reg.name"), "r-name", "", S.t("reg.nameHint"))}
      <!-- 第八十五轮：可选手机号绑定（开户第一步；跳过则开户后在安全中心/账户页绑定） -->
      <div class="field"><span class="lb">${S.fmt.escape(S.t("ph.number"))} <span class="muted small">${S.fmt.escape(S.t("ph.optional", "（可选）"))}</span></span>
        <div class="row" style="gap:8px">
          <span class="input ph-cc">+86</span>
          <input class="input grow" id="r-phone" inputmode="numeric" maxlength="13" placeholder="138 1234 5678">
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <input class="input grow mono" id="r-phone-code" inputmode="numeric" maxlength="6" placeholder="${S.fmt.escape(S.t('ph.codePh', '短信验证码（选填）'))}">
          <button type="button" class="btn btn-light" id="r-phone-send" style="flex:none">${S.fmt.escape(S.t("ph.send"))}</button>
        </div>
        <p class="muted small" style="margin:6px 0 0">${S.fmt.escape(S.t("ph.regHint", "建议绑定：短信接收验证码更快，还可用手机号登录与收款。暂时跳过可开户后在安全中心绑定。"))}</p>
      </div>
      <div class="grid grid-2">
        <div class="upload-box" id="r-pass1">${S.fmt.escape(S.t("reg.passport"))}<div class="small">${S.fmt.escape(S.t("reg.passportHint"))}</div></div>
        <div class="upload-box" id="r-pass2">${S.fmt.escape(S.t("reg.passportBack"))}<div class="small">${S.fmt.escape(S.t("reg.passportHint"))}</div></div>
      </div>
      <button class="btn btn-primary btn-block" id="r-go" style="margin-top:16px">${S.fmt.escape(S.t("common.next"))}</button>`;
    ["r-pass1", "r-pass2"].forEach((id) => {
      document.getElementById(id).onclick = () => { const el = document.getElementById(id); el.classList.add("done"); el.innerHTML = `${S.ui.icon("check", 14)} ${S.fmt.escape(S.t("reg.skipped"))}`; };
    });

    /* 获取验证码：三态反馈（idle → sending 旋转 → 60s 冷却倒计时），杜绝"以为没点到" */
    const sendBtn = document.getElementById("r-send");
    let cdTimer = null;
    const setSend = (mode, left = 0) => {
      clearInterval(cdTimer);
      sendBtn.classList.toggle("cooldown", mode === "cooldown");
      sendBtn.disabled = mode !== "idle";
      if (mode === "idle") { sendBtn.innerHTML = S.fmt.escape(S.t("reg.getCode")); return; }
      if (mode === "sending") { sendBtn.innerHTML = `<span class="spin"></span>${S.fmt.escape(S.t("reg.sending"))}`; return; }
      if (mode === "cooldown") {
        sendBtn.innerHTML = S.fmt.escape(S.t("reg.resendIn", left));
        cdTimer = setInterval(() => {
          left--;
          if (left <= 0) setSend("idle");
          else sendBtn.innerHTML = S.fmt.escape(S.t("reg.resendIn", left));
        }, 1000);
      }
    };
    sendBtn.onclick = async () => {
      const email = document.getElementById("r-email").value.trim();
      if (!EMAIL_RE.test(email)) { S.ui.toast(S.t("reg.emailBad"), true); document.getElementById("r-email").focus(); return; }
      setSend("sending"); // 点击立即视觉反馈（按压回弹由 .btn:active 承担），网络延迟期间不再可点
      const r = await S.api.post("/api/auth/email-code", { scene: "register", email });
      if (r.status === 409) { setSend("idle"); S.ui.toast(r.data?.error?.message ?? S.t("reg.alreadyExists"), true); return; }
      if (r.status === 429) { setSend("idle"); S.ui.toast(r.data?.error?.message ?? S.t("reg.sendFailed"), true); return; }
      if (!r.ok) { setSend("idle"); S.ui.toast(r.data?.error?.message ?? S.t("reg.sendFailed"), true); return; }
      setSend("cooldown", 60);
      sendBtn.classList.add("btn-flash-ok");
      setTimeout(() => sendBtn.classList.remove("btn-flash-ok"), 600);
      S.ui.toast(S.t("consent.codeSent"));
      document.getElementById("r-code").focus();
    };

    /* 第八十五轮：可选手机号——格式化+发码（60s 冷却）；提交时校验（填了号必须带码） */
    const rphInput = document.getElementById("r-phone"), rphSend = document.getElementById("r-phone-send");
    if (rphInput) {
      rphInput.addEventListener("input", (e) => {
        const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
        e.target.value = d.length > 7 ? d.slice(0, 3) + " " + d.slice(3, 7) + " " + d.slice(7) : d.length > 3 ? d.slice(0, 3) + " " + d.slice(3) : d;
      });
      rphSend.onclick = async () => {
        const num = S.phone.normCN(rphInput.value);
        if (!num) { S.ui.toast(S.t("ph.invalid"), true); return; }
        rphSend.disabled = true; let left = 60; const prev = rphSend.textContent;
        const cd = setInterval(() => { left--; if (left <= 0) { clearInterval(cd); rphSend.disabled = false; rphSend.textContent = prev; } else rphSend.textContent = left + "s"; }, 1000);
        const r = await S.api.post("/api/auth/email-code", { scene: "phonebind", channel: "phone", phone: num });
        if (!r.ok) { clearInterval(cd); rphSend.disabled = false; rphSend.textContent = prev; S.ui.toast(r.data?.error?.message ?? S.t("ph.sendFail"), true); return; }
        S.ui.toast(S.t("ph.sent"));
      };
    }
    document.getElementById("r-go").onclick = () => {
      state.email = document.getElementById("r-email").value.trim();
      state.code = document.getElementById("r-code").value.trim();
      /* 第七十九轮：姓名必填（此前空名静默兜底"Suveoo User"，开户后才发现名字不对） */
      state.name = document.getElementById("r-name").value.trim();
      if (!state.name) { S.ui.toast(S.t("reg.nameRequired"), true); document.getElementById("r-name").focus(); return; }
      if (!EMAIL_RE.test(state.email) || !/^\d{6}$/.test(state.code)) { S.ui.toast(S.t("reg.fillEmailCode"), true); return; }
      state.phone = S.phone.normCN(rphInput ? rphInput.value : "") ?? "";
      state.phoneCode = document.getElementById("r-phone-code") ? document.getElementById("r-phone-code").value.trim() : "";
      if (state.phone && !/^\d{6}$/.test(state.phoneCode)) { S.ui.toast(S.t("ph.codeHint"), true); return; }
      step2();
    };
  }

  /* 合规意愿：8 题专业风险测评（选项即分值 1..N，后端取均值折算 PR1-PR5） */
  const QUIZ = [
    { q: "reg.q1", opts: ["reg.q1o1", "reg.q1o2", "reg.q1o3", "reg.q1o4", "reg.q1o5"] },
    { q: "reg.q2", opts: ["reg.q2o1", "reg.q2o2", "reg.q2o3", "reg.q2o4", "reg.q2o5"] },
    { q: "reg.q3", opts: ["reg.q3o1", "reg.q3o2", "reg.q3o3", "reg.q3o4"] },
    { q: "reg.q4", opts: ["reg.q4o1", "reg.q4o2", "reg.q4o3", "reg.q4o4"] },
    { q: "reg.q5", opts: ["reg.q5o1", "reg.q5o2", "reg.q5o3", "reg.q5o4", "reg.q5o5"] },
    { q: "reg.q6", opts: ["reg.q6o1", "reg.q6o2", "reg.q6o3", "reg.q6o4"] },
    { q: "reg.q7", opts: ["reg.q7o1", "reg.q7o2", "reg.q7o3", "reg.q7o4"] },
    { q: "reg.q8", opts: ["reg.q8o1", "reg.q8o2", "reg.q8o3", "reg.q8o4"] },
  ];

  function step2() {
    setStep(2);
    const answered = state.answers.filter(Boolean).length;
    pane.innerHTML = `<h2>${S.fmt.escape(S.t("reg.step2"))}</h2>
      <h3>${S.fmt.escape(S.t("reg.quizTitle"))}</h3>
      <p class="muted small" style="margin-top:-6px">${S.fmt.escape(S.t("reg.quizHint"))}</p>
      <div id="quiz">${QUIZ.map((item, qi) => `
        <div class="field" style="margin-top:14px"><span class="lb">${qi + 1}. ${S.t(item.q)}</span>
          <div class="quiz-opts">${item.opts.map((k, oi) => `<button type="button" class="quiz-opt${state.answers[qi] === oi + 1 ? " on" : ""}" data-q="${qi}" data-v="${oi + 1}">${S.t(k)}</button>`).join("")}</div></div>`).join("")}</div>
      <label class="row" style="gap:8px;margin-top:16px;align-items:flex-start"><input type="checkbox" id="r-aml" style="margin-top:3px"><span class="small">${S.t("reg.amlBody")}</span></label>
      <button class="btn btn-primary btn-block" id="r-go" style="margin-top:16px">${S.fmt.escape(S.t("common.next"))}</button>`;
    /* 选项就地高亮（不整页重渲染，避免勾选状态丢失与滚动跳动） */
    S.ui.$$(".quiz-opt").forEach((b) => {
      b.onclick = () => {
        const qi = +b.dataset.q;
        state.answers[qi] = +b.dataset.v;
        S.ui.$$(`.quiz-opt[data-q="${qi}"]`).forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    document.getElementById("r-aml").checked = !!state.aml;
    document.getElementById("r-aml").onchange = (e) => (state.aml = e.target.checked);
    document.getElementById("r-go").onclick = () => {
      if (state.answers.some((v) => !v)) { S.ui.toast(S.t("reg.answerAll"), true); return; }
      if (!state.aml) { S.ui.toast(S.t("reg.aml"), true); return; }
      step3();
    };
  }

  function step3() {
    setStep(3);
    const pwInput = (id) => `<span class="pw-field"><input class="input" id="${id}" type="password" autocomplete="new-password">
        <button type="button" class="eye-toggle" data-eye="${id}" aria-label="${S.fmt.escape(S.t("common.showPass"))}" title="${S.fmt.escape(S.t("common.showPass"))}">${S.ui.icon("eye", 18)}</button></span>`;
    pane.innerHTML = `<h2>${S.fmt.escape(S.t("reg.step3"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("reg.newPass"))}</span>${pwInput("r-pw")}</label>
      <div class="progressbar"><i id="r-str" style="width:0"></i></div>
      <label class="field" style="margin-top:14px"><span class="lb">${S.fmt.escape(S.t("common.confirmPass"))}</span>${pwInput("r-pw2")}</label>
      <button class="btn btn-primary btn-block" id="r-go" style="margin-top:16px">${S.fmt.escape(S.t("common.submit"))}</button>`;
    S.ui.bindEyes(pane);
    document.getElementById("r-pw").oninput = (e) => {
      const v2 = e.target.value;
      document.getElementById("r-str").style.width = `${Math.min(100, v2.length * 6)}%`;
    };
    document.getElementById("r-go").onclick = () => {
      const pw = document.getElementById("r-pw").value;
      const pw2 = document.getElementById("r-pw2").value;
      if (!/^\S{8,32}$/.test(pw)) { S.ui.toast(S.t("reg.pwRule"), true); document.getElementById("r-pw").focus(); return; }
      if (pw !== pw2) { S.ui.toast(S.t("common.pwMismatch"), true); document.getElementById("r-pw2").focus(); return; }
      state.password = pw;
      step4();
    };
  }
  async function step4() {
    setStep(4);
    pane.innerHTML = `<div class="center" style="padding:32px 0">
      <img src="/assets/images/illustrations/security-shield.svg" width="120" alt="">
      <h2 style="margin-top:12px">${S.fmt.escape(S.t("reg.provisioning"))}</h2>
      <p class="muted small">${S.fmt.escape(S.t("reg.provisionNote"))}</p></div>`;
    const r = await S.api.post("/api/auth/register", {
      email: state.email, code: state.code, name: state.name, password: state.password,
        ...(state.phone ? { phone: state.phone, phone_code: state.phoneCode } : {}),
      risk_answers: state.answers, aml_consented: true,
    });
    if (!r.ok) {
      /* 失败不整页刷新（会丢失已填的身份/验证码/8 题测评/合规勾选）：回到密码步原样重试。
         P2-11 后：已注册邮箱不在发码阶段暴露（同形 200），而是在这里以 CODE_NOT_FOUND 呈现——
         只有邮箱主人能走到这一步，给出"去登录/找回"的明确出口。 */
      const errCode = r.data?.error?.code ?? "";
      const isDup = errCode === "CODE_NOT_FOUND";
      pane.innerHTML = `<h2>${S.fmt.escape(isDup ? "该邮箱可能已注册" : S.t("common.loadFailed"))}</h2>
        <p class="muted small">${S.fmt.escape(isDup ? "若该邮箱此前已注册，请直接登录或使用「忘记密码」重置；否则请重新获取验证码。" : (r.data?.error?.message ?? errCode))}</p>
        ${isDup ? `<a class="btn btn-ghost btn-block" href="/account/login" style="margin-bottom:8px">去登录</a><a class="btn btn-ghost btn-block" href="/account/recovery" style="margin-bottom:8px">忘记密码</a>` : ""}
        <button class="btn btn-primary btn-block" id="r-back">${S.fmt.escape(S.t("common.retry"))}</button>`;
      document.getElementById("r-back").onclick = () => step3();
      return;
    }
    S.api.token = r.data.token;
    S.ga4.event("sign_up", {});
    pane.innerHTML = `<div class="center"><img src="/assets/images/illustrations/security-shield.svg" width="90" alt="">
      <h2>${S.fmt.escape(S.t("reg.done"))}</h2><p class="muted small">${S.fmt.escape(r.data.notice ?? "")}</p></div>
      <div class="grid grid-2" style="margin:16px 0">
        ${r.data.cards.map((cd) => `<div class="reg-card">
          <div class="reg-card-img" style="background-image:url(${S.fmt.cardFront(cd)})" role="img" aria-label="${S.fmt.escape(cd.network)}"></div>
          <div class="reg-card-meta">
            <span class="small">${S.fmt.escape(cd.network)} · ${S.fmt.escape(cd.kind === "credit" ? S.t("reg.cardCredit") : S.t("reg.cardDebit"))}</span>
            <span class="small mono">**** ${S.fmt.escape(String(cd.number).slice(-4))} · ${cd.kind === "credit" ? "¥320,000" : "¥" + cd.balance}</span>
          </div>
        </div>`).join("")}
      </div>
      <button class="btn btn-primary btn-block" id="r-in">${S.fmt.escape(S.t("reg.enter"))}</button>`;
    document.getElementById("r-in").onclick = () => (location.href = "/home");
  }
  step1();
});
