/* cards.js — P24 卡片管理 */
S.router.register("cards", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between"><h1>${S.fmt.escape(S.t("cards.title"))}</h1>
    <button class="eye-toggle" id="eye" title="${S.fmt.escape(S.t("cards.showBalance"))}">${S.ui.icon("eye", 20)}</button></div>
    ${S.sim.banner()}<div class="cardwall" id="wall">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/cards");
  const wall = document.getElementById("wall");
  if (!r.ok) { wall.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  let hidden = false;
  const mask = (s) => (hidden ? "*****" : s);
  const render = () => {
    wall.innerHTML = (r.data.cards ?? []).map((cd) => `
      <div class="bank-card ${cd.status === "FROZEN" ? "frozen" : ""}">
        <div class="bc-top"><div><b class="bc-num">${S.fmt.escape(cd.number)}</b>
          <div class="muted small">${S.fmt.escape(cd.kind === "credit" ? S.t("cards.credit") : S.t("cards.classIc", cd.class_label))} · ${S.fmt.escape(cd.network)}</div></div>
          <div>${cd.is_default ? S.ui.badge(S.t("cards.default"), "badge-navy") : ""} ${cd.status === "FROZEN" ? S.ui.badge("FROZEN", "badge-red") : ""}${cd.held ? `<span class="badge badge-yellow">${S.ui.icon("lock", 12)} ${S.fmt.escape(cd.held)}</span>` : ""}</div></div>
        <div class="bc-main"><a href="/account/card/${cd.slug}/settings" title="${S.fmt.escape(S.t("cards.openSettings"))}" style="flex:none;display:block"><img class="bc-art" src="/${cd.art}" alt="${S.fmt.escape(S.t("cards.openSettings"))}"></a>
          <div><div class="muted small">${S.fmt.escape(cd.kind === "credit" ? S.t("cards.creditLeft") : S.t("cards.balance"))}</div>
            <b class="mono" style="font-size:22px">¥ ${S.fmt.escape(mask(cd.kind === "credit" ? (cd.available ?? cd.balance) : cd.balance))}</b>
            ${cd.limit ? `<div class="muted small">${S.fmt.escape(S.t("cards.creditLimit"))} ¥ ${cd.limit}</div>` : ""}</div></div>
        <div class="bc-btns">
          <a class="bc-btn" href="/account/card/${cd.slug}/history">${S.ui.icon("list", 13)} ${S.fmt.escape(S.t("cards.history"))}</a>
          <a class="bc-btn" href="/transfer/intrabank?from=${cd.slug}">${S.ui.icon("send", 13)} ${S.fmt.escape(S.t("cards.transfer"))}</a>
          <button class="bc-btn fz" data-slug="${cd.slug}" data-st="${cd.status}">${S.ui.icon("snow", 13)} ${S.fmt.escape(cd.status === "FROZEN" ? S.t("cards.unfreeze") : S.t("cards.freeze"))}</button>
          <a class="bc-btn" href="/account/card/${cd.slug}/settings">${S.ui.icon("gear", 13)} ${S.fmt.escape(S.t("cards.more"))}</a>
          <button class="bc-btn ai-m" data-slug="${cd.slug}">${S.ui.icon("ai", 13)} ${S.fmt.escape(S.t("cards.aiManage"))}</button>
        </div>
      </div>`).join("");
    S.ui.$$(".fz").forEach((b) => {
      b.onclick = async () => {
        const intent = b.dataset.st === "FROZEN" ? "unfreeze" : "freeze";
        const r2 = await S.api.mutate(`/api/cards/${b.dataset.slug}/${intent}`, {});
        if (r2.cancelled) return;
        if (r2.data?.status === "OTP_REQUIRED") {
          /* 红级：自绘验证码弹窗取码后重试（邮箱以后端会话为准，前端只有掩码） */
          const otp = await S.ctl.otp({
            email: (await S.auth.session())?.email,
            send: async () => (await S.api.post("/api/auth/email-code", { scene: "redstep" })).ok,
          });
          if (!otp) return;
          const r3 = await S.api.post(`/api/cards/${b.dataset.slug}/${intent}`, { otp });
          S.ui.toast(r3.data?.status === "EXECUTED" ? S.t("common.opOk") : r3.data?.reason ?? "failed", r3.data?.status !== "EXECUTED");
          if (r3.data?.status === "EXECUTED") setTimeout(() => location.reload(), 800);
          return;
        }
        if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 800); }
        else S.ui.toast(r2.data?.reason ?? "failed", true);
      };
    });
    S.ui.$$(".ai-m").forEach((b) => { b.onclick = () => S.router.ai(S.t("cards.aiPrompt", b.dataset.slug)); });
  };
  render();
  document.getElementById("eye").onclick = () => { hidden = !hidden; document.getElementById("eye").innerHTML = S.ui.icon(hidden ? "eye-off" : "eye", 20); render(); };
});
