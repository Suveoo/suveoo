/* payees.js — P12 常用收款人 */
S.router.register("payees", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between"><h1>${S.fmt.escape(S.t("payees.title"))}</h1>
    <button class="btn btn-primary" id="add">${S.ui.icon("plus", 16)} ${S.fmt.escape(S.t("payees.add"))}</button></div>
    ${S.sim.footnote()}<div class="card">${S.ui.skeleton(4)}</div>`;
  const el = c.querySelector(".card");
  const render = async () => {
    const r = await S.api.get("/api/payees");
    // 存量数据里的分组标签是简中；显示时经 i18n 映射（未收录的标签原样展示）
    const GROUP_KEY = { "家人": "family", "朋友": "friends", "同事": "colleague", "生活缴费": "life", "其他": "other", "房东": "landlord", "工作": "work", "默认": "default" };
    const gLabel = (g) => { const k = GROUP_KEY[g]; return k ? S.t("payees.group." + k) : g; };
    const groups = {};
    for (const p of r.data?.payees ?? []) (groups[p.group_label ?? S.t("payees.group.default")] ??= []).push(p);
    el.innerHTML = Object.entries(groups).map(([g, list]) => `
      <h3 style="margin:8px 0 4px">${S.fmt.escape(gLabel(g))}</h3>
      ${list.map((p) => `
      <div class="list-row">
        <span class="avatar">${S.fmt.escape(p.name.slice(0, 1))}</span>
        <div class="grow"><b>${S.fmt.escape(p.name)}</b><div class="muted small mono">${S.fmt.escape(p.account ?? "—")}</div></div>
        ${p.verified === false ? S.ui.badge(S.t("payees.unverified"), "badge-gray") : ""}
        <button class="btn btn-sm btn-light go" data-id="${p.id}" ${p.verified === false ? "disabled title=" + S.fmt.escape(S.t("payees.unverified")) : ""}>${S.ui.icon("send", 12)} ${S.fmt.escape(S.t("payees.transfer"))}</button>
        <button class="bc-btn del" data-id="${p.id}" title="${S.fmt.escape(S.t("common.delete"))}">${S.ui.icon("x", 13)}</button>
      </div>`).join("")}`).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".go").forEach((b) => { b.onclick = () => (location.href = `/transfer/intrabank?payee=${b.dataset.id}`); });
    S.ui.$$(".del").forEach((b) => {
      b.onclick = async () => {
        const r2 = await S.api.mutate(`/api/payees/${b.dataset.id}`, {}, );
        if (r2.cancelled) return;
        if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); render(); }
        else S.ui.toast(r2.data?.reason ?? "failed", true);
      };
    });
  };
  /* 收款方真实性错误的映射提示（服务端结构化 code → i18n） */
  const tgtErr = (reason) => ({
    ACCOUNT_NOT_FOUND: S.t("transfer.acctNotFound"),
    NAME_MISMATCH: S.t("transfer.nameMismatch"),
    INVALID_CARD_FORMAT: S.t("transfer.invalidAccount"),
  }[reason] ?? null);
  document.getElementById("add").onclick = () => {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("payees.add"))}</h2>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toName"))}</span><input class="input" id="p-name" placeholder="${S.fmt.escape(S.t("payees.namePh"))}"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("payees.accountNo"))}</span><input class="input mono" id="p-acct" placeholder="${S.fmt.escape(S.t("payees.accountPh"))}" maxlength="16"></label>
      <div class="field-hint">${S.fmt.escape(S.t("payees.hintReal"))}</div>
      <label class="field" style="margin-top:14px"><span class="lb">${S.fmt.escape(S.t("payees.group"))}</span>
        <span id="p-group"></span>
        <input class="input" id="p-group-custom" maxlength="12" placeholder="${S.fmt.escape(S.t("payees.groupCustomPh"))}" style="display:none;margin-top:8px"></label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.add"))}</button></div>`);
    /* 分组：通用五组 + "自定义…"（选中后显示自由输入框，≤12 字符）；旧枚举（房东/工作/默认）仅做存量显示映射 */
    const groupKeys = ["family", "friends", "colleague", "life", "other"];
    const CUSTOM = "__custom__";
    const groupSel = S.ctl.select({
      label: S.t("payees.group"),
      options: [...groupKeys.map((k) => ({ v: S.t("payees.group." + k), label: S.t("payees.group." + k) })), { v: CUSTOM, label: S.t("payees.groupCustom") }],
      onChange: (v) => { m.el.querySelector("#p-group-custom").style.display = v === CUSTOM ? "" : "none"; },
    });
    groupSel.id = "p-group";
    m.el.querySelector("#p-group").replaceWith(groupSel);
    m.el.querySelector("#cx").onclick = m.close;
    m.el.querySelector("#ok").onclick = async () => {
      const customG = m.el.querySelector("#p-group-custom").value.trim();
      const group = groupSel.value === CUSTOM ? (customG || S.t("payees.group.other")) : groupSel.value;
      const body = { name: m.el.querySelector("#p-name").value.trim(), account: m.el.querySelector("#p-acct").value.replace(/\s/g, ""), group_label: group };
      if (!body.name || !/^\d{16}$/.test(body.account)) { S.ui.toast(S.t("transfer.invalidAccount"), true); return; }
      const r2 = await S.api.mutate("/api/payees", body);
      if (r2.cancelled) return;
      if (r2.data?.status === "EXECUTED") { m.close(); S.ui.toast(S.t("common.opOk")); render(); }
      else S.ui.toast(tgtErr(r2.data?.reason ?? r2.data?.error?.code) ?? r2.data?.error?.message ?? r2.data?.reason ?? "failed", true);
    };
  };
  render();
});
