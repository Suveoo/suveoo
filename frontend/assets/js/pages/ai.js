/* ai.js — P03 Suveoo AI 对话 + Trust Console（全站核心页） */
S.router.register("ai", async ({ user }) => {
  const c = document.getElementById("content");
  const q = new URLSearchParams(location.search).get("q");
  /* 插画资源跟随 HTML 资产版本（?v=bNN）——R2 内容更新后 bump 版本即对所有用户强制换图（浏览器/SW 缓存按 URL 命中） */
  const av = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1];
  c.innerHTML = `
    <div class="ai-layout">
      <section class="chat-area card" style="padding:0">
        <div class="mobile-tabs"><button class="active" data-pane="chat">${S.fmt.escape(S.t("ai.chatTab"))}</button><button data-pane="console">${S.fmt.escape(S.t("ai.consoleTab"))}</button></div>
          <div id="pane-chat" style="display:flex;flex-direction:column;flex:1;min-height:0">
            <div class="chat-thread" id="thread">
              <div class="ai-welcome">
                <img src="/assets/images/illustrations/ai-hero.svg${av ? "?v=" + av : ""}" alt="">
                <h2>${S.fmt.escape(S.t("ai.welcome"))}</h2>
              </div>
              <div class="ai-insights" id="ai-insights"><div class="ai-ins-loading"><span class="ail-badge"><img src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt=""></span><span>${S.fmt.escape(S.t("ai.insLoading"))}</span><span class="dots"><i></i><i></i><i></i></span></div></div>
            </div>
          <div class="composer-hint">${S.fmt.escape(S.t("ai.hint"))}</div>
          <div class="chat-composer">
            <input class="input" id="chat-in" placeholder="${S.fmt.escape(S.t("ai.placeholder"))}">
            <button class="voice-btn" id="chat-mic" type="button" title="">${S.ui.icon("mic", 18)}</button>
            <button class="btn btn-primary" id="chat-go">${S.ui.icon("send", 16)}</button>
          </div>
        </div>
      </section>
      <aside class="trust-console" id="tc"></aside>
    </div>`;
  S.trust.mount(document.getElementById("tc"));
  /* 控制台收起开关（桌面端给对话让出全宽；偏好记忆）+ 自动打开工具链接开关（同区）
     第二十五轮续：收起后控制台整体消失、开关随之不可达——补右侧贴边恢复钮（fixed 不占对话区布局） */
  if (window.matchMedia("(min-width: 1024px)").matches) {
    const layout = document.querySelector(".ai-layout");
    const head = document.querySelector("#tc .tc-head");
    if (layout && head) {
      const btn = S.ui.el('<button class="tc-toggle" id="tc-toggle"></button>');
      head.appendChild(btn);
      const restore = S.ui.el(`<button class="tc-restore" id="tc-restore" aria-label="${S.fmt.escape(S.t("ai.consoleTab"))}">${S.ui.icon("chevron", 15)}</button>`);
      document.body.appendChild(restore);
      const apply = () => {
        const hidden = localStorage.getItem("suveoo.tc") === "hidden";
        layout.classList.toggle("console-hidden", hidden);
        btn.textContent = hidden ? "显示控制台" : "收起控制台";
        restore.classList.toggle("show", hidden);
      };
      btn.onclick = () => { localStorage.setItem("suveoo.tc", layout.classList.contains("console-hidden") ? "open" : "hidden"); apply(); };
      restore.onclick = () => { localStorage.setItem("suveoo.tc", "open"); apply(); };
      apply();
      /* 自动打开工具链接：默认开；回答末尾"有且仅有一个"工具 URL 时新标签直达（一次为限） */
      const ao = S.ui.el('<button class="tc-toggle" id="ao-toggle"></button>');
      head.appendChild(ao);
      const applyAo = () => { ao.innerHTML = (localStorage.getItem("suveoo.aiAutoOpen") !== "off" ? S.ui.icon("check", 12) + " " : "") + S.fmt.escape(S.t("ai.autoOpen")); };
      ao.onclick = () => { localStorage.setItem("suveoo.aiAutoOpen", localStorage.getItem("suveoo.aiAutoOpen") !== "off" ? "off" : "on"); applyAo(); };
      applyAo();
    }
  }

  /* 首屏主动洞察（C）：确定性规则引擎生成，零 LLM 调用（网络面板可验证——只有 GET /api/*）。
     第二十三轮 B：渲染即出加载态（无空档）；collect() 返回后淡入替换；空结果/reject/超 8s
     均静默移除不留死动画；用户开始提问后随欢迎区一起让位。 */
  let insSettled = false;
  const insTimer = setTimeout(() => {
    if (insSettled) return;
    insSettled = true;
    document.getElementById("ai-insights")?.remove();
  }, 8000);
  S.insights.collect().then((ins) => {
    if (insSettled) return;
    insSettled = true;
    clearTimeout(insTimer);
    const box = document.getElementById("ai-insights");
    if (!box || !ins.list.length) { box?.remove(); return; }
    const tint = { orange: "bg-tint-orange", gold: "bg-tint-gold", violet: "bg-tint-violet", teal: "bg-tint-teal", rose: "bg-tint-rose", sky: "bg-tint-sky" };
    const tx = { orange: "tx-orange", gold: "tx-gold", violet: "tx-violet", teal: "tx-teal", rose: "tx-rose", sky: "tx-sky" };
    box.classList.add("ready");
    box.innerHTML = `<div class="ai-ins-head"><img src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" width="44" height="44" alt="" loading="lazy"><b>${S.fmt.escape(S.t("ai.insightTitle"))}</b></div>
      <div class="ai-ins-grid">${ins.list.slice(0, 3).map((it, i) => `
        <div class="ai-ins-card ${tint[it.tone] ?? "bg-tint-sky"}${it.art ? " has-art" : ""}" style="animation-delay:${i * 110}ms">
          ${it.art ? `<img class="aic-art" src="${it.art}?v=${S.ui.v()}" alt="" loading="lazy">` : `<span class="aic-ico">${S.ui.icon("ic-" + (it.icon ?? "star") + "-" + (it.tone ?? "sky"), 24)}</span>`}
          <div class="aic-body">
            <span class="aic-tag ${tx[it.tone] ?? "tx-sky"}">${S.fmt.escape(S.t(it.tag))}</span>
            <b class="aic-title">${S.fmt.escape(S.t(it.title))}</b>
            <p class="aic-desc">${S.fmt.escape(it.body)}</p>
            <a class="aic-cta" href="${it.cta && it.cta !== "modal" ? it.cta : "/home"}">${S.fmt.escape(S.t(it.ctaLabel ?? "ins.ctaGo"))} →</a>
          </div>
        </div>`).join("")}</div>`;
  }).catch(() => {
    if (insSettled) return;
    insSettled = true;
    clearTimeout(insTimer);
    document.getElementById("ai-insights")?.remove();
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
    }
    consoleTab && (consoleTab.onclick = () => setOpen(true));
    chatTab && (chatTab.onclick = () => setOpen(false));
  }

  const thread = document.getElementById("thread");
  /* 移动端（≤1023）为自然页面滚动：锚定最后一条消息而非文档底（文档底会把 footer 三栏拉进视口）；
     预留 = 底导航实际高度（offsetHeight 已含手势条 safe-area padding）+ 12px 余量；只向下不回滚 */
  const scroll = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const last = thread.lastElementChild;
      if (!last) return;
      const bn = document.querySelector(".bottom-nav");
      const reserve = (bn ? bn.offsetHeight : 64) + 12;
      const target = Math.ceil(last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + reserve);
      if (target > window.scrollY) window.scrollTo(0, target);
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
    setBusyUI(true);
    bubble("user", text);
    /* 用户开始提问：首屏洞察区自然让位 */
    S.ui.$("#ai-insights")?.remove();
    const aiMsg = bubble("ai", ""); aiMsg.classList.add("thinking"); aiMsg.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    S.trust.evt("CHAT", null, text.slice(0, 60));
    S.ga4.event("ai_chat_start", { entry: "composer" });
    /* 打字机缓冲：token 到达后按帧渐进渲染 Markdown（rAF）——真流式 token 粒度细，该层平滑网络毛刺；
       帧步长自适应积压量（12 字/帧起步，积压越大步长越大、上限 48）：长回答尾部不再等
       固定 12 字/帧追平 2 秒以上，追赶时间收敛到约 1 秒内，同时小步长保持打字观感。
       done 到达时若打字未追平，等追平再 finish（保证 autoOpen 等收尾看到完整文本）。 */
    const BASE_STEP = 12, MAX_STEP = 48;
    let raw = "", shown = 0, donePending = false, tkFrame = null, errored = false;
    const renderAt = () => {
      aiMsg.classList.add("md");
      aiMsg.innerHTML = S.md.render(raw.slice(0, shown));
      scroll();
    };
    const tick = () => {
      if (shown < raw.length) {
        shown = Math.min(raw.length, shown + Math.min(MAX_STEP, Math.max(BASE_STEP, Math.ceil((raw.length - shown) / 45))));
        renderAt();
        tkFrame = requestAnimationFrame(tick);
      } else {
        tkFrame = null;
        if (donePending) finish();
      }
    };
    const kick = () => { if (tkFrame == null && shown < raw.length) tkFrame = requestAnimationFrame(tick); };
    const flush = () => {
      if (tkFrame != null) { cancelAnimationFrame(tkFrame); tkFrame = null; }
      shown = raw.length;
      if (raw) renderAt();
    };
    const finish = () => {
      aiMsg.classList.remove("thinking");
      /* errored 时错误文案已由 onError 写入气泡——绝不能用"（完成）"覆盖（用户会误以为转账成功） */
      if (!raw && !errored) aiMsg.textContent = S.t("ai.done");
      else if (raw) renderAt();
      /* 自动打开工具链接：开关开启且回答含且仅含一个工具 URL → 新标签直达（一次为限） */
      if (raw && localStorage.getItem("suveoo.aiAutoOpen") !== "off") {
        const urls = [...raw.matchAll(/https:\/\/suveoo\.com\/wealth\/tools\/[a-z-]+\?[^\s)）<」』】]+/g)].map((m) => m[0]);
        if (urls.length === 1) window.open(urls[0], "_blank", "noopener");
      }
      busy = false;
      setBusyUI(false);
    };
    await S.chat.send(text, {
      onToken: (t) => { raw += t; kick(); },
      onGenui: (card) => {
        flush(); /* 卡片插入前先追平当前文本，保持"文→卡"顺序自然 */
        const node = S.genui.render(card);
        if (node) { node.style.maxWidth = "82%"; node.style.alignSelf = "flex-start"; thread.appendChild(node); scroll(); }
        if (card && card.component === "transfer_confirmation" && card.grant_hash) attachConfirm(card, aiMsg);
      },
      onTrust: (ev) => S.trust.onEvent(ev),
      onError: (msg) => { flush(); errored = true; aiMsg.classList.remove("thinking"); aiMsg.classList.add("err"); aiMsg.textContent = String(msg); scroll(); },
      onDone: () => {
        donePending = true;
        if (tkFrame == null) finish(); /* 已追平（或空回复）立即收尾；否则由 tick 追平后调用 */
      },
    });
    busy = false;
    setBusyUI(false);
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
        const otp = await S.ctl.otp({
          email: S.auth._session?.email,
          send: async () => (await S.api.post("/api/auth/email-code", { scene: "redstep" })).ok,
        });
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
  const goBtn = document.getElementById("chat-go");
  /* 语音按钮（F）：识别结果填入输入框，用户核对后回车/点发送 */
  S.voice.bind(document.getElementById("chat-mic"), input);
  /* 流式进行中：发送按钮切换为"停止"——中断挂起/冗长的请求（AbortController），已到内容保留 */
  const setBusyUI = (on) => {
    goBtn.innerHTML = on ? S.ui.icon("stop", 16) : S.ui.icon("send", 16);
    goBtn.setAttribute("aria-label", on ? S.t("ai.stop") : "");
  };
  goBtn.onclick = () => {
    if (busy) { S.chat.stop(); return; }
    const v = input.value; input.value = ""; send(v);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = input.value; input.value = ""; send(v); } });
  if (!user) {
    location.replace("/account/login?next=/ai");
    return;
  }
  if (q) send(q);
});
