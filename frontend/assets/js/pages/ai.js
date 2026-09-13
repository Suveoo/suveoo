/* ai.js — P03 Suveoo AI 对话 + Trust Console（全站核心页） */
S.router.register("ai", async ({ user }) => {
  const c = document.getElementById("content");
  const q = new URLSearchParams(location.search).get("q");
  c.innerHTML = `
    <div class="ai-layout">
      <section class="chat-area card" style="padding:0">
        <div class="mobile-tabs"><button class="active" data-pane="chat">${S.fmt.escape(S.t("ai.chatTab"))}</button><button data-pane="console">${S.fmt.escape(S.t("ai.consoleTab"))}</button></div>
        <div id="pane-chat" style="display:flex;flex-direction:column;flex:1;min-height:0">
          <div class="chat-thread" id="thread">
            <div class="ai-welcome">
              <img src="/assets/images/illustrations/ai-hero.svg" alt="">
              <h2>${S.fmt.escape(S.t("ai.welcome"))}</h2>
            </div>
            <div class="chat-chips" id="chips"></div>
          </div>
          <div class="composer-hint">${S.fmt.escape(S.t("ai.hint"))}</div>
          <div class="chat-composer">
            <input class="input" id="chat-in" placeholder="${S.fmt.escape(S.t("ai.placeholder"))}">
            <button class="btn btn-primary" id="chat-go">${S.ui.icon("send", 16)}</button>
          </div>
        </div>
      </section>
      <aside class="trust-console" id="tc"></aside>
    </div>`;
  S.trust.mount(document.getElementById("tc"));
  /* 控制台收起开关（桌面端给对话让出全宽；偏好记忆） */
  if (window.matchMedia("(min-width: 1024px)").matches) {
    const layout = document.querySelector(".ai-layout");
    const head = document.querySelector("#tc .tc-head");
    if (layout && head) {
      const btn = S.ui.el('<button class="tc-toggle" id="tc-toggle"></button>');
      head.appendChild(btn);
      const apply = () => {
        const hidden = localStorage.getItem("suveoo.tc") === "hidden";
        layout.classList.toggle("console-hidden", hidden);
        btn.textContent = hidden ? "显示控制台" : "收起控制台";
      };
      btn.onclick = () => { localStorage.setItem("suveoo.tc", layout.classList.contains("console-hidden") ? "open" : "hidden"); apply(); };
      apply();
    }
  }

  /* 欢迎 chips */
  S.api.json("/assets/data/scenarios.json").then((d) => { if (!d) return;
    document.getElementById("chips").innerHTML = d.ai_welcome.map((s) => `<button class="chip">${S.fmt.escape(s)}${S.ui.chipGo}</button>`).join("");
    S.ui.$$("#chips .chip").forEach((b) => { b.onclick = () => send(b.textContent); });
  });

  /* 移动端/平板：Trust Console 以全屏抽屉呈现，对话区保持满幅；
     系统返回手势 = 关闭抽屉回到对话（pushState/popstate 集成），而不是退出 /ai */
  {
    const tc = document.getElementById("tc");
    const head = tc.querySelector(".tc-head");
    const chatTab = document.querySelector('.mobile-tabs [data-pane="chat"]');
    const consoleTab = document.querySelector('.mobile-tabs [data-pane="console"]');
    let pushed = false;
    const setOpen = (on, fromPop = false) => {
      tc.classList.toggle("open", on);
      document.body.classList.toggle("tc-open", on);
      consoleTab?.classList.toggle("active", on);
      chatTab?.classList.toggle("active", !on);
      if (on && !pushed) { history.pushState({ tcDrawer: true }, ""); pushed = true; }
      if (!on && pushed) { pushed = false; if (!fromPop) history.back(); }
    };
    window.addEventListener("popstate", () => {
      if (pushed) { pushed = false; setOpen(false, true); }
    });
    if (head) {
      const close = S.ui.el(`<button class="tc-close">${S.ui.icon("x", 14)} ${S.fmt.escape(S.t("ai.backToChat"))}</button>`);
      head.prepend(close);
      close.onclick = () => setOpen(false);
      /* 底部固定主按钮：抽屉内滚到任何位置都能一键返回对话 */
      const bar = S.ui.el(`<div class="tc-back-bar"><button class="btn btn-primary btn-block">${S.ui.icon("arrow-left", 16)} ${S.fmt.escape(S.t("ai.backToChat"))}</button></div>`);
      tc.appendChild(bar);
      bar.querySelector("button").onclick = () => setOpen(false);
    }
    consoleTab && (consoleTab.onclick = () => setOpen(true));
    chatTab && (chatTab.onclick = () => setOpen(false));
  }

  const thread = document.getElementById("thread");
  /* 移动端（≤1023）为自然页面滚动：滚页面而非内滚容器 */
  const scroll = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  };
  const bubble = (role, text) => {
    const m = S.ui.el(`<div class="msg ${role}"></div>`);
    m.textContent = text;
    thread.appendChild(m);
    scroll();
    return m;
  };

  let busy = false;
  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    bubble("user", text);
    S.ui.$("#chips")?.remove();
    const aiMsg = bubble("ai", "…");
    S.trust.evt("CHAT", null, text.slice(0, 60));
    S.ga4.event("ai_chat_start", { entry: "composer" });
    /* 流式 Markdown：累积原文、节流重渲（160ms），结束时全量渲染一次 */
    let raw = "";
    let renderTimer = null;
    const renderNow = () => {
      clearTimeout(renderTimer); renderTimer = null;
      if (!raw) return;
      aiMsg.classList.add("md");
      aiMsg.innerHTML = S.md.render(raw);
      scroll();
    };
    const renderSoon = () => { if (!renderTimer) renderTimer = setTimeout(renderNow, 160); };
    await S.chat.send(text, {
      onToken: (t) => { if (aiMsg.textContent === "…") aiMsg.textContent = ""; raw += t; renderSoon(); },
      onGenui: (card) => {
        renderNow();
        const node = S.genui.render(card);
        if (node) { node.style.maxWidth = "82%"; node.style.alignSelf = "flex-start"; thread.appendChild(node); scroll(); }
        if (card && card.component === "transfer_confirmation" && card.grant_hash) attachConfirm(card, aiMsg);
      },
      onTrust: (ev) => S.trust.onEvent(ev),
      onError: (msg) => { renderNow(); aiMsg.classList.add("err"); aiMsg.textContent = String(msg); scroll(); },
      onDone: () => {
        clearTimeout(renderTimer); renderTimer = null;
        if (!raw) aiMsg.textContent = S.t("ai.done");
        else renderNow();
        busy = false;
      },
    });
    busy = false;
  }

  /* GenUI 确认卡：回传 grant_hash 完成两段式（AI 通道） */
  function attachConfirm(card, aiMsg) {
    const bar = S.ui.el(`<div class="gc-actions" style="max-width:82%">
      <button class="btn btn-sm btn-ghost" id="gc-cancel">${S.fmt.escape(S.t("common.cancel"))}</button>
      <button class="btn btn-sm btn-primary" id="gc-ok">${S.fmt.escape(S.t("consent.confirm"))}</button></div>`);
    aiMsg.insertAdjacentElement("afterend", bar);
    bar.querySelector("#gc-cancel").onclick = () => bar.remove();
    bar.querySelector("#gc-ok").onclick = async () => {
      bar.querySelector("#gc-ok").disabled = true;
      /* AI 通道确认必须原样回传工具参数（grant 快照绑定的是工具参数，不是表单字段），直连 /mcp 不再经过模型 */
      const args = { ...(card.params ?? {}), grant_hash: card.grant_hash };
      if (card.tier === "RED") {
        const otp = prompt(S.t("consent.otpNeeded"));
        if (!otp) { bar.querySelector("#gc-ok").disabled = false; return; }
        args.otp = otp;
      }
      const r = await S.api.post(`/mcp?sid=${S.chat.sid ?? ""}`, {
        jsonrpc: "2.0", id: Date.now() % 1e9, method: "tools/call",
        params: { name: card.action, arguments: args },
      });
      let out = r.data;
      try { out = JSON.parse(r.data?.result?.content?.[0]?.text ?? "null") ?? r.data; } catch { /* 保留原始响应 */ }
      const okExec = out?.status === "EXECUTED";
      const done = S.ui.el(`<div class="msg ai"></div>`);
      done.innerHTML = okExec
        ? `${S.ui.icon("check", 14)} ${S.fmt.escape(S.t("common.opOk"))} · ${S.fmt.escape(out.tx_id ?? "")} <span class="muted small mono">trace ${S.fmt.escape(String(out.trace_id || "").slice(0, 18))}…</span>`
        : `${S.ui.icon("x", 14)} ${S.fmt.escape(out?.reason || out?.error?.message || r.data?.error?.message || "BLOCKED")}`;
      if (!okExec) done.classList.add("err");
      bar.replaceWith(done);
      S.trust.onEvent({ kind: okExec ? "RESULT" : "BLOCKED", ok: okExec, reason: out?.reason });
      scroll();
    };
  }

  const input = document.getElementById("chat-in");
  document.getElementById("chat-go").onclick = () => { const v = input.value; input.value = ""; send(v); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = input.value; input.value = ""; send(v); } });
  if (!user) {
    location.replace("/account/login?next=/ai");
    return;
  }
  if (q) send(q);
});
