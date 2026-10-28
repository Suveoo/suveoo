/* genui/consent.js — 两段式确认弹窗（黄/红；红级内嵌 OTP；标题/图标按 IR intent 定制） */
/* Web 版本地门懒加载器：biometric-web.js 不入任何 HTML（客户端壳零加载零影响），
 * 黄级确认首次触发时按需注入；URL 跟随全站资产版本号（i18n.js 同款提取）防缓存错配 */
S.bioWebLoad = () => new Promise((resolve, reject) => {
  if (window.S.bioWeb) return resolve();
  const av = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1] ?? "";
  const s = document.createElement("script");
  s.src = `/assets/js/core/biometric-web.js${av ? `?v=${av}` : ""}`;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error("biometric-web load failed"));
  document.head.appendChild(s);
});
S.consent = {
  /** data = 202 INPUT_REQUIRED 响应体。resolve(null)=取消，resolve({otp})=确认。
   *  opts.action 覆盖 IR intent（目前仅存款页传 "deposit"——与申购共用 wealth_product_purchase intent）；
   *  opts.subject 传产品等展示名（快照里只有 product_id）。 */
  modal(data, { onEvent = null, action = null, subject = null } = {}) {
    const { grant, red, tier } = data;
    const card = S.genuiCards.transfer_confirmation({
      component: "transfer_confirmation", issuer: "verified_ir", tier,
      action: action ?? grant?.snapshot?.action ?? "transfer_execute", subject,
      snapshot: grant.snapshot, grant_hash: grant.grant_hash, trace_id: data.trace_id,
    });
    const email = S.auth._session?.email;
    return new Promise((resolve) => {
      const box = S.ui.el(`
        <div class="modal-mask"><div class="modal">
          <h2>${S.fmt.escape(S.t("consent.title"))}</h2>
          ${card}
          ${red ? `
          <div class="field" style="margin-top:16px">
            <span class="lb">${S.fmt.escape(S.t("consent.otp"))} <span class="muted small ck-chan">(${S.fmt.escape(data.otp?.masked ?? email ?? "")})</span></span>
            <div class="gc-otp">
              <input class="input" id="ck-otp" maxlength="6" inputmode="numeric" placeholder="······">
              <button class="btn btn-light" id="ck-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button>
            </div>
          </div>` : ""}
          <div class="gc-countdown" id="ck-cd">${S.t("consent.expiresIn")} 120s</div>
          <p class="footnote-sim">${S.fmt.escape(S.t("consent.notice"))}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="ck-no">${S.fmt.escape(S.t("common.cancel"))}</button>
            <button class="btn btn-primary" id="ck-ok">${S.fmt.escape(S.t("consent.confirm"))}</button>
          </div>
        </div></div>`);
      document.body.appendChild(box);
      let cdTimer = null; /* 重发冷却倒计时（close 一并清理） */
      const close = (v) => { clearInterval(timer); if (cdTimer) clearInterval(cdTimer); box.remove(); resolve(v); };
      box.querySelector("#ck-no").onclick = () => { onEvent?.("consent_cancelled"); close(null); };
      box.querySelector("#ck-ok").onclick = async () => {
        const otp = box.querySelector("#ck-otp")?.value.trim();
        if (red && !/^\d{6}$/.test(otp ?? "")) { S.ui.toast(S.t("consent.otpNeeded"), true); return; }
        /* 黄级确认执行前本地生物识别在场校验（第六十六轮起；web 分支本轮新增）：
         * 客户端壳经 Capacitor（Android 原生 / Win·mac 兼容 shim）→ AndroidX BiometricPrompt /
         * Windows Hello / Touch ID；web → WebAuthn 平台通行密钥（S.bioWeb，同款 OS 生物识别、
         * 纯本地、懒加载）。红级照旧 OTP，叠加不替换。「增强不是门槛」：取消各自语义处理，
         * 插件/加载/校验异常一律放行，绝不因缺失或故障阻断业务。 */
        if (!red) {
          if (window.Capacitor?.Plugins?.Biometric) {
            try {
              const v = await window.Capacitor.Plugins.Biometric.verify();
              if (v && v.ok === false) { S.ui.toast(S.t("bio.verifyCancel"), true); return; }
            } catch { /* 插件异常放行 */ }
          } else {
            try {
              const g = await S.bioWebLoad().then(() => S.bioWeb.gate());
              if (g === "cancel") { S.ui.toast(S.t("bio.verifyCancel"), true); return; }
            } catch { /* 加载/校验异常放行 */ }
          }
        }
        onEvent?.("consent_granted");
        S.ga4.event("consent_grant", { tier });
        close({ otp });
      };
      const sendBtn = box.querySelector("#ck-send");
      const chanLabel = box.querySelector(".ck-chan") ?? { textContent: "" };
      let curChannel = (data.otp?.default_channel ?? data.otp?.channel) ?? "email";
      /* 第八十五轮：红级接码通道切换（绑手机号用户默认短信；可切邮箱，二者均算数）。
       * 第九十六轮：第一段确认卡即带 otp 描述符（服务端 INPUT_REQUIRED 附带）——首屏显示默认通道
       * +切换条（pending 态文案"将发送至"，未点获取验证码前不谎称已发送） */
      if (data.otp && data.otp.alt && sendBtn) {
        const sw = S.phone.otpSwitcher(data.otp, "redstep", {}, { pending: true });
        if (sw) { sendBtn.closest(".field")?.after(sw); sw.addEventListener("phswitch", (e) => { curChannel = e.detail.channel; }); }
      }
      if (sendBtn) {
        let swEl = box.querySelector(".ph-switch");
        let expired = false; /* 第九十九轮：过期标记——重发冷却归零不得复活按钮 */
        sendBtn.onclick = async () => {
          if (expired) return;
          sendBtn.disabled = true;
          sendBtn.textContent = S.t("ctl.sending"); /* 发送中动态反馈（第九十八轮：静止灰钮致焦虑） */
          /* 第八十五轮：通道化发码——带 email 时服务端仍归一会话邮箱（兼容旧调用）；
           * 登录态默认通道由服务端按绑定关系决定（绑了手机号=短信）。 */
          const to = S.consent.userEmail ?? (await S.auth.session())?.email;
          const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email: to, ...(curChannel && curChannel !== "email" ? { channel: curChannel } : {}) });
          if (!r.ok) { sendBtn.textContent = S.t("consent.getCode"); S.ui.toast(r.data?.error?.message ?? S.t("consent.tooFast"), true); setTimeout(() => { if (!expired) sendBtn.disabled = false; }, 5000); return; }
          if (r.data?.masked) chanLabel.textContent = r.data.masked;
          /* 第九十六轮：发送成功后切换条从"将发送至"翻为"已发送至"（以实际通道响应重建） */
          if (r.data?.channel) {
            swEl?.remove();
            swEl = S.phone.otpSwitcher(r.data, "redstep", {});
            if (swEl) { sendBtn.closest(".field")?.after(swEl); swEl.addEventListener("phswitch", (e) => { curChannel = e.detail.channel; }); }
          }
          S.ui.toast(S.t("consent.codeSent"));
          /* 重发冷却倒计时（第六十一轮）：60s 禁用期间按钮文字显示剩余秒数，替代无解释的灰按钮 */
          const prevLabel = sendBtn.textContent;
          let cd = 60;
          sendBtn.textContent = S.t("consent.resendIn", cd);
          cdTimer = setInterval(() => {
            cd--;
            if (cd <= 0) { clearInterval(cdTimer); sendBtn.textContent = prevLabel; if (!expired) sendBtn.disabled = false; return; }
            sendBtn.textContent = S.t("consent.resendIn", cd);
          }, 1000);
        };
      }
      /* 倒计时（与 CONSENT_GRANT_TTL_SECONDS 一致）。
       * 队长令（第九十九轮）：过期后锁定卡上一切发码入口（获取验证码/通道切换/输入框/确认）——
       * 此前仅禁确认钮，过期卡仍可点"获取验证码"白白发码（grant 已死，码永远用不上）。 */
      let left = Math.max(0, Math.floor((Date.parse(grant.expires_at) - Date.now()) / 1000));
      const cd = box.querySelector("#ck-cd");
      const timer = setInterval(() => {
        left--;
        if (left <= 0) {
          cd.textContent = S.t("consent.expired"); clearInterval(timer); if (cdTimer) clearInterval(cdTimer);
          const okB = box.querySelector("#ck-ok"); if (okB) okB.disabled = true;
          const sd = box.querySelector("#ck-send"); if (sd) { sd.disabled = true; sd.textContent = S.t("consent.getCode"); }
          const swb = box.querySelector(".ph-switch-btn"); if (swb) swb.disabled = true;
          const oi = box.querySelector("#ck-otp"); if (oi) oi.disabled = true;
          cd.style.color = "var(--color-red, #C4453B)";
        }
        else cd.textContent = `${S.t("consent.expiresIn")} ${left}s`;
      }, 1000);
    });
  },
  get userEmail() { return this._email; },
  set userEmail(v) { this._email = v; },
};
