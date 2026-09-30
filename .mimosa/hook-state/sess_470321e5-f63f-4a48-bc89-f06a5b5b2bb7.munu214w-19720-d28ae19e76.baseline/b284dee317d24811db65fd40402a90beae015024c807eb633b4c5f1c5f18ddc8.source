/* risk-assessment.js — 风险承受能力重评估（独立页；8 题表单 + RED 级 OTP 强验证；三语题库复用 docs-help 前身 reg.q* 键） */
S.router.register("risk-assessment", async ({ user }) => {
  if (!user) { location.replace("/account/login?next=%2Faccount%2Frisk-assessment"); return; }
  const c = document.getElementById("content");
  const cur = user?.pr_level ?? 3;

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
  const answers = Array(QUIZ.length).fill(0);

  c.innerHTML = `<div class="auth-wrap" style="max-width:640px">
    <h1>${S.fmt.escape(S.t("sec.retestTitle"))}</h1>
    <p class="muted small">${S.fmt.escape(S.t("sec.retestNote", cur))}</p>
    <div class="card" style="margin-top:16px">
      <h3>${S.fmt.escape(S.t("reg.quizTitle"))}</h3>
      <p class="muted small" style="margin-top:-6px">${S.fmt.escape(S.t("reg.quizHint"))}</p>
      <div id="quiz">${QUIZ.map((item, qi) => `
        <div class="field" style="margin-top:14px"><span class="lb">${qi + 1}. ${S.t(item.q)}</span>
          <div class="quiz-opts">${item.opts.map((k, oi) => `<button type="button" class="quiz-opt" data-q="${qi}" data-v="${oi + 1}">${S.t(k)}</button>`).join("")}</div></div>`).join("")}</div>
      <button class="btn btn-primary btn-block" id="ra-send" style="margin-top:16px">${S.ui.icon("shield", 16)} ${S.fmt.escape(S.t("sec.retestSubmit"))}</button>
      <div class="gc-otp" id="ra-otp-row" style="display:none;margin-top:14px">
        <input class="input mono" id="ra-otp" maxlength="6" inputmode="numeric" placeholder="${S.fmt.escape(S.t("login.otpPh"))}">
        <button class="btn btn-light" id="ra-code" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button>
      </div>
      <p class="footnote-sim" style="margin-top:12px">${S.fmt.escape(S.t("consent.notice"))}</p>
    </div></div>`;

  S.ui.$$(".quiz-opt").forEach((b) => {
    b.onclick = () => {
      answers[+b.dataset.q] = +b.dataset.v;
      S.ui.$$(`.quiz-opt[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle("on", x === b));
    };
  });

  /* 提交：先取 OTP（RED 级强验证），展开验证码行；再带码提交 */
  const sendBtn = document.getElementById("ra-send");
  const otpRow = document.getElementById("ra-otp-row");
  const email = (await S.auth.session())?.email;
  sendBtn.onclick = async () => {
    if (answers.some((v) => !v)) { S.ui.toast(S.t("reg.answerAll"), true); return; }
    if (otpRow.style.display === "none") {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="spin"></span>${S.fmt.escape(S.t("reg.sending"))}`;
      const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email });
      sendBtn.disabled = false;
      if (!r.ok) { S.ui.toast(r.data?.error?.message ?? S.t("reg.sendFailed"), true); return; }
      sendBtn.innerHTML = S.fmt.escape(S.t("sec.retestSubmit"));
      otpRow.style.display = "flex";
      document.getElementById("ra-otp").focus();
      S.ui.toast(S.t("consent.codeSent"));
      return;
    }
    const otp = document.getElementById("ra-otp").value.trim();
    if (!/^\d{6}$/.test(otp)) { S.ui.toast(S.t("consent.otpNeeded"), true); return; }
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spin"></span>${S.fmt.escape(S.t("reg.provisioning"))}`;
    const r = await S.api.patch("/api/security/risk-assessment", { risk_answers: answers, otp });
    sendBtn.disabled = false;
    if (r.ok) {
      S.ui.toast(S.t("common.opOk"));
      c.innerHTML = `<div class="auth-wrap" style="max-width:640px"><div class="card center">
        ${S.ui.icon("check", 40)}
        <h2 style="margin-top:10px">${S.fmt.escape(S.t("sec.retestDone", r.data.pr_level))}</h2>
        <p class="muted small">${S.fmt.escape(S.t("sec.retestDoneNote"))}</p>
        <div class="row" style="justify-content:center;gap:10px;margin-top:14px">
          <a class="btn btn-light" href="/account/security">${S.fmt.escape(S.t("sec.title"))}</a>
          <a class="btn btn-primary" href="/wealth">${S.fmt.escape(S.t("nav.wealth"))}</a>
        </div></div></div>`;
    } else {
      S.ui.toast(r.data?.error?.message ?? r.data?.error?.code ?? S.t("common.opFailed"), true);
    }
  };

  /* OTP 发送按钮（60s 冷却三态，与注册页同款交互） */
  const codeBtn = document.getElementById("ra-code");
  if (codeBtn) {
    codeBtn.onclick = async () => {
      codeBtn.disabled = true;
      const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email });
      if (r.status === 429) { S.ui.toast(r.data?.error?.message ?? S.t("consent.tooFast"), true); }
      else S.ui.toast(S.t("consent.codeSent"));
      let left = 60;
      const tick = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(tick); codeBtn.disabled = false; codeBtn.textContent = S.t("consent.getCode"); }
        else codeBtn.textContent = `${left}s`;
      }, 1000);
    };
  }
});
