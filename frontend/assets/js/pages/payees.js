/* payees.js — P12 常用收款人 */
S.router.register("payees", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="row between"><h1>${S.fmt.escape(S.t("payees.title"))}</h1>
    <button class="btn btn-primary" id="add">${S.ui.icon("plus", 16)} ${S.fmt.escape(S.t("payees.add"))}</button></div>
    <div class="card" style="margin-top:14px">${S.ui.skeleton(4)}</div>`;
  const el = c.querySelector(".card");
  let cache = []; /* 第一百一十轮：编辑弹窗数据源（render 时刷新） */
  /* 第一百一十六轮：Email 掩码（统一首 2 字符 + 5 星 + 后缀）："zh*****@demo.suveoo.com" */
  const maskEmail = (e) => {
    const t = String(e ?? "");
    const at = t.indexOf("@");
    if (at < 3) return t.replace(/^(.{1,2}).*(@.*)$/, "$1*****$2");
    return t.slice(0, 2) + "*****" + t.slice(at);
  };
  const render = async () => {
    let r;
    try { r = await S.api.get("/api/payees"); } catch { r = { ok: false }; } /* 网络 throw 与超时同走错误卡（render 为 fire-and-forget，异常无人接） */
    /* 第一百一十七轮：失败不再静默显示"暂无数据"——错误小卡+重试（原版骨架/空态误导且 render 异常无人接） */
    if (!r.ok) {
      el.innerHTML = `<div class="card" style="padding:18px"><p class="muted small">${S.fmt.escape(S.t("common.loadFailed"))}</p><button class="btn btn-sm btn-light" id="pye-retry" style="margin-top:8px">${S.fmt.escape(S.t("common.retry"))}</button></div>`;
      const rb = el.querySelector("#pye-retry");
      if (rb) rb.onclick = () => { rb.disabled = true; render(); };
      return;
    }
    cache = r.data?.payees ?? [];
    // 存量数据里的分组标签是简中；显示时经 i18n 映射（未收录的标签原样展示）
    const GROUP_KEY = { "家人": "family", "朋友": "friends", "同事": "colleague", "生活缴费": "life", "其他": "other", "房东": "landlord", "工作": "work", "默认": "default" };
    const gLabel = (g) => { const k = GROUP_KEY[g]; return k ? S.t("payees.group." + k) : g; };
    const groups = {};
    for (const p of r.data?.payees ?? []) (groups[p.group_label ?? S.t("payees.group.default")] ??= []).push(p);
    const TINTS = ["teal", "orange", "violet", "gold", "rose", "sky"];
    let gi = 0;
    el.innerHTML = Object.entries(groups).map(([g, list]) => {
      const tint = TINTS[gi++ % TINTS.length];
      return `
      <div class="pye-group"><span class="pye-gh bg-tint-${tint}">${S.fmt.escape(gLabel(g))}</span></div>
      ${list.map((p) => `
      <div class="list-row pye-row${p.pinned ? " pye-pinned" : ""}">
        <span class="payee-ava pye-ava bg-tint-${tint}">${S.fmt.escape(p.name.slice(0, 1))}</span>
        <div class="grow"><b>${S.fmt.escape(p.name)}</b>${p.pinned ? ` ${S.ui.badge(S.t("payees.pinned"), "badge-navy")}` : ""}<div class="muted small mono">${S.fmt.escape(p.account ?? "—")}</div>
          ${(p.phone || p.email) ? `<div class="muted small">${p.phone ? "+86 " + String(p.phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1 **** $2") : ""}${p.phone && p.email ? " · " : ""}${p.email ? S.fmt.escape(maskEmail(p.email)) : ""}</div>` : ""}</div>
        ${p.verified === false ? S.ui.badge(S.t("payees.unverified"), "badge-gray") : ""}
        ${p.contact_ok === false ? S.ui.badge(S.t("payees.contactStale"), "badge-yellow") : ""}
        <span class="pye-ops">
          <button class="bc-btn pin" data-id="${p.id}" data-pinned="${p.pinned ? 1 : 0}" title="${S.fmt.escape(S.t(p.pinned ? "payees.unpin" : "payees.pin"))}">${S.ui.icon(p.pinned ? "pin-off" : "pin", 13)}</button>
          <button class="bc-btn view" data-id="${p.id}" title="${S.fmt.escape(S.t("payees.view"))}">${S.ui.icon("eye", 13)}</button>
          <button class="bc-btn edt" data-id="${p.id}" title="${S.fmt.escape(S.t("payees.edit"))}">${S.ui.icon("edit", 13)}</button>
          <button class="btn btn-sm btn-light go" data-id="${p.id}" ${p.verified === false ? "disabled title=" + S.fmt.escape(S.t("payees.unverified")) : ""}>${S.ui.icon("send", 12)} ${S.fmt.escape(S.t("payees.transfer"))}</button>
          <button class="bc-btn del" data-id="${p.id}" title="${S.fmt.escape(S.t("common.delete"))}">${S.ui.icon("x", 13)}</button>
        </span>
      </div>`).join("")}`;}).join("") || S.ui.empty(S.t("common.noData"));
    S.ui.$$(".go").forEach((b) => { b.onclick = () => (location.href = `/transfer/intrabank?payee=${b.dataset.id}`); });
    /* 第一百一十六轮：置顶（轻量路由直改，多选允许——即时重渲染排序） */
    S.ui.$$(".pye-ops .pin").forEach((b) => {
      b.onclick = async () => {
        const pinned = b.dataset.pinned === "1";
        const r = await S.api.post("/api/payees/pin", { id: Number(b.dataset.id), action: pinned ? "unpin" : "pin" });
        if (r.ok) { S.ui.toast(S.t("common.opOk")); render(); }
        else S.ui.toast(S.fmt.blockedMsg(r), true);
      };
    });
    /* 第一百一十六轮：查看弹窗——姓名/账号/手机号/Email 完整明文 + 每项复制按钮 */
    S.ui.$$(".pye-ops .view").forEach((b) => {
      b.onclick = () => {
        const p2 = (cache ?? []).find((x) => String(x.id) === b.dataset.id);
        if (!p2) return;
        /* 第一百一十八轮：复制钮改内联——紧随真值末字符同水平线（原 far-right 对齐视觉割裂），容器收紧 */
        const copyRow = (label, val, mono = true) => !val ? "" : `
          <div class="pye-view-row">
            <span class="muted small">${S.fmt.escape(label)}</span>
            <div class="${mono ? "mono" : ""}" style="word-break:break-all">${S.fmt.escape(val)}<button class="bc-btn pye-cp" data-cp="${S.fmt.escape(val)}" title="${S.fmt.escape(S.t("payees.copy"))}">${S.ui.icon("copy", 12)}</button></div>
          </div>`;
        const mv = S.ui.modal(`<h2>${S.fmt.escape(S.t("payees.view"))}</h2>
          ${copyRow(S.t("transfer.toName"), p2.name, false)}
          ${copyRow(S.t("payees.accountNo"), p2.account)}
          ${copyRow(S.t("payees.phone"), p2.phone ? "+86 " + p2.phone : null)}
          ${copyRow(S.t("payees.emailF", "Email"), p2.email)}
          <div class="modal-actions"><button class="btn btn-primary" id="pv-x">${S.fmt.escape(S.t("common.close"))}</button></div>`);
        mv.el.querySelector("#pv-x").onclick = mv.close;
        mv.el.querySelectorAll(".pye-cp").forEach((btn) => {
          btn.onclick = async () => {
            try { await navigator.clipboard.writeText(btn.dataset.cp); S.ui.toast(S.t("payees.copied")); }
            catch { S.ui.toast(S.t("common.opFail"), true); }
          };
        });
      };
    });
    S.ui.$$(".edt").forEach((b) => {
      b.onclick = () => {
        const p = (cache ?? []).find((x) => String(x.id) === b.dataset.id);
        if (!p) return;
        const m2 = S.ui.modal(`<h2>${S.fmt.escape(S.t("payees.edit"))}</h2>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("transfer.toName"))}</span><input class="input" id="e-name" value="${S.fmt.escape(p.name)}"></label>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("payees.accountNo"))}</span><input class="input mono" id="e-acct" value="${S.fmt.escape(p.account ?? "")}" maxlength="16"></label>
          <div class="field-hint ph-hint" style="font-size:var(--fs-12);margin-top:1px">${S.fmt.escape(S.t("payees.hintReal"))}</div>
          <p class="muted small" id="e-note" style="margin:6px 0 0" hidden></p>
          <label class="field" style="margin-top:6px"><span class="lb">${S.fmt.escape(S.t("payees.phone"))} <span class="muted small">${S.fmt.escape(S.t("ph.optional"))}</span></span>
            <div class="row" style="gap:8px"><span class="input ph-cc">+86</span><input class="input grow mono ph-locked" id="e-phone" value="${S.fmt.escape(p.phone ?? "")}" maxlength="13" inputmode="numeric" readonly aria-disabled="true"></div>
            <p class="muted small" id="e-phone-note" style="margin:4px 0 0" hidden></p></label>
          <label class="field"><span class="lb">${S.fmt.escape(S.t("payees.emailF", "Email"))} <span class="muted small">${S.fmt.escape(S.t("ph.optional"))}</span></span>
            <input class="input ph-locked" id="e-email" type="email" value="${S.fmt.escape(p.email ?? "")}" readonly aria-disabled="true">
            <p class="muted small" id="e-email-note" style="margin:4px 0 0" hidden></p></label>
          <div class="modal-actions"><button class="btn btn-ghost" id="e-x">${S.fmt.escape(S.t("common.cancel"))}</button>
          <button class="btn btn-primary" id="e-ok">${S.fmt.escape(S.t("common.save"))}</button></div>`);
        /* 与新增同款状态机（简化版：解锁前禁编辑联系方式） */
        const en2 = m2.el.querySelector("#e-note"), pn2 = m2.el.querySelector("#e-phone-note"), em2 = m2.el.querySelector("#e-email-note");
        const ph2 = m2.el.querySelector("#e-phone"), em2i = m2.el.querySelector("#e-email");
        const nm2 = m2.el.querySelector("#e-name"), ac2 = m2.el.querySelector("#e-acct");
        const st2 = { unlocked: false, vn: "", va: "", phoneOk: p.contact_ok === true || !p.phone ? (p.phone ? true : null) : false, emailOk: p.contact_ok === true || !p.email ? (p.email ? true : null) : false };
        const setN2 = (el, t2, c2) => { if (!el) return; el.hidden = !t2; el.textContent = t2 ?? ""; el.style.color = c2 ?? ""; };
        const setLk2 = (inp, on) => { inp.readOnly = on; inp.classList.toggle("ph-locked", on); inp.setAttribute("aria-disabled", on ? "true" : "false"); };
        const lock2 = () => { st2.unlocked = false; setLk2(ph2, true); setLk2(em2i, true); ph2.value = ""; em2i.value = ""; st2.phoneOk = null; st2.emailOk = null; setN2(pn2, "", ""); setN2(em2, "", ""); };
        [ph2, em2i].forEach((inp) => {
          let lastH2 = 0;
          inp.addEventListener("focus", () => {
            if (st2.unlocked) return;
            inp.blur();
            const now = Date.now();
            if (now - lastH2 < 400) return;
            lastH2 = now;
            S.ui.toast(S.t("payees.lockHint"), true);
          });
        });
        const tryU2 = async () => {
          const n2 = nm2.value.trim(), a2 = ac2.value.replace(/\s/g, "");
          if (!n2 || !/^\d{16}$/.test(a2)) { if (st2.unlocked) lock2(); return; }
          setN2(en2, S.t("payees.identityChecking"), "");
          const r = await S.api.post("/api/payees/verify-contact", { name: n2, account: a2 });
          if (!r.ok) { setN2(en2, "", ""); return; }
          if (r.data?.identity) {
            if (!st2.unlocked) { st2.unlocked = true; st2.vn = n2; st2.va = a2; setLk2(ph2, false); setLk2(em2i, false); setN2(en2, S.t("payees.identityOk"), "#1F7A14");
              if (p.phone && p.contact_ok !== false) { ph2.value = p.phone; st2.phoneOk = true; }
              if (p.email && p.contact_ok !== false) { em2i.value = p.email; st2.emailOk = true; } }
          } else { if (st2.unlocked) lock2(); setN2(en2, S.t("payees.identityBad"), "#C0392B"); }
        };
        let ut2 = null;
        [nm2, ac2].forEach((inp) => inp.addEventListener("input", () => {
          if (st2.unlocked && (nm2.value.trim() !== st2.vn || ac2.value.replace(/\s/g, "") !== st2.va)) lock2();
          clearTimeout(ut2); ut2 = setTimeout(tryU2, 450);
        }));
        ac2.addEventListener("blur", tryU2); nm2.addEventListener("blur", tryU2); tryU2();
        const attachV2 = (inp, note, key) => {
          inp.addEventListener("blur", async () => {
            if (!st2.unlocked) return;
            const v = inp.value.trim();
            if (!v) { st2[key] = null; setN2(note, "", ""); return; }
            setN2(note, S.t("payees.checking"), "");
            const r = await S.api.post("/api/payees/verify-contact", { name: nm2.value.trim(), account: ac2.value.replace(/\s/g, ""), contact: v });
            if (!r.ok || !r.data?.identity) return;
            const ok = r.data.contact === "MATCHED";
            st2[key] = ok;
            setN2(note, ok ? S.t("payees.contactOk") : S.t("payees.contactBad"), ok ? "#1F7A14" : "#8a5a10");
          });
        };
        attachV2(ph2, pn2, "phoneOk"); attachV2(em2i, em2, "emailOk");
        m2.el.querySelector("#e-x").onclick = m2.close;
        m2.el.querySelector("#e-ok").onclick = async () => {
          const phv = ph2.value.replace(/\D/g, "").slice(0, 11) || "";
          const emv = em2i.value.trim() || "";
          if ((phv && st2.phoneOk !== true) || (emv && st2.emailOk !== true)) { S.ui.toast(S.t("payees.contactBad"), true); return; }
          const r = await S.api.mutate(`/api/payees/${p.id}`, { name: nm2.value.trim() || p.name, account: ac2.value.replace(/\s/g, "") || p.account, phone: phv, email: emv }, { method: "PATCH" });
          if (r.cancelled) return;
          if (r.data?.status === "EXECUTED") { m2.close(); S.ui.toast(S.t("common.opOk")); render(); }
          else S.ui.toast(S.fmt.blockedMsg(r), true);
        };
      };
    });
    S.ui.$$(".del").forEach((b) => {
      b.onclick = async () => {
        S.ui.btnBusy(b, true); /* 删除按钮 loading（第六十一轮） */
        try {
          /* DELETE 路由（非 POST）：显式传 method，否则首段 501、确认卡流程走不通 */
          const r2 = await S.api.mutate(`/api/payees/${b.dataset.id}`, {}, { method: "DELETE" });
          if (r2.cancelled) return;
          if (r2.data?.status === "EXECUTED") { S.ui.toast(S.t("common.opOk")); render(); }
          else S.ui.toast(S.fmt.blockedMsg(r2), true);
        } finally {
          S.ui.btnBusy(b, false);
        }
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
      <div class="field-hint ph-hint">${S.fmt.escape(S.t("payees.hintReal"))}</div>
      <p class="muted small" id="p-contact-note" style="margin:6px 0 0" hidden></p>
      <label class="field" style="margin-top:6px"><span class="lb">${S.fmt.escape(S.t("payees.phone"))} <span class="muted small">${S.fmt.escape(S.t("ph.optional"))}</span></span>
        <div class="row" style="gap:8px"><span class="input ph-cc">+86</span><input class="input grow mono ph-locked" id="p-phone" placeholder="138 1234 5678" maxlength="13" inputmode="numeric" readonly aria-disabled="true"></div>
        <p class="muted small" id="p-phone-note" style="margin:4px 0 0" hidden></p></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("payees.emailF", "Email"))} <span class="muted small">${S.fmt.escape(S.t("ph.optional"))}</span></span>
        <div class="row" style="gap:8px;position:relative"><input class="input grow ph-locked" id="p-email" type="email" autocomplete="off" readonly aria-disabled="true" placeholder="name@example.com" style="padding-right:30px">
        <span class="ph-check" id="p-email-check" style="position:absolute;right:8px;top:50%;transform:translateY(-50%)"></span></div>
        <p class="muted small" id="p-email-note" style="margin:4px 0 0" hidden></p></label>
      <label class="field" style="margin-top:14px"><span class="lb">${S.fmt.escape(S.t("payees.group"))}</span>
        <span id="p-group"></span>
        <input class="input" id="p-group-custom" maxlength="12" placeholder="${S.fmt.escape(S.t("payees.groupCustomPh"))}" style="display:none;margin-top:8px"></label>
      <div class="modal-actions"><button class="btn btn-ghost" id="cx">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-primary" id="ok">${S.fmt.escape(S.t("common.add"))}</button></div>`);
    /* 第一百一十轮：分步解锁 + 从属三态核验（防联系方式枚举查人——查人能力绑定"已掌握姓名+卡号"）。
     * 状态机：姓名/卡号核验通过（identity:true）→ 解锁 phone/email；之后任一改动 → 清空+重锁。
     * 联系样式：MATCHED=绿；UNMATCHED（不存在或属他人同文案防枚举）=琥珀。 */
    const noteEl = m.el.querySelector("#p-contact-note");
    const phoneInp = m.el.querySelector("#p-phone"), emailInp = m.el.querySelector("#p-email");
    const phoneNote = m.el.querySelector("#p-phone-note"), emailNote = m.el.querySelector("#p-email-note");
    const nameInp = m.el.querySelector("#p-name"), acctInp = m.el.querySelector("#p-acct");
    const state = { unlocked: false, verifiedName: "", verifiedAcct: "", phoneOk: null, emailOk: null };
    const setNote = (el, text, color) => { if (!el) return; el.hidden = !text; el.textContent = text ?? ""; el.style.color = color ?? ""; };
    const setLocked = (inp, on) => { inp.readOnly = on; inp.classList.toggle("ph-locked", on); inp.setAttribute("aria-disabled", on ? "true" : "false"); };
    const lockContacts = (quiet) => {
      state.unlocked = false; state.phoneOk = null; state.emailOk = null;
      setLocked(phoneInp, true); setLocked(emailInp, true);
      phoneInp.value = ""; emailInp.value = "";
      setNote(phoneNote, "", ""); setNote(emailNote, "", "");
      const bd = m.el.querySelector("#p-email-check"); if (bd) bd.innerHTML = "";
      if (!quiet) { setNote(noteEl, S.t("payees.relocked"), "#8a5a10"); }
    };
    const tryUnlock = async () => {
      const name = nameInp.value.trim(), acct = acctInp.value.replace(/\s/g, "");
      if (!name || !/^\d{16}$/.test(acct)) { if (state.unlocked) lockContacts(false); return; }
      setNote(noteEl, S.t("payees.identityChecking"), "");
      const r = await S.api.post("/api/payees/verify-contact", { name, account: acct });
      if (!r.ok) { setNote(noteEl, "", ""); return; }
      if (r.data?.identity) {
        if (!state.unlocked) {
          state.unlocked = true; state.verifiedName = name; state.verifiedAcct = acct;
          setLocked(phoneInp, false); setLocked(emailInp, false);
          setNote(noteEl, S.t("payees.identityOk"), "#1F7A14");
        }
      } else {
        if (state.unlocked) lockContacts(true);
        setNote(noteEl, S.t("payees.identityBad"), "#C0392B");
      }
    };
    let unlockTimer = null;
    [nameInp, acctInp].forEach((inp) => inp.addEventListener("input", () => {
      if (state.unlocked && (nameInp.value.trim() !== state.verifiedName || acctInp.value.replace(/\s/g, "") !== state.verifiedAcct)) lockContacts(false);
      clearTimeout(unlockTimer); unlockTimer = setTimeout(tryUnlock, 450);
    }));
    acctInp.addEventListener("blur", tryUnlock); nameInp.addEventListener("blur", tryUnlock);
    /* 第一百一十四轮：一次点击只弹一个——click 会先派发 focus（两监听双弹根因），
     * 改单 focus 监听（键盘 Tab 聚焦也覆盖）+ 400ms 去重闸防边角双触发 */
    [phoneInp, emailInp].forEach((inp) => {
      let lastHint = 0;
      inp.addEventListener("focus", () => {
        if (state.unlocked) return;
        inp.blur();
        const now = Date.now();
        if (now - lastHint < 400) return;
        lastHint = now;
        S.ui.toast(S.t("payees.lockHint"), true);
      });
    });
    const attachVerify = (inp, note, key) => {
      inp.addEventListener("blur", async () => {
        if (!state.unlocked) return;
        const v = inp.value.trim();
        if (!v) { state[key] = null; setNote(note, "", ""); return; }
        setNote(note, S.t("payees.checking"), "");
        const r = await S.api.post("/api/payees/verify-contact", { name: nameInp.value.trim(), account: acctInp.value.replace(/\s/g, ""), contact: v });
        if (!r.ok || !r.data?.identity) return;
        const ok = r.data.contact === "MATCHED";
        state[key] = ok;
        setNote(note, ok ? S.t("payees.contactOk") : S.t("payees.contactBad"), ok ? "#1F7A14" : "#8a5a10");
      });
    };
    attachVerify(phoneInp, phoneNote, "phoneOk");
    attachVerify(emailInp, emailNote, "emailOk");
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
      const phone = (m.el.querySelector("#p-phone").value.replace(/\D/g, "") || "").slice(0, 11);
      /* 手机号可选：填了才校验（1 开头 11 位），与服务端 INVALID_PHONE 同口径 */
      if (phone && !/^1\d{10}$/.test(phone)) { S.ui.toast(S.t("payees.badPhone"), true); return; }
      const phoneV = phone || null;
      const emailV = (emailInp?.value.trim() ?? "") || null;
      /* 第一百一十轮：联系方式非空必须三态核验通过（MATCHED）才可保存；空=可选项可空 */
      if ((phoneV && state.phoneOk !== true) || (emailV && state.emailOk !== true)) { S.ui.toast(S.t("payees.contactBad"), true); return; }
      const body = { name: nameInp.value.trim(), account: acctInp.value.replace(/\s/g, ""), group_label: group, ...(phoneV ? { phone: phoneV } : {}), ...(emailV ? { email: emailV } : {}) };
      if (!body.name || !/^\d{16}$/.test(body.account)) { S.ui.toast(S.t("transfer.invalidAccount"), true); return; }
      const okBtn = m.el.querySelector("#ok");
      S.ui.btnBusy(okBtn, true); /* 添加按钮 loading（第六十一轮） */
      try {
        const r2 = await S.api.mutate("/api/payees", body);
        if (r2.cancelled) return;
        if (r2.data?.status === "EXECUTED") { m.close(); S.ui.toast(S.t("common.opOk")); render(); }
        else S.ui.toast(tgtErr(r2.data?.reason ?? r2.data?.error?.code) ?? S.fmt.blockedMsg(r2), true);
      } finally {
        S.ui.btnBusy(okBtn, false);
      }
    };
  };
  render();
  /* /pay 添加卡直达：带 ?add=1 进入时自动弹出添加收款人表单 */
  if (new URLSearchParams(location.search).get("add") === "1") document.getElementById("add")?.click();
});
