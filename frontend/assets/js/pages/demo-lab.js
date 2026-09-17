/* demo-lab.js — 队员隐藏数据入口（密码门 + 数据源自查 + 自助灌入）
   服务端真门：DEMO_MODE + 登录态（只能灌自己账户）；前端密码仅是入口遮罩，非安全边界。 */
S.router.register("demo-lab", async ({ user }) => {
  if (!user) { location.replace("/account/login?next=/demo-lab"); return; }
  const c = document.getElementById("content");
  const UNLOCK_KEY = "suveoo.demoLabUnlocked";

  const renderLock = () => {
    c.innerHTML = `
      <div class="dl-hero">
        <div class="dl-badge">${S.ui.icon("shield", 14)} Suveoo Data Lab</div>
        <h1>${S.fmt.escape(S.t("demoLab.title"))}</h1>
        <p class="muted">${S.fmt.escape(S.t("demoLab.sub"))}</p>
      </div>
      <div class="card dl-lock" style="max-width:460px;margin:0 auto">
        <label class="field"><span class="lb">${S.fmt.escape(S.t("demoLab.passLabel"))}</span>
          <div class="pw-wrap"><input class="input mono" id="dl-pass" type="password" autocomplete="off">
          <button class="pw-eye" id="dl-eye">${S.ui.icon("eye", 18)}</button></div></label>
        <button class="btn btn-primary btn-block" id="dl-go">${S.ui.icon("lock", 14)} ${S.fmt.escape(S.t("demoLab.unlock"))}</button>
        <p class="muted small" style="margin-top:10px">${S.fmt.escape(S.t("demoLab.passHint"))}</p>
      </div>`;
    const pass = document.getElementById("dl-pass");
    const eye = document.getElementById("dl-eye");
    eye.onclick = () => { const show = pass.type === "password"; pass.type = show ? "text" : "password"; eye.innerHTML = S.ui.icon(show ? "eye-off" : "eye", 18); };
    const tryUnlock = () => {
      if (pass.value.trim() === "suveoo_data_injection") { sessionStorage.setItem(UNLOCK_KEY, "1"); renderMain(); }
      else { S.ui.toast(S.t("demoLab.wrongPass"), true); pass.value = ""; pass.focus(); }
    };
    document.getElementById("dl-go").onclick = tryUnlock;
    pass.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    pass.focus();
  };

  const renderMain = () => {
    c.innerHTML = `
      <div class="dl-hero">
        <div class="dl-badge">${S.ui.icon("shield", 14)} Suveoo Data Lab</div>
        <h1>${S.fmt.escape(S.t("demoLab.title"))}</h1>
        <p class="muted">${S.fmt.escape(user.email)}</p>
      </div>
      <div class="card" id="dl-src">${S.ui.skeleton(3)}</div>
      <div class="card" id="dl-doc"></div>
      <div class="card" id="dl-run">${S.ui.skeleton(2)}</div>`;
    (async () => {
      /* 数据源预检：每次打开页面实时拉取——数据源更新后版本号与清单随之变化（自查机制） */
      const r = await S.api.get("/api/demo/self-seed");
      const srcBox = document.getElementById("dl-src");
      if (!r.ok) { srcBox.innerHTML = `<h2>${S.fmt.escape(S.t("demoLab.srcTitle"))}</h2><div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("x", 14)} ${S.fmt.escape(r.data?.error?.message ?? S.t("common.loadFailed"))}</div>`; return; }
      const d = r.data;
      srcBox.innerHTML = `
        <div class="row between" style="flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">${S.ui.icon("list", 16)} ${S.fmt.escape(S.t("demoLab.srcTitle"))}</h2>
          <span class="badge badge-navy mono">${S.fmt.escape(S.t("demoLab.version"))} ${S.fmt.escape(d.seed_version)}</span>
        </div>
        ${(d.designated_missing ?? []).length ? `<div class="banner" style="background:#fff7e6;color:#9a6700;margin-top:8px">${S.ui.icon("info", 14)}<div>${S.fmt.escape(S.t("demoLab.missingDesignated"))}：${(d.designated_missing ?? []).map((e) => S.fmt.escape(e)).join("、")}</div></div>` : ""}
        <p class="small muted" style="margin:10px 0 6px">${S.fmt.escape(S.t("demoLab.payeeCount", d.payee_count))} · ${S.fmt.escape(S.t("demoLab.estimate", d.estimate.txs, d.estimate.bills, d.estimate.subscriptions, d.estimate.holdings, d.estimate.tasks))}</p>
        <div class="dl-payees">${(d.payee_source ?? []).map((p) => `
          <div class="dl-payee${p.realism === "low" ? " low" : ""}">
            <span class="avatar">${S.fmt.escape(String(p.name).slice(0, 1))}</span>
            <div class="grow"><b>${S.fmt.escape(p.name)}</b><div class="muted small mono">${S.fmt.escape(p.account_masked)}</div></div>
            ${S.ui.badge(p.group, p.realism === "low" ? "badge-gray" : "badge-green")}
          </div>`).join("")}</div>`;
      document.getElementById("dl-doc").innerHTML = `
        <h2>${S.ui.icon("info", 16)} ${S.fmt.escape(S.t("demoLab.docTitle"))}</h2>
        <ul class="help-ul" style="margin-top:8px">
          <li><b>${S.fmt.escape(S.t("demoLab.docRealTitle"))}</b> — ${S.fmt.escape(S.t("demoLab.docReal"))}</li>
          <li><b>${S.fmt.escape(S.t("demoLab.docIdemTitle"))}</b> — ${S.fmt.escape(S.t("demoLab.docIdem"))}</li>
          <li><b>${S.fmt.escape(S.t("demoLab.docAtomicTitle"))}</b> — ${S.fmt.escape(S.t("demoLab.docAtomic"))}</li>
          <li><b>${S.fmt.escape(S.t("demoLab.docScopeTitle"))}</b> — ${S.fmt.escape(S.t("demoLab.docScope"))}</li>
          <li><b>${S.fmt.escape(S.t("demoLab.docUsageTitle"))}</b> — ${S.fmt.escape(S.t("demoLab.docUsage"))}</li>
        </ul>`;
      const runBox = document.getElementById("dl-run");
      runBox.innerHTML = `
        <h2>${S.ui.icon("gear", 16)} ${S.fmt.escape(S.t("demoLab.runTitle"))}</h2>
        <p class="small muted">${S.fmt.escape(S.t("demoLab.runNote"))}</p>
        <button class="btn btn-primary btn-block" id="dl-exec" style="margin-top:10px">${S.ui.icon("send", 14)} ${S.fmt.escape(S.t("demoLab.exec"))}</button>
        <div id="dl-result" style="margin-top:14px"></div>`;
      document.getElementById("dl-exec").onclick = async () => {
        const btn = document.getElementById("dl-exec");
        btn.disabled = true;
        btn.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> ${S.fmt.escape(S.t("demoLab.running"))}`;
        const t0 = Date.now();
        const res = await S.api.post("/api/demo/self-seed", {});
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        btn.disabled = false;
        btn.innerHTML = `${S.ui.icon("send", 14)} ${S.fmt.escape(S.t("demoLab.execAgain"))}`;
        const out = document.getElementById("dl-result");
        if (!res.ok) {
          out.innerHTML = `<div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("x", 14)}<div>${S.fmt.escape(res.data?.error?.message ?? "failed")} · ${S.fmt.escape(S.t("demoLab.retryHint"))}</div></div>`;
          return;
        }
        const v = res.data.verification ?? {};
        const rowOk = v.payees_expected === v.payees_actual && v.payees_all_real;
        out.innerHTML = `
          <div class="banner" style="background:var(--color-green-bg, #ecfdf3);color:#067647">${S.ui.icon("check", 14)}<div><b>${S.fmt.escape(S.t("demoLab.done", secs))}</b></div></div>
          <div class="dl-verify">
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vPayees"))}</span><span class="v">${S.fmt.escape(String(v.payees_actual ?? "—"))} / ${S.fmt.escape(String(v.payees_expected ?? "—"))}</span></div>
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vReal"))}</span><span class="v">${v.payees_all_real ? `✓ ${S.fmt.escape(S.t("demoLab.vRealOk"))}` : "✗"}</span></div>
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vTxs"))}</span><span class="v mono">${S.fmt.escape(String(res.data.tx_count ?? "—"))}</span></div>
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vBills"))}</span><span class="v mono">${S.fmt.escape(String(res.data.bills ?? "—"))}</span></div>
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vSubs"))}</span><span class="v mono">${S.fmt.escape(String(res.data.subscriptions ?? "—"))}</span></div>
            <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vTasks"))}</span><span class="v mono">${S.fmt.escape(String(res.data.tasks ?? "—"))}</span></div>
          </div>
          ${rowOk ? "" : `<div class="banner" style="background:#fff7e6;color:#9a6700;margin-top:8px">${S.ui.icon("info", 14)}<div>${S.fmt.escape(S.t("demoLab.mismatch"))}</div></div>`}
          <a class="btn btn-ghost btn-block" style="margin-top:10px" href="/account/transactions">${S.fmt.escape(S.t("demoLab.viewTx"))} →</a>`;
      };
    })();
  };

  sessionStorage.getItem(UNLOCK_KEY) === "1" ? renderMain() : renderLock();
});
