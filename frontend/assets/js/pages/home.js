/* home.js — P01 主页 */
S.router.register("home", async ({ user }) => {
  const c = document.getElementById("content");
  const q = new URLSearchParams(location.search).get("q");
  if (q) { S.router.ai(q); return; }
  c.innerHTML = `
    <div class="hero">
      <div class="hero-input" id="hero-input">
        <img src="/assets/images/suveoo-ai-logo.svg" alt="">
        <input id="hero-q" placeholder="${S.fmt.escape(S.t("home.heroPlaceholder"))}">
      </div>
      <div class="hero-chips" id="hero-chips"></div>
    </div>
    <div class="card assets-block" style="margin-top:16px" id="assets"></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("home.services"))}</h2></div>
    <div class="quick-grid" id="services"></div>
    <div class="card" id="insight" style="margin-top:16px"></div>
    <div class="card card-surface banner" style="margin-top:16px">${S.ui.icon("shield", 16)}<div><b>${S.fmt.escape(S.t("home.securityTitle"))}</b>
      <ul class="small muted home-anti" style="margin:6px 0 10px;padding-left:0;list-style:none">
        <li style="display:flex;align-items:flex-start;gap:6px">${S.ui.icon("arrow-right", 12)} <span>${S.fmt.escape(S.t("help.af1"))}</span></li><li style="display:flex;align-items:flex-start;gap:6px">${S.ui.icon("arrow-right", 12)} <span>${S.fmt.escape(S.t("help.af2"))}</span></li><li style="display:flex;align-items:flex-start;gap:6px">${S.ui.icon("arrow-right", 12)} <span>${S.fmt.escape(S.t("help.af3"))}</span></li>
      </ul><a class="small" href="/help#antifraud">${S.fmt.escape(S.t("common.more"))} →</a></div></div>
    <div class="brand-banner" style="margin-top:24px">
      <div class="bb-text"><h2>Suveoo</h2><p>${S.fmt.escape(S.t("about.intro"))}</p>
      <a class="btn btn-light" href="/about">${S.fmt.escape(S.t("home.aboutBtn"))}</a></div>
    </div>`;
  /* hero */
  const go = () => { const v = document.getElementById("hero-q").value.trim(); if (v) S.router.ai(v); };
  document.getElementById("hero-input").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  S.api.json("/assets/data/scenarios.json").then((d) => { if (!d) return;
    document.getElementById("hero-chips").innerHTML = d.home.map((s) => `<button class="chip">${S.fmt.escape(s)}${S.ui.chipGo}</button>`).join("");
    S.ui.$$("#hero-chips .chip").forEach((b) => { b.onclick = () => user ? S.router.ai(b.textContent) : (location.href = "/account/login?next=/ai"); });
  });
  /* services */
  const svc = [
    ["/transfer/intrabank", "pay", S.t("pay.intrabank")],
    ["disabled:crossBank", "bank", S.t("home.crossBank")],
    ["disabled:crossBorder", "globe2", S.t("home.crossBorder")],
    ["/pay/bills", "doc", S.t("home.billsShort")],
    ["/account/cards", "card", S.t("acct.grid.cards")],
    ["/wealth/funds", "wealth", S.t("wealth.funds").replace("Suveoo ", "")],
    ["/wealth/fx", "exchange", S.t("wealth.allFx")],
    ["/account/downloads", "download", S.t("acct.downloads")],
  ];
  document.getElementById("services").innerHTML = svc.map(([href, ic, label]) => href.startsWith("disabled:")
    ? `<div class="quick-item disabled" data-dis="${href.slice(9)}"><span class="qi">${S.ui.icon(ic, 22)}</span><span>${S.fmt.escape(label)}<br><span class="muted" style="font-size:10px">${S.fmt.escape(S.t("common.comingSoon"))}</span></span></div>`
    : `<a class="quick-item" href="${href}"><span class="qi">${S.ui.icon(ic, 22)}</span><span>${S.fmt.escape(label)}</span></a>`).join("");
  S.ui.$$(".quick-item.disabled").forEach((el) => { el.onclick = () => S.ui.modal(`<h2>${S.fmt.escape(S.t("common.more"))}</h2><p class="muted">${S.fmt.escape(S.t("home.crossDisabled"))}</p>${S.sim.footnote()}`); });
  /* assets / insight */
  if (!user) {
    document.getElementById("assets").innerHTML = `<div class="row between"><div><div class="muted small">${S.fmt.escape(S.t("home.totalAssets"))}</div>
      <div class="total">—</div></div><a class="btn btn-primary" href="/account/login">${S.fmt.escape(S.t("home.loginBtn"))}</a></div>
      <p class="footnote-sim">${S.fmt.escape(S.t("home.loginCta"))}</p>`;
    document.getElementById("insight").style.display = "none";
    return;
  }
  const ov = await S.api.get("/api/overview");
  if (ov.ok) {
    const o = ov.data;
    document.getElementById("assets").innerHTML = `
      <div class="row between"><div>
        <div class="muted small">${S.fmt.escape(S.t("home.totalAssets"))} <button class="eye-toggle" id="eye">${S.ui.icon("eye", 16)}</button></div>
        <div><span class="total" id="amt">${S.fmt.moneyPlain(o.total_assets)}</span><span class="cur">CNY</span></div>
        <div class="muted small">${S.fmt.escape(S.t("home.todayPnl"))} <span class="mono" id="pnl">${o.today_pnl.amount} (${o.today_pnl.percent})</span></div>
      </div></div>${S.sim.footnote()}`;
    let hidden = false;
    document.getElementById("eye").onclick = () => {
      hidden = !hidden;
      document.getElementById("eye").innerHTML = S.ui.icon(hidden ? "eye-off" : "eye", 16);
      document.getElementById("amt").textContent = hidden ? "*****" : S.fmt.moneyPlain(o.total_assets);
      document.getElementById("pnl").textContent = hidden ? "*****" : `${o.today_pnl.amount} (${o.today_pnl.percent})`;
    };
  }
  const ins = await S.api.get("/api/dashboard/insight");
  if (ins.ok) {
    document.getElementById("insight").innerHTML = `<div class="insight-card"><img src="/assets/images/suveoo-ai-logo.svg" alt="">
      <div><b>${S.fmt.escape(S.t("home.insight"))}</b>
      ${(ins.data.insights ?? []).map((t) => `<p class="muted small insight-li" style="margin-top:6px">${S.ui.icon("arrow-right", 12)} ${S.fmt.escape(t)}</p>`).join("")}
      <div style="margin-top:10px"><button class="ai-chip" id="ask-ai">${S.ui.icon("ai", 14)} ${S.fmt.escape(S.t("genui.insight"))}</button></div></div></div>`;
    document.getElementById("ask-ai").onclick = () => S.router.ai(S.t("prompt.billInsight"));
  }
});
