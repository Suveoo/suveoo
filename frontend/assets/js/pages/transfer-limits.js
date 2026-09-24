/* transfer-limits.js — P11 转账限额 */
S.router.register("transfer-limits", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<h1>${S.fmt.escape(S.t("limits.title"))}</h1>
    <div class="banner">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("limits.tierNote"))}</div></div>
    <div class="card">${S.ui.skeleton(3)}</div>`;
  const r = await S.api.get("/api/cards");
  const el = c.querySelector(".card");
  if (!r.ok) { el.innerHTML = S.ui.empty(S.t("common.loadFailed")); return; }
  const cards = (r.data.cards ?? []).filter((x) => x.kind === "debit");
  el.innerHTML = `
    <div class="list-row"><span class="avatar">${S.ui.icon("ai", 14)}</span>
      <div class="grow"><b>${S.fmt.escape(S.t("limits.aiChannel"))}</b><div class="muted small">${S.fmt.escape(S.t("limits.aiSingle"))} ¥5,000 · ${S.fmt.escape(S.t("limits.aiDaily"))} ¥10,000${S.fmt.escape(S.t("limits.hardCap"))}</div></div>
      ${S.ui.badge("AI", "badge-navy")}</div>
    ` + cards.map((cd) => `
    <div class="list-row">
      <img class="bc-art" src="/${cd.art}" alt="" style="width:64px;height:40px">
      <div class="grow"><b class="mono">${S.fmt.escape(cd.number)}</b>
        <div class="muted small">${S.fmt.escape(cd.network)} · ${S.fmt.escape(S.t("cards.classIc", cd.class_label))}${cd.is_default ? " · " + S.fmt.escape(S.t("cards.default")) : ""}</div>
        <div class="muted small">${S.fmt.escape(S.t("limits.single"))} <b class="mono">¥${S.fmt.moneyPlain(cd.limit_single ?? "50000")}</b>
        · ${S.fmt.escape(S.t("limits.daily"))} <b class="mono">¥${S.fmt.moneyPlain(cd.limit_daily ?? "100000")}</b></div></div>
      <button class="btn btn-sm btn-light adj" data-slug="${cd.slug}" data-single="${cd.limit_single ?? "50000"}" data-daily="${cd.limit_daily ?? "100000"}">${S.fmt.escape(S.t("limits.adjust"))}</button>
    </div>`).join("");
  S.ui.$$(".adj").forEach((btn) => {
    btn.onclick = () => {
      const { slug } = btn.dataset;
      const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("limits.adjust"))}</h2>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("limits.single"))}</span><input class="input mono" id="l-single" value="${btn.dataset.single}"></label>
        <label class="field"><span class="lb">${S.fmt.escape(S.t("limits.daily"))}</span><input class="input mono" id="l-daily" value="${btn.dataset.daily}"></label>
        <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
        <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.save"))}</button></div>`);
      m.el.querySelector("#cx").onclick = m.close;
      m.el.querySelector("#ok").onclick = async () => {
        const single = m.el.querySelector("#l-single").value.trim();
        const daily = m.el.querySelector("#l-daily").value.trim();
        const r2 = await S.api.mutate(`/api/cards/${slug}/limits`, { limit_single: single, limit_daily: daily });
        if (r2.cancelled) return;
        if (r2.data?.status === "EXECUTED") { m.close(); S.ui.toast(S.t("common.opOk")); setTimeout(() => location.reload(), 700); }
        else S.ui.toast(r2.data?.reason ?? "failed", true);
      };
    };
  });
});
