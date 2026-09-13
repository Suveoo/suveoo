/* genui/consent.js — 两段式确认弹窗（黄/红；红级内嵌 OTP） */
S.consent = {
  /** data = 202 INPUT_REQUIRED 响应体。resolve(null)=取消，resolve({otp})=确认。 */
  modal(data, { onEvent = null } = {}) {
    const { grant, red, tier } = data;
    const card = S.genuiCards.transfer_confirmation({
      component: "transfer_confirmation", issuer: "verified_ir", tier,
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
            <span class="lb">${S.fmt.escape(S.t("consent.otp"))} <span class="muted small">(${S.fmt.escape(email ?? "")})</span></span>
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
      const close = (v) => { clearInterval(timer); box.remove(); resolve(v); };
      box.querySelector("#ck-no").onclick = () => { onEvent?.("consent_cancelled"); close(null); };
      box.querySelector("#ck-ok").onclick = () => {
        const otp = box.querySelector("#ck-otp")?.value.trim();
        if (red && !/^\d{6}$/.test(otp ?? "")) { S.ui.toast(S.t("consent.otpNeeded"), true); return; }
        onEvent?.("consent_granted");
        S.ga4.event("consent_grant", { tier });
        close({ otp });
      };
      const sendBtn = box.querySelector("#ck-send");
      if (sendBtn) sendBtn.onclick = async () => {
        sendBtn.disabled = true;
        const r = await S.api.post("/api/auth/email-code", { scene: "redstep", email: S.consent.userEmail });
        if (r.status === 429) S.ui.toast(r.data?.error?.message ?? S.t("consent.tooFast"), true);
        else S.ui.toast(S.t("consent.codeSent"));
        setTimeout(() => (sendBtn.disabled = false), 60000);
      };
      /* 倒计时（与 CONSENT_GRANT_TTL_SECONDS 一致） */
      let left = Math.max(0, Math.floor((Date.parse(grant.expires_at) - Date.now()) / 1000));
      const cd = box.querySelector("#ck-cd");
      const timer = setInterval(() => {
        left--;
        if (left <= 0) { cd.textContent = S.t("consent.expired"); clearInterval(timer); box.querySelector("#ck-ok").disabled = true; }
        else cd.textContent = `${S.t("consent.expiresIn")} ${left}s`;
      }, 1000);
    });
  },
  get userEmail() { return this._email; },
  set userEmail(v) { this._email = v; },
};
