/* phone.js — 手机号体系前端核心（第八十五轮）。
 * S.phone.bindModal：磨砂白卡绑定弹窗（+86 前缀灰置、60s 倒计时、可带"7 天内不再提醒"）；
 * S.phone.otpSwitcher：接码通道切换条（红级确认卡/2FA/找回/解冻统一复用——默认通道掩码+"切换到另一通道"）。
 * 依赖：S.api/S.ui/S.t；后端 /api/auth/email-code（channel 分流）与 /api/account/phone。 */
S.phone = (() => {
  const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
  const SKIP_KEY = "suveoo_phone_prompt_until";
  const normCN = (raw) => {
    let x = String(raw ?? "").replace(/[\s-]/g, "").replace(/^(\+86|0086)/, "");
    return /^1[3-9]\d{9}$/.test(x) ? x : null;
  };

  /** 绑定弹窗。opts.onDone(masked) 成功回调；opts.allowSkip 显示"7 天内不再提醒"勾选 */
  function bindModal({ onDone = null, allowSkip = false } = {}) {
    let cd = null;
    /* 第八十九轮根因修复②：persistSkip 必须为 function 声明（提升）——此前 const 定义在 modal()
     * 调用之后，onClose 参数引用触发 TDZ ReferenceError 被 try/catch 静默吞掉 = Web 从未弹窗。 */
    function persistSkip() {
      if (allowSkip && m?.el?.querySelector("#ph-skip7")?.checked) {
        try { localStorage.setItem(SKIP_KEY, String(Date.now() + 7 * 86400_000)); } catch {}
      }
    }
    const m = S.ui.modal(`
      <h3 style="font-size:17px">${S.fmt.escape(t("ph.title", "绑定手机号"))}</h3>
      <p class="muted" style="font-size:13px;line-height:1.6;margin:8px 0 6px">${S.fmt.escape(t("ph.why", "绑定后可用手机号快速登录、接收验证码（短信即时到达），并支持向手机号转账。仅支持 +86 大陆手机号，一个手机号只能绑定一个账户。"))}</p>
      <p class="muted small" style="margin:0 0 14px">${S.fmt.escape(t("ph.cancelNote", "暂不绑定？可随时在「我的账户」页面提示条或安全中心绑定。"))}</p>
      <label class="field"><span class="lb">${S.fmt.escape(t("ph.number", "手机号"))}</span>
        <div class="row" style="gap:8px">
          <span class="input ph-cc">+86</span>
          <input class="input grow" id="ph-num" inputmode="numeric" maxlength="13" placeholder="138 1234 5678" autocomplete="tel-national">
        </div></label>
      <label class="field"><span class="lb">${S.fmt.escape(t("ph.code", "验证码"))}</span>
        <div class="row" style="gap:8px">
          <input class="input grow mono" id="ph-code" inputmode="numeric" maxlength="6" placeholder="······" autocomplete="one-time-code">
          <button type="button" class="btn btn-light" id="ph-send" style="flex:none">${S.fmt.escape(t("ph.send", "获取验证码"))}</button>
        </div></label>
      ${allowSkip ? `<label class="row small" style="gap:7px;margin-top:4px;cursor:pointer"><input type="checkbox" id="ph-skip7"><span class="muted">${S.fmt.escape(t("ph.skip7", "7 天内不再提醒"))}</span></label>` : ""}
      <div class="modal-actions"><button class="btn" id="ph-cancel">${S.fmt.escape(t("common.cancel", "取消"))}</button>
      <button class="btn btn-primary" id="ph-ok">${S.fmt.escape(t("ph.bind", "绑定"))}</button></div>`, { onClose: persistSkip });
    const $ = (id) => m.el.querySelector("#" + id);
    $("ph-cancel").onclick = () => { if (cd) clearInterval(cd); m.close(); };
    /* 手机号输入实时格式化（138 1234 5678 三四四）——仅展示态，提交归一 */
    $("ph-num").addEventListener("input", (e) => {
      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
      e.target.value = d.length > 7 ? `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
    });
    $("ph-send").onclick = async () => {
      const num = normCN($("ph-num").value);
      if (!num) { S.ui.toast(t("ph.invalid", "请输入正确的 11 位大陆手机号"), true); return; }
      const btn = $("ph-send"); btn.disabled = true; let left = 60;
      btn.textContent = left + "s";
      cd = setInterval(() => { left--; if (left <= 0) { clearInterval(cd); cd = null; btn.disabled = false; btn.textContent = t("ph.send", "获取验证码"); } else btn.textContent = left + "s"; }, 1000);
      const r = await S.api.post("/api/auth/email-code", { scene: "phonebind", channel: "phone", phone: num });
      if (!r.ok) { clearInterval(cd); cd = null; btn.disabled = false; btn.textContent = t("ph.send", "获取验证码"); S.ui.toast(r.data?.error?.message ?? t("ph.sendFail", "验证码发送失败"), true); return; }
      S.ui.toast(t("ph.sent", "验证码已发送，请查收短信"));
      $("ph-code").focus();
    };
    $("ph-ok").onclick = async () => {
      const num = normCN($("ph-num").value), code = $("ph-code").value.trim();
      if (!num) { S.ui.toast(t("ph.invalid", "请输入正确的 11 位大陆手机号"), true); return; }
      if (!/^\d{6}$/.test(code)) { S.ui.toast(t("ph.codeHint", "请输入 6 位验证码"), true); return; }
      const okBtn = $("ph-ok"); okBtn.disabled = true;
      const r = await S.api.post("/api/account/phone", { action: "bind", phone: num, code });
      okBtn.disabled = false;
      if (!r.ok) { S.ui.toast(r.data?.error?.message ?? t("ph.bindFail", "绑定失败，请重试"), true); return; }
      if (allowSkip && $("ph-skip7")?.checked) { try { localStorage.setItem(SKIP_KEY, String(Date.now() + 7 * 86400_000)); } catch {} }
      if (cd) clearInterval(cd);
      m.close();
      S.ui.toast(t("ph.bound", "手机号绑定成功"));
      onDone?.(r.data?.phone_masked ?? "");
    };
  }

  /** 引导弹窗（全局 boot 触发）：未绑定+未跳过才弹（带 7 天勾选）。
   * 第八十六轮：每次打开 Suveoo（任意页面）只弹一次——sessionStorage 会话级标记
   * （MPA 每页 boot 都会跑到此函数，无标记=换页重弹的 bug）；取消不跨会话（除非勾 7 天），
   * 关闭浏览器/重开 App=新会话→下次再弹。 */
  async function promptIfNeeded() {
    try { if (sessionStorage.getItem("suveoo_phone_prompted")) return; } catch {}
    if (typeof window.Capacitor !== "undefined" && !window.S) return;
    const page = document.body.dataset.page ?? "";
    if (["login", "register", "recovery", ""].includes(page)) return;
    const sess = S.auth._session !== undefined ? S.auth._session : await Promise.resolve(S.auth.session ? S.auth.session() : null).catch(() => null);
    if (!sess || sess.phone_bound) return;
    try { if (Number(localStorage.getItem(SKIP_KEY) ?? 0) > Date.now()) return; } catch {}
    setTimeout(() => {
      if (S.auth._session?.phone_bound) return;
      try { sessionStorage.setItem("suveoo_phone_prompted", "1"); } catch {} /* 弹出即计一次（含取消） */
      bindModal({ allowSkip: true });
    }, 2200);
  }

  /** 接码通道切换条（红级卡/2FA/找回/解冻复用）。
   * otp={default_channel,masked,alt:{channel,masked}|null}（后端 OTP_REQUIRED/2FA 响应）；
   * scene（redstep/login2fa/recovery/cbunlock）；extra=重发请求附加体（如 mfa_token）；
   * opts.pending=true 首屏用"将发送至"（确认卡未发码即挂载的场景），切换后恒"已发送至"。
   * 返回 {el, onChange(channel)}——onChange 供宿主切换后重置提示文案。 */
  function otpSwitcher(otp, scene, extra = {}, { pending = false } = {}) {
    if (!otp || !otp.alt) return null;
    const wrap = document.createElement("div");
    wrap.className = "ph-switch small";
    /* 第九十四轮：两通道掩码独立缓存（此前切换后 alt.masked 恒为初始另一通道——掩码反转根因） */
    const phoneMasked = (otp.default_channel ?? otp.channel) === "phone" ? otp.masked : (otp.alt.channel === "phone" ? otp.alt.masked : "");
    const emailMasked = (otp.default_channel ?? otp.channel) === "email" ? otp.masked : (otp.alt.channel === "email" ? otp.alt.masked : "");
    const render = (cur, isPending = false) => {
      const curMasked = cur === "phone" ? phoneMasked : emailMasked;
      const targetCh = cur === "phone" ? "email" : "phone";
      const targetMasked = targetCh === "phone" ? phoneMasked : emailMasked;
      /* 队长令（第九十六轮）：切换条附"默认方式可在安全中心更改"说明（i18n ph.switchNote） */
      wrap.innerHTML = `<span class="muted">${S.fmt.escape(t(isPending ? "ph.willSendTo" : "ph.sentTo", isPending ? "验证码将发送至" : "验证码已发送至"))} <b>${S.fmt.escape(curMasked)}</b></span>
        <button type="button" class="ph-switch-btn" data-ch="${targetCh}">${S.fmt.escape(t("ph.switchTo", "切换到") + (targetCh === "phone" ? t("ph.sms", "短信") : t("ph.emailCh", "邮箱")) + " " + targetMasked)}</button>
        <div class="muted small" style="flex-basis:100%;margin-top:2px">${S.fmt.escape(t("ph.switchNote", "默认接码方式可在安全中心更改"))}</div>`;
      wrap.querySelector(".ph-switch-btn").onclick = async (e) => {
        const btn = e.currentTarget;
        const ch = btn.dataset.ch;
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        /* 队长令（第九十八轮）：切换请求期间给动态指示（spinner+文案）——静止画面致用户焦虑 */
        btn.innerHTML = '<span class="spin sm" style="vertical-align:-2px"></span>' + S.fmt.escape(t("ph.switching", "切换中…"));
        const body = { scene, channel: ch, ...extra };
        if (ch === "email" && extra.__email) body.email = extra.__email;
        const r = await S.api.post("/api/auth/email-code", body);
        e.target.disabled = false;
        if (!r.ok) { btn.disabled = false; btn.innerHTML = prevHtml; S.ui.toast(r.data?.error?.message ?? t("ph.sendFail", "验证码发送失败"), true); return; }
        render(ch);
        S.ui.toast(t("ph.sent", "验证码已发送，请查收"));
        wrap.dispatchEvent(new CustomEvent("phswitch", { detail: { channel: ch } }));
      };
    };
    render(otp.default_channel ?? otp.channel, pending);
    return wrap;
  }

  /** 会话 → OTP 通道描述符（双通道齐全才返回，否则 null=无切换条）。
   * sess = /api/auth/session（email/phone 均为掩码、otp_channel 默认通道）。
   * 队长令（第九十八轮）：所有"打开即见"的验证码弹窗（ctl.otp/改密/熔断）在首次发码前
   * 就要能看到切换条——此前切换条只在发码响应后才挂（AI 确认卡弹窗"缺失切换按钮"即此）。 */
  function otpDescFromSession(sess) {
    if (!sess || !sess.phone || !sess.email) return null;
    const ch = sess.otp_channel === "phone" ? "phone" : "email";
    return {
      channel: ch, default_channel: ch,
      masked: ch === "phone" ? sess.phone : sess.email,
      alt: ch === "phone" ? { channel: "email", masked: sess.email } : { channel: "phone", masked: sess.phone },
    };
  }

  return { bindModal, promptIfNeeded, otpSwitcher, otpDescFromSession, normCN, SKIP_KEY };
})();
