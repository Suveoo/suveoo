/* demo-lab.js — 队员隐藏数据入口（密码门 + 维度化拟真注入 + 数据源自查 + 预检/运行/核对）
   服务端真门：DEMO_MODE + 登录态（只能灌自己账户）；前端密码仅是入口遮罩，非安全边界。
   第三十五轮：四个正交维度（财富×薪资×职业×企业）+ 三种覆盖模式（覆盖/合并/自定义块勾选）。 */
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
      <div class="card" id="dl-dim">${S.ui.skeleton(3)}</div>
      <div class="card" id="dl-src">${S.ui.skeleton(3)}</div>
      <div class="card" id="dl-doc"></div>
      <div class="card" id="dl-run">${S.ui.skeleton(2)}</div>`;
    (async () => {
      /* 数据源预检：每次打开页面实时拉取——数据源更新后版本号与清单随之变化（自查机制）；
         catalog 携带维度目录（90 职业按类目）。
         带时间戳参数绕开 SW/HTTP 缓存（旧形状响应无 catalog 会让渲染中断——部署陈旧坑实测复现） */
      let r = await S.api.get(`/api/demo/self-seed?_=${Date.now()}`);
      if (r.ok && !r.data?.catalog) r = await S.api.get(`/api/demo/self-seed?_=${Date.now()}&r=2`);
      const dimBox = document.getElementById("dl-dim");
      const srcBox = document.getElementById("dl-src");
      if (!r.ok || !r.data?.catalog) {
        dimBox.remove();
        srcBox.innerHTML = `<h2>${S.fmt.escape(S.t("demoLab.srcTitle"))}</h2><div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("x", 14)} ${S.fmt.escape(r.data?.error?.message ?? S.t("common.loadFailed"))}</div>`;
        return;
      }
      const d = r.data;
      const cat = d.catalog;

      /* ---- 维度状态 ---- */
      const state = { tier: "affluent", income: "salaried", profession: "software-engineer", enterprise: null, mode: "overwrite", blocks: { txs: true, payees: true, bills: true, subs: true, holdings: true, tasks: true, notifs: true, fx: true, credit: true, goals: true } };
      let before = null; /* 预检时的当前库计数（核对对照用） */

      const optCards = (items, key, { nullable = false } = {}) => `
        <div class="dl-dim-grid ${items.length > 3 ? "cols2" : ""}">
          ${nullable ? `<button type="button" class="dl-opt-card${state[key] === null ? " on" : ""}" data-k="${key}" data-v=""><span class="dl-opt-t">${S.fmt.escape(S.t("demoLab.entNone"))}</span><span class="dl-opt-d">${S.fmt.escape(S.t("demoLab.entNoneDesc"))}</span></button>` : ""}
          ${items.map((it) => `
          <button type="button" class="dl-opt-card${String(state[key]) === it.id ? " on" : ""}" data-k="${key}" data-v="${it.id}">
            <span class="dl-opt-t">${S.fmt.escape(it.label)}</span>
            <span class="dl-opt-d">${S.fmt.escape(S.t(`demoLab.${key}.${it.id}`))}</span>
          </button>`).join("")}
        </div>`;

      dimBox.innerHTML = `
        <div class="row between" style="flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">${S.ui.icon("scale", 16)} ${S.fmt.escape(S.t("demoLab.dimTitle"))}</h2>
          <span class="badge badge-navy">${S.fmt.escape(S.t("demoLab.dimSub"))}</span>
        </div>
        <div class="dl-sec"><div class="dl-sec-lb">${S.fmt.escape(S.t("demoLab.tierLabel"))}</div>${optCards(cat.tiers, "tier")}</div>
        <div class="dl-sec"><div class="dl-sec-lb">${S.fmt.escape(S.t("demoLab.incomeLabel"))}</div>${optCards(cat.incomes, "income")}</div>
        <div class="dl-sec"><div class="dl-sec-lb">${S.fmt.escape(S.t("demoLab.profLabel"))}</div><div id="dl-prof" class="dl-prof-select"></div>
          <p class="small muted" style="margin:6px 0 0" id="dl-prof-note"></p></div>
        <div class="dl-sec"><div class="dl-sec-lb">${S.fmt.escape(S.t("demoLab.entLabel"))}</div>${optCards(cat.enterprises, "enterprise", { nullable: true })}</div>
        <div class="dl-sec"><div class="dl-sec-lb">${S.fmt.escape(S.t("demoLab.modeLabel"))}</div>${optCards([{ id: "overwrite" }, { id: "merge" }, { id: "custom" }].map((m) => ({ ...m, label: S.t(`demoLab.mode.${m.id}.t`) })), "mode")}
          <div id="dl-blocks" hidden>
            <div class="dl-sec-lb" style="margin-top:10px">${S.fmt.escape(S.t("demoLab.blockLabel"))}</div>
            <div class="dl-blocks">
              ${["txs", "payees", "bills", "subs", "holdings", "tasks", "notifs", "fx", "credit", "goals"].map((b) => `
              <label class="dl-block"><input type="checkbox" data-b="${b}" checked> ${S.fmt.escape(S.t(`demoLab.block.${b}`))}</label>`).join("")}
            </div>
          </div>
        </div>`;
      /* 修正 mode 卡片文案键（t/d 分离） */
      dimBox.querySelectorAll('[data-k="mode"]').forEach((el) => {
        const v = el.dataset.v;
        el.querySelector(".dl-opt-t").textContent = S.t(`demoLab.mode.${v}.t`);
        el.querySelector(".dl-opt-d").textContent = S.t(`demoLab.mode.${v}.d`);
      });

      /* 职业下拉（90 项按类目分组；body 挂载长列表滚动） */
      const byCat = new Map();
      for (const p of cat.professions) { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); }
      const profOptions = [];
      for (const [catName, list] of byCat) {
        profOptions.push({ v: `__hdr_${catName}`, label: catName, header: true });
        for (const p of list) profOptions.push({ v: p.id, label: p.name });
      }
      const profSel = S.ctl.select({ label: S.t("demoLab.profLabel"), options: profOptions, value: state.profession, onChange: (v) => { state.profession = v; renderProfNote(); refreshPreview(); } });
      document.getElementById("dl-prof").append(profSel);
      const renderProfNote = () => {
        const p = cat.professions.find((x) => x.id === state.profession);
        document.getElementById("dl-prof-note").textContent = p ? `${p.cat} · ${S.t("demoLab.profNote", cat.professions.length)}` : "";
      };
      renderProfNote();

      /* 选项卡交互 */
      dimBox.addEventListener("click", (e) => {
        const el = e.target.closest(".dl-opt-card");
        if (!el) return;
        const k = el.dataset.k, v = el.dataset.v || null;
        state[k] = v;
        dimBox.querySelectorAll(`.dl-opt-card[data-k="${k}"]`).forEach((x) => x.classList.toggle("on", x === el));
        if (k === "mode") document.getElementById("dl-blocks").hidden = v !== "custom";
        refreshPreview();
      });
      dimBox.querySelectorAll(".dl-block input").forEach((cb) => { cb.addEventListener("change", () => { state.blocks[cb.dataset.b] = cb.checked; }); });

      /* ---- 数据源状态卡（保留既有自查） ---- */
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

      /* ---- 使用说明（保留） ---- */
      document.getElementById("dl-doc").innerHTML = `
        <h2>${S.ui.icon("info", 16)} ${S.fmt.escape(S.t("demoLab.docTitle"))}</h2>
        <div class="dl-doc">
          ${[
            ["users", "demoLab.docRealTitle", "demoLab.docReal"],
            ["check", "demoLab.docIdemTitle", "demoLab.docIdem"],
            ["shield", "demoLab.docAtomicTitle", "demoLab.docAtomic"],
            ["lock", "demoLab.docScopeTitle", "demoLab.docScope"],
            ["clock", "demoLab.docUsageTitle", "demoLab.docUsage"],
          ].map(([ic, tk, bk]) => `
          <div class="dl-doc-item">
            <div class="dl-doc-t">${S.ui.icon(ic, 15)} ${S.fmt.escape(S.t(tk))}</div>
            <p class="dl-doc-b">${S.fmt.escape(S.t(bk))}</p>
          </div>`).join("")}
        </div>`;

      /* ---- 预检 + 运行 ---- */
      const runBox = document.getElementById("dl-run");
      runBox.innerHTML = `
        <h2>${S.ui.icon("gear", 16)} ${S.fmt.escape(S.t("demoLab.runTitle"))}</h2>
        <p class="small muted">${S.fmt.escape(S.t("demoLab.runNoteDim"))}</p>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-light" id="dl-prev">${S.ui.icon("eye", 14)} ${S.fmt.escape(S.t("demoLab.preview"))}</button>
          <button class="btn btn-primary" id="dl-exec">${S.ui.icon("send", 14)} ${S.fmt.escape(S.t("demoLab.execDim"))}</button>
          <button class="btn btn-ghost" id="dl-classic">${S.fmt.escape(S.t("demoLab.execClassic"))}</button>
        </div>
        <div id="dl-prevout" style="margin-top:14px"></div>
        <div id="dl-result" style="margin-top:14px"></div>`;

      const fmtCents = (s) => { try { return S.fmt.moneyPlain ? S.fmt.moneyPlain((Number(s) / 100).toFixed(2)) : String(s); } catch { return String(s); } };
      const previewQ = () => `tier=${state.tier}&income=${state.income}&profession=${encodeURIComponent(state.profession)}${state.enterprise ? `&enterprise=${state.enterprise}` : ""}`;

      let previewTimer = null;
      const refreshPreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(doPreview, 200); };
      const doPreview = async () => {
        const out = document.getElementById("dl-prevout");
        out.innerHTML = `<p class="small muted">${S.fmt.escape(S.t("demoLab.previewing"))}</p>`;
        const q = await S.api.get(`/api/demo/self-seed?${previewQ()}&_=${Date.now()}`);
        if (!q.ok) { out.innerHTML = `<div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("x", 14)} ${S.fmt.escape(q.data?.error?.message ?? "failed")}</div>`; return; }
        const p = q.data.preview;
        before = q.data.current;
        const kv = (k, v, mono = true) => `<div class="dl-pkv"><span class="muted">${S.fmt.escape(k)}</span><span class="v${mono ? " mono" : ""}">${S.fmt.escape(String(v))}</span></div>`;
        out.innerHTML = `
          <div class="dl-preview">
            <div class="dl-pkv dl-pkv-h"><span>${S.fmt.escape(S.t("demoLab.previewTitle"))}</span><span class="badge badge-green">${S.fmt.escape(S.t("demoLab.previewNote"))}</span></div>
            ${kv(S.t("demoLab.pTxs"), `×${p.txs}（${S.t("demoLab.pMonth", p.monthAvgTx)}）`)}
            ${kv(S.t("demoLab.pSalary"), `${p.salary_range[0]} – ${p.salary_range[1]}`)}
            ${kv(S.t("demoLab.pPayees"), p.payees)}${kv(S.t("demoLab.pBills"), p.bills)}${kv(S.t("demoLab.pSubs"), p.subs)}
            ${kv(S.t("demoLab.pHoldings"), p.holdings)}${kv(S.t("demoLab.pTasks"), p.tasks)}${kv(S.t("demoLab.pNotifs"), p.notifs)}${kv(S.t("demoLab.pFx"), p.fx)}
            ${kv(S.t("demoLab.pCreditTxs"), p.credit_txs)}${kv(S.t("demoLab.pLimit"), fmtCents(p.credit_limit_cents))}${kv(S.t("demoLab.pDebit"), fmtCents(p.debit_total_cents))}
            ${before ? `<div class="dl-pkv dl-pkv-h"><span>${S.fmt.escape(S.t("demoLab.curTitle"))}</span><span class="muted small mono">txs ${before.txs} · subs ${before.subs} · holdings ${before.holdings}</span></div>` : ""}
          </div>`;
      };
      document.getElementById("dl-prev").onclick = doPreview;
      doPreview(); /* 初始默认维度即预检一次 */

      const runPreset = async (preset, btn) => {
        btn.disabled = true;
        btn.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> ${S.fmt.escape(S.t("demoLab.running"))}`;
        const t0 = Date.now();
        /* 维度化合并写量大：长超时 180s（AbortSignal 在 api.req 内部控制） */
        const res = await S.api.req("POST", "/api/demo/self-seed", preset === null ? {} : { preset }, { timeoutMs: 180000 });
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        btn.disabled = false;
        btn.innerHTML = `${S.ui.icon("send", 14)} ${S.fmt.escape(S.t("demoLab.execAgain"))}`;
        const out = document.getElementById("dl-result");
        if (!res.ok) {
          out.innerHTML = `<div class="banner" style="background:var(--color-red-bg);color:var(--color-red)">${S.ui.icon("x", 14)}<div>${S.fmt.escape(res.data?.error?.message ?? "failed")} · ${S.fmt.escape(S.t("demoLab.retryHint"))}</div></div>`;
          return;
        }
        const v = res.data;
        if (v.preset) {
          /* 维度化结果：核对表（注入前后 + 不变量） */
          const inj = v.injected, after = v.after ?? v.verification?.counts_after ?? {};
          const bf = before ?? v.before ?? null;
          const row = (label, b, a, i) => `<tr><td>${S.fmt.escape(label)}</td><td class="mono">${b == null ? "—" : b}</td><td class="mono">${a == null ? "—" : a}</td><td class="mono">${i == null ? "—" : i}</td></tr>`;
          out.innerHTML = `
            <div class="banner" style="background:var(--color-green-bg, #ecfdf3);color:#067647">${S.ui.icon("check", 14)}<div><b>${S.fmt.escape(S.t("demoLab.done", secs))}</b> · ${S.fmt.escape(S.t(`demoLab.modeNote.${v.preset.mode}`))}</div></div>
            <table class="dl-vtable">
              <thead><tr><th></th><th>${S.fmt.escape(S.t("demoLab.vBefore"))}</th><th>${S.fmt.escape(S.t("demoLab.vAfter"))}</th><th>${S.fmt.escape(S.t("demoLab.vInjected"))}</th></tr></thead>
              <tbody>
                ${row(S.t("demoLab.block.txs"), bf?.txs, after.txs, inj.txs)}
                ${row(S.t("demoLab.block.payees"), bf?.payees, after.payees, inj.payees)}
                ${row(S.t("demoLab.block.bills"), bf?.bills, after.bills, inj.bills)}
                ${row(S.t("demoLab.block.subs"), bf?.subs, after.subs, inj.subscriptions)}
                ${row(S.t("demoLab.block.holdings"), bf?.holdings, after.holdings, inj.holdings)}
                ${row(S.t("demoLab.block.tasks"), bf?.tasks, after.tasks, inj.tasks)}
              </tbody>
            </table>
            <div class="dl-verify">
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vPayees"))}</span><span class="v">${S.fmt.escape(String(v.verification?.payees_actual ?? "—"))} / ${S.fmt.escape(String(v.verification?.payees_expected ?? "—"))}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vReal"))}</span><span class="v">${v.verification?.payees_all_real ? `✓ ${S.fmt.escape(S.t("demoLab.vRealOk"))}` : "✗"}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vDebt"))}</span><span class="v mono">¥${fmtCents(v.verification?.credit_debt_actual ?? after.credit_debt ?? "0")}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vCounts"))}</span><span class="v">${v.verification?.counts_ok ? `✓ ${S.fmt.escape(S.t("demoLab.vCountsOk"))}` : S.fmt.escape(S.t("demoLab.mismatch"))}</span></div>
            </div>
            <a class="btn btn-ghost btn-block" style="margin-top:10px" href="/account/transactions">${S.fmt.escape(S.t("demoLab.viewTx"))} →</a>`;
        } else {
          /* 经典注入结果（保留原核对面板） */
          const ver = v.verification ?? {};
          const rowOk = ver.payees_expected === ver.payees_actual && ver.payees_all_real;
          out.innerHTML = `
            <div class="banner" style="background:var(--color-green-bg, #ecfdf3);color:#067647">${S.ui.icon("check", 14)}<div><b>${S.fmt.escape(S.t("demoLab.done", secs))}</b></div></div>
            <div class="dl-verify">
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vPayees"))}</span><span class="v">${S.fmt.escape(String(ver.payees_actual ?? "—"))} / ${S.fmt.escape(String(ver.payees_expected ?? "—"))}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vReal"))}</span><span class="v">${ver.payees_all_real ? `✓ ${S.fmt.escape(S.t("demoLab.vRealOk"))}` : "✗"}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vTxs"))}</span><span class="v mono">${S.fmt.escape(String(v.tx_count ?? "—"))}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vBills"))}</span><span class="v mono">${S.fmt.escape(String(v.bills ?? "—"))}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vSubs"))}</span><span class="v mono">${S.fmt.escape(String(v.subscriptions ?? "—"))}</span></div>
              <div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("demoLab.vTasks"))}</span><span class="v mono">${S.fmt.escape(String(v.tasks ?? "—"))}</span></div>
            </div>
            ${rowOk ? "" : `<div class="banner" style="background:#fff7e6;color:#9a6700;margin-top:8px">${S.ui.icon("info", 14)}<div>${S.fmt.escape(S.t("demoLab.mismatch"))}</div></div>`}
            <a class="btn btn-ghost btn-block" style="margin-top:10px" href="/account/transactions">${S.fmt.escape(S.t("demoLab.viewTx"))} →</a>`;
        }
      };
      document.getElementById("dl-exec").onclick = (e) => runPreset({ tier: state.tier, income: state.income, profession: state.profession, enterprise: state.enterprise, mode: state.mode, blocks: state.blocks }, e.currentTarget);
      document.getElementById("dl-classic").onclick = (e) => runPreset(null, e.currentTarget);
    })();
  };

  sessionStorage.getItem(UNLOCK_KEY) === "1" ? renderMain() : renderLock();
});
