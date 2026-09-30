/* ai.js — P03 Suveoo AI 对话 + Trust Console（全站核心页）
   第二十六轮：对话卡头栏（历史对话下拉/抽屉 + 当前会话标题 + 新对话）、续聊加载与只读重放、
   "继续上次"提示条。历史卡片是展览品不是操作入口：重放只渲染快照 + 终态徽标，绝不挂确认按钮。 */
S.router.register("ai", async ({ user }) => {
  const c = document.getElementById("content");
  const q = new URLSearchParams(location.search).get("q");
  /* 会话独立 URL（第四十轮）：/ai/s/{sid} 由 worker 重写为本页；有 sid 时加载完历史列表自动续入。
     ?q= 深链（S.router.ai）优先级更高——带着问题来的先出答案，不抢跳历史会话 */
  const seg = location.pathname.split("/");
  const sidSeg = seg.length === 4 && seg[1] === "ai" && seg[2] === "s" ? seg[3] : "";
  const urlSid = q || !/^[a-zA-Z0-9_-]{1,64}$/.test(sidSeg) ? null : sidSeg;
  /* 插画资源跟随 HTML 资产版本（?v=bNN）——R2 内容更新后 bump 版本即对所有用户强制换图（浏览器/SW 缓存按 URL 命中） */
  const av = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1];
  /* 全新会话首屏（欢迎区 + 洞察加载态）：加载历史/续聊时不渲染；"+ 新对话"恢复 */
  const WELCOME_HTML = `
              <div class="ai-welcome">
                <img src="/assets/images/illustrations/ai-hero.svg${av ? "?v=" + av : ""}" alt="">
                <h2>${S.fmt.escape(S.t("ai.welcome"))}</h2>
                <a class="ai-pp-pill" id="ai-pp" href="/ai/proposals" hidden>${S.ui.icon("bell", 13)}<span></span>${S.ui.icon("chevron", 11)}</a>
              </div>`;
  const INSIGHTS_HTML = `<div class="ai-insights" id="ai-insights"><div class="ai-ins-loading"><span class="ail-badge"><img src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt=""></span><span>${S.fmt.escape(S.t("ai.insLoading"))}</span><span class="dots"><i></i><i></i><i></i></span></div></div>`;
  c.innerHTML = `
    <div class="ai-layout">
      <section class="chat-area card" style="padding:0">
        <div class="mobile-tabs"><button class="active" data-pane="chat">${S.fmt.escape(S.t("ai.chatTab"))}</button><button data-pane="console">${S.fmt.escape(S.t("ai.consoleTab"))}</button></div>
          <div class="chat-head">
            <button class="ch-btn" id="hist-btn" type="button">${S.ui.icon("clock", 13)}<span class="hh-full">${S.fmt.escape(S.t("ai.history"))}</span><span class="hh-short">${S.fmt.escape(S.t("ai.historyShort"))}</span>${S.ui.icon("chevron", 11)}</button>
            <div class="ch-title" id="ch-title">${S.fmt.escape(S.t("ai.newChat"))}</div>
            <!-- 头部右侧：圆形新对话 + 三点 morph 菜单（长程任务/评测看板，替代原独立入口行） -->
          <button class="ch-btn ch-round" id="new-chat" type="button" aria-label="${S.fmt.escape(S.t("ai.newChat"))}">${S.ui.icon("plus", 13)}</button>
          <div class="ch-more" id="ch-more">
            <div class="ch-more-morph" id="ch-more-morph" role="menu">
              <button class="ch-more-face" id="ch-more-btn" type="button" aria-expanded="false" aria-label="${S.fmt.escape(S.t("ai.more"))}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2.3"/><circle cx="12" cy="12" r="2.3"/><circle cx="12" cy="19" r="2.3"/></svg></button>
              <a class="ch-more-item" role="menuitem" href="/ai/tasks">${S.ui.icon("clock", 14)}<span>${S.fmt.escape(S.t("tasks.title"))}</span></a>
              <a class="ch-more-item" role="menuitem" href="/ai/proposals">${S.ui.icon("bell", 14)}<span>${S.fmt.escape(S.t("prop.title"))}</span><span class="pp-count" id="ch-pp-count" hidden></span></a>
              <a class="ch-more-item" role="menuitem" href="/ai/benchmark">${S.ui.icon("chart", 14)}<span>${S.fmt.escape(S.t("bench.title"))}</span></a>
            </div>
          </div>
          </div>
          <div id="pane-chat" style="display:flex;flex-direction:column;flex:1;min-height:0">
            <div class="chat-thread" id="thread">${WELCOME_HTML}${INSIGHTS_HTML}</div>
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
     均静默移除不留死动画；用户开始提问后随欢迎区一起让位。
     第二十六轮：封装为可重建单元（历史加载让位 / 新对话回归复用），epoch 令牌防陈旧回调。 */
  let insEpoch = 0;
  function startInsights() {
    const tok = ++insEpoch;
    const timer = setTimeout(() => {
      if (tok !== insEpoch) return;
      insEpoch++;
      document.getElementById("ai-insights")?.remove();
    }, 8000);
    S.insights.collect().then((ins) => {
      if (tok !== insEpoch) return;
      insEpoch++;
      clearTimeout(timer);
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
      if (tok !== insEpoch) return;
      insEpoch++;
      clearTimeout(timer);
      document.getElementById("ai-insights")?.remove();
    });
  }
  function clearFirstScreen() {
    insEpoch++; /* 在途 collect() 回调一律作废 */
    thread.querySelector(".ai-welcome")?.remove();
    document.getElementById("ai-insights")?.remove();
  }
  function mountFirstScreen() {
    thread.insertAdjacentHTML("afterbegin", WELCOME_HTML + INSIGHTS_HTML);
    startInsights();
    ppPill();
  }
  startInsights();
  /* 欢迎区新提议胶囊（第七期 idle）：有新提议时在欢迎语下方浮现直达入口——badge 走 sessionStorage
     缓存（chrome 挂载时通常已取过，同会话零额外请求）；无新提议/失败静默不渲染。
     挂在 mountFirstScreen 内重建时刷新（历史加载让位/新对话回归），元素不在 DOM 时静默跳过。 */
  function ppPill() {
    S.pp.badge().then((d) => {
      const el = document.getElementById("ai-pp");
      if (!el || !d || !(d.fresh > 0) || !el.closest(".ai-welcome")) return;
      el.hidden = false;
      el.querySelector("span").textContent = S.t("ai.ppPill", d.fresh);
    }).catch(() => { /* 静默 */ });
  }
  ppPill();

  /* 三点菜单「AI 提议」项内同步徽标（第八轮）：每次展开刷新（badge 有 sessionStorage 缓存，零开销） */
  function ppMenuCount() {
    S.pp.badge().then((d) => {
      const el = document.getElementById("ch-pp-count");
      if (!el) return;
      if (d && d.fresh > 0) {
        el.hidden = false;
        el.textContent = d.fresh > 99 ? "99+" : d.fresh;
        el.setAttribute("aria-label", S.t("pp.badgeAria", d.fresh));
      } else el.hidden = true;
    }).catch(() => { /* 静默 */ });
  }

  /* 抽屉统一管理（≤1023）：Trust Console 与历史会话两个全屏抽屉互斥——切换时 replaceState 原位换层
     （不多压一层历史记录）；系统返回手势 = 关抽屉回对话（popstate 单点收口），不退出 /ai。 */
  const thread = document.getElementById("thread");
  const tc = document.getElementById("tc");
  const chatTab = document.querySelector('.mobile-tabs [data-pane="chat"]');
  const consoleTab = document.querySelector('.mobile-tabs [data-pane="console"]');
  const histDrawer = S.ui.el(`<div class="hist-drawer" id="hist-drawer">
    <div class="hd-head"><button class="tc-close" id="hd-back">${S.ui.icon("x", 14)} ${S.fmt.escape(S.t("ai.backToChat"))}</button><b class="hd-title">${S.fmt.escape(S.t("ai.sessions"))}</b></div>
    <div class="hd-list" id="hd-list"></div>
  </div>`);
  document.body.appendChild(histDrawer);
  let drawer = null; /* null | "tc" | "hist" */
  const applyDrawer = () => {
    tc.classList.toggle("open", drawer === "tc");
    histDrawer.classList.toggle("open", drawer === "hist");
    document.body.classList.toggle("tc-open", drawer != null);
    consoleTab?.classList.toggle("active", drawer === "tc");
    chatTab?.classList.toggle("active", drawer == null);
  };
  const closeDrawer = (fromPop = false) => {
    if (!drawer) return;
    drawer = null;
    applyDrawer();
    if (!fromPop) history.back();
  };
  const openDrawer = (which) => {
    if (drawer === which) { closeDrawer(); return; }
    if (drawer) history.replaceState({ drawer: which }, "");
    else history.pushState({ drawer: which }, "");
    drawer = which;
    applyDrawer();
    if (which === "hist") refreshHistory(histDrawer.querySelector("#hd-list"));
  };
  window.addEventListener("popstate", () => closeDrawer(true));
  /* 头部三点 morph 菜单：展开/收起（外部点击与系统返回手势关闭；返回手势走独立 pushState 层，
     与上方的抽屉 popstate 单点收口互不抢占——popstate 到达时两者各自检查自身状态） */
  {
    const morphWrap = document.getElementById("ch-more");
    const morphBtn = document.getElementById("ch-more-btn");
    let morePushed = false;
    const closeMore = (fromPop = false) => {
      if (!morphWrap.classList.contains("open")) return;
      morphWrap.classList.remove("open");
      morphBtn.setAttribute("aria-expanded", "false");
      if (morePushed && !fromPop) { morePushed = false; history.back(); }
    };
    morphBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = morphWrap.classList.toggle("open");
      morphBtn.setAttribute("aria-expanded", open);
      if (open) ppMenuCount();
      if (open && !morePushed) { history.pushState({ chMore: true }, ""); morePushed = true; }
    });
    window.addEventListener("popstate", () => { morePushed = false; closeMore(true); });
    document.addEventListener("click", (e) => { if (!morphWrap.contains(e.target)) closeMore(); }, { capture: true });
  }
  {
    const head = tc.querySelector(".tc-head");
    if (head) {
      const close = S.ui.el(`<button class="tc-close">${S.ui.icon("x", 14)} ${S.fmt.escape(S.t("ai.backToChat"))}</button>`);
      head.prepend(close);
      close.onclick = () => closeDrawer();
    }
  }
  consoleTab && (consoleTab.onclick = () => openDrawer("tc"));
  chatTab && (chatTab.onclick = () => closeDrawer());
  histDrawer.querySelector("#hd-back").onclick = () => closeDrawer();

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
  /* 历史气泡：与直播态同款样式（用户右对齐纯文本 / AI 左对齐 Markdown 渲染）。
     AI 气泡含工具按钮卡时同步注水内嵌工具（历史重放与直播同款能力；只读计算交互，不涉资金）。 */
  const histBubble = (role, content) => {
    const m = S.ui.el(`<div class="msg ${role}"></div>`);
    if (role === "ai") { m.classList.add("md"); m.innerHTML = S.md.render(content); S.tools?.hydrate?.(m); }
    else m.textContent = content;
    thread.appendChild(m);
    return m;
  };

  /* ---- 历史会话列表（桌面下拉 / 移动抽屉共用渲染） ---- */
  const setHeaderTitle = (t) => { const el = document.getElementById("ch-title"); if (el) el.textContent = t; };
  const headerTitle = () => document.getElementById("ch-title")?.textContent ?? "";
  const updateLastCache = () => {
    try {
      if (!S.chat.sid) return;
      localStorage.setItem("suveoo.aiLastSid", S.chat.sid);
      localStorage.setItem("suveoo.aiLastTs", String(Date.now()));
      localStorage.setItem("suveoo.aiLastTitle", headerTitle());
    } catch { /* 隐私模式静默 */ }
  };
  const groupKey = (iso) => {
    const t = Date.parse(iso ?? "");
    if (!Number.isFinite(t)) return "older";
    const now = new Date();
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t >= day0) return "today";
    if (t >= day0 - 86400000) return "yesterday";
    if (t >= day0 - 7 * 86400000) return "week";
    return "older";
  };
  const GROUP_ORDER = [["today", "ai.groupToday"], ["yesterday", "ai.groupYesterday"], ["week", "ai.groupWeek"], ["older", "ai.groupOlder"]];
  function renderSessionList(box, sessions) {
    if (!sessions.length) { box.innerHTML = `<div class="hs-empty muted small">${S.fmt.escape(S.t("ai.histEmpty"))}</div>`; return; }
    const byGroup = {};
    for (const s of sessions) (byGroup[groupKey(s.updated_at ?? s.ts)] ??= []).push(s);
    const frag = document.createDocumentFragment();
    for (const [g, key] of GROUP_ORDER) {
      const list = byGroup[g];
      if (!list?.length) continue;
      const gh = S.ui.el(`<div class="hs-group muted small">${S.fmt.escape(S.t(key))}</div>`);
      frag.appendChild(gh);
      for (const s of list) {
        const cur = s.id === S.chat.sid;
        const item = S.ui.el(`<div class="hs-item${cur ? " cur" : ""}" data-sid="${S.fmt.escape(s.id)}">
          <div class="hs-main">
            <div class="hs-l1"><span class="hs-title">${S.fmt.escape(s.title || S.t("ai.newChat"))}</span>${cur ? `<span class="hs-cur">${S.fmt.escape(S.t("ai.ongoing"))}</span>` : ""}</div>
            <div class="hs-meta muted small">${S.fmt.escape(S.fmt.relTime(s.updated_at ?? s.ts))} · ${S.fmt.escape(S.t("ai.msgCount", s.msg_count ?? 0))}</div>
            ${s.last_preview ? `<div class="hs-prev muted small">${S.fmt.escape(String(s.last_preview))}</div>` : ""}
          </div>
          <div class="hs-acts">
            <button class="hs-act" type="button" aria-label="${S.fmt.escape(S.t("ai.rename"))}" title="${S.fmt.escape(S.t("ai.rename"))}">${S.ui.icon("edit", 13)}</button>
            <button class="hs-act hs-del" type="button" aria-label="${S.fmt.escape(S.t("ai.deleteTxt"))}" title="${S.fmt.escape(S.t("ai.deleteTxt"))}">${S.ui.icon("trash", 13)}</button>
          </div>
        </div>`);
        item.onclick = (e) => {
          if (e.target.closest(".hs-act") || e.target.closest(".hs-rename")) return;
          closeDrawer();
          document.getElementById("hist-drop")?.remove();
          loadSession(s.id, s.title);
        };
        item.querySelector(".hs-act:not(.hs-del)").onclick = (e) => { e.stopPropagation(); startRename(item, s); };
        item.querySelector(".hs-del").onclick = (e) => { e.stopPropagation(); confirmDelete(s); };
        frag.appendChild(item);
      }
    }
    box.innerHTML = "";
    box.appendChild(frag);
  }
  async function refreshHistory(box) {
    if (!box) return;
    box.innerHTML = `<div class="hs-loading">${S.ui.skeleton(3)}</div>`;
    const r = await S.api.get("/api/ai/sessions");
    if (!r.ok) { box.innerHTML = `<div class="hs-empty muted small">${S.fmt.escape(S.t("common.loadFailed"))}</div>`; return; }
    renderSessionList(box, r.data.chats ?? []);
  }
  function startRename(item, s) {
    const titleEl = item.querySelector(".hs-title");
    if (!titleEl || item.querySelector(".hs-rename")) return;
    const input = S.ui.el('<input class="input hs-rename" maxlength="60">');
    input.value = s.title ?? "";
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let settled = false;
    const restore = () => input.replaceWith(titleEl);
    const commit = async () => {
      if (settled) return;
      settled = true;
      const v = input.value.trim();
      if (!v || v === (s.title ?? "")) { restore(); return; }
      const r = await fetch(`/api/ai/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(S.api.token ? { authorization: `Bearer ${S.api.token}` } : {}) },
        body: JSON.stringify({ title: v }),
      });
      if (r.ok) {
        s.title = v;
        titleEl.textContent = v;
        if (s.id === S.chat.sid) setHeaderTitle(v);
        updateLastCache();
      } else {
        S.ui.toast(S.t("common.loadFailed"), true);
      }
      restore();
    };
    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      else if (e.key === "Escape") { settled = true; restore(); }
    };
    input.onclick = (e) => e.stopPropagation();
  }
  function confirmDelete(s) {
    const m = S.ui.modal(`<h2>${S.fmt.escape(S.t("ai.delConfirmTitle"))}</h2>
      <p class="muted small">${S.fmt.escape(S.t("ai.delConfirmBody"))}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="hsd-cancel">${S.fmt.escape(S.t("common.cancel"))}</button>
        <button class="btn btn-primary" id="hsd-ok">${S.fmt.escape(S.t("ai.deleteTxt"))}</button>
      </div>`);
    m.el.querySelector("#hsd-cancel").onclick = m.close;
    m.el.querySelector("#hsd-ok").onclick = async () => {
      m.close();
      const r = await fetch(`/api/ai/sessions/${encodeURIComponent(s.id)}`, {
        method: "DELETE",
        headers: S.api.token ? { authorization: `Bearer ${S.api.token}` } : {},
      });
      if (!r.ok) { S.ui.toast(S.t("common.loadFailed"), true); return; }
      try { if (localStorage.getItem("suveoo.aiLastSid") === s.id) localStorage.removeItem("suveoo.aiLastSid"); } catch { /* ignore */ }
      if (s.id === S.chat.sid) resetToFresh();
      /* 原地刷新所在容器（桌面下拉保持展开不闪断；移动抽屉同理） */
      const drop = document.getElementById("hist-drop");
      refreshHistory(drop ?? histDrawer.querySelector("#hd-list"));
    };
  }
  /* 历史卡片只读重放：只渲染已知组件的快照 + 服务端终态徽标（已执行/已过期/已拦截）；
     未知组件宁可不渲染（留"已收起卡片"徽标）；绝不注册 attachConfirm、不带任何可点击操作 */
  const REPLAYABLE = ["transfer_confirmation", "split_bill_detail", "wealth_compare", "sankey_chart", "subscription_list", "scheduled_task", "card_setting_confirm", "fx_quote", "insight_card", "blocked_notice", "report_download"];
  const STATUS_META = { EXECUTED: ["ai.cardExecuted", "badge-green"], EXPIRED: ["ai.cardExpired", "badge-gray"], BLOCKED: ["ai.cardBlocked", "badge-red"] };
  function replayCard(card) {
    if (!card || typeof card !== "object" || card.issuer !== "verified_ir" || !REPLAYABLE.includes(card.component)) {
      thread.appendChild(S.ui.el(`<div class="hist-card-note muted small">${S.fmt.escape(S.t("ai.cardCollapsed"))}</div>`));
      return;
    }
    const node = S.genui.render(card);
    if (!node) return;
    node.style.alignSelf = "flex-start";
    if (card._status && STATUS_META[card._status]) {
      const [key, cls] = STATUS_META[card._status];
      node.querySelector(".gc-head")?.appendChild(S.ui.el(`<span class="badge ${cls} hs-badge">${S.fmt.escape(S.t(key))}</span>`));
    }
    thread.appendChild(node);
  }
  /* 续聊加载：历史/续聊会话不渲染欢迎区与首屏洞察（全新会话专属）；卡片只读重放后插分隔线 */
  async function loadSession(sid, title) {
    if (busy) return;
    const msgs = await S.chat.load(sid);
    if (msgs == null) {
      S.ui.toast(S.t("common.loadFailed"), true);
      /* 直达 URL 指向无效/未落库会话：回退 /ai 全新态，不留死地址（第四十轮防幺蛾子） */
      try { if (location.pathname.startsWith("/ai/s/")) history.replaceState(null, "", "/ai"); } catch { /* ignore */ }
      return;
    }
    clearFirstScreen();
    S.ui.clear(thread);
    document.getElementById("cont-bar")?.remove();
    S.chat.sid = sid;
    const firstUser = msgs.find((m) => m.role === "user");
    setHeaderTitle(title || (firstUser ? String(firstUser.content ?? "").slice(0, 30) : "") || S.t("ai.sessions"));
    for (const m of msgs) {
      if (m.role === "user") { histBubble("user", String(m.content ?? "")); continue; }
      if (m.role !== "assistant") continue;
      if (m.content) histBubble("ai", String(m.content));
      for (const card of m.cards ?? []) replayCard(card);
    }
    /* 旧版（b139 前）会话只有摘要无消息落库：空流给一句提示而非空白对话区 */
    if (!msgs.length) thread.appendChild(S.ui.el(`<div class="hist-divider">${S.fmt.escape(S.t("ai.histEmpty"))}</div>`));
    if (msgs.length) thread.appendChild(S.ui.el(`<div class="hist-divider">${S.fmt.escape(S.t("ai.histDivider"))}</div>`));
    updateLastCache();
    /* 会话独立 URL（第四十轮）：地址栏随会话切换（replaceState 不入历史栈，后退行为与原先一致；会话数据只读加载不受影响） */
    try { history.replaceState(null, "", "/ai/s/" + sid); } catch { /* 隐私模式等极端环境静默降级 */ }
    scroll();
    if (window.matchMedia("(min-width: 1024px)").matches) window.setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 0);
  }
  /* "+ 新对话"：清消息流、sid 置空、恢复全新态（loading + 洞察卡回归） */
  function resetToFresh() {
    if (!S.chat.sid && thread.querySelector(".ai-welcome")) return; /* 已是全新态 */
    S.chat.sid = null;
    try { if (location.pathname.startsWith("/ai/s/")) history.replaceState(null, "", "/ai"); } catch { /* ignore */ }
    clearFirstScreen();
    S.ui.clear(thread);
    mountFirstScreen();
    setHeaderTitle(S.t("ai.newChat"));
    window.scrollTo(0, 0);
    thread.scrollTop = 0;
  }

  /* 历史入口：桌面（≥1024）下拉面板（点外关闭）；移动/平板（≤1023）全屏抽屉（与 TC 抽屉互斥） */
  const histBtn = document.getElementById("hist-btn");
  histBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.matchMedia("(min-width: 1024px)").matches) {
      const ex = document.getElementById("hist-drop");
      if (ex) { ex.remove(); return; }
      const drop = S.ui.el('<div class="hist-drop" id="hist-drop"></div>');
      document.querySelector(".chat-area").appendChild(drop);
      refreshHistory(drop);
      const off = (ev) => {
        if (!drop.isConnected) { document.removeEventListener("click", off); return; }
        if (ev.target.closest(".modal-mask")) return; /* 模态交互（如删除确认）不算点外 */
        if (!drop.contains(ev.target) && !histBtn.contains(ev.target)) { drop.remove(); document.removeEventListener("click", off); }
      };
      setTimeout(() => document.addEventListener("click", off), 0);
    } else {
      openDrawer("hist");
    }
  });
  document.getElementById("new-chat").onclick = () => {
    if (busy) return;
    document.getElementById("hist-drop")?.remove();
    closeDrawer();
    resetToFresh();
  };

  /* "继续上次对话"提示条：最近会话 30 分钟内活跃则浮一条（不自动跳入，不打断新意图） */
  (function maybeContBar() {
    try {
      const sid = localStorage.getItem("suveoo.aiLastSid");
      const ts = Number(localStorage.getItem("suveoo.aiLastTs") ?? 0);
      const title = localStorage.getItem("suveoo.aiLastTitle") ?? "";
      if (!sid || !title || Date.now() - ts > 30 * 60e3) return;
      const hint = document.querySelector(".composer-hint");
      if (!hint) return;
      const bar = S.ui.el(`<div class="cont-bar" id="cont-bar">
        <button class="cb-go" type="button">${S.ui.icon("clock", 13)} ${S.fmt.escape(S.t("ai.continueLast", title))}</button>
        <button class="cb-x" type="button" aria-label="${S.fmt.escape(S.t("common.cancel"))}">${S.ui.icon("x", 12)}</button>
      </div>`);
      hint.insertAdjacentElement("beforebegin", bar);
      bar.querySelector(".cb-go").onclick = () => { bar.remove(); loadSession(sid, title); };
      bar.querySelector(".cb-x").onclick = () => bar.remove();
    } catch { /* 隐私模式静默 */ }
  })();

  let busy = false;
  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    setBusyUI(true);
    const wasNew = !S.chat.sid; /* 新会话首轮：头栏标题取首条消息（与服务器口径一致） */
    bubble("user", text);
    /* 用户开始提问：首屏洞察区/继续上次提示条自然让位 */
    S.ui.$("#ai-insights")?.remove();
    document.getElementById("cont-bar")?.remove();
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
      /* 工具按钮卡下的内嵌工具在消息定稿后注水（打字机期间每帧重建 innerHTML，注水必须等最终稿） */
      if (raw) S.tools?.hydrate?.(aiMsg);
      /* 自动打开工具链接：开关开启且回答含且仅含一个工具 URL → 新标签直达（一次为限） */
      if (raw && localStorage.getItem("suveoo.aiAutoOpen") !== "off") {
        const urls = [...raw.matchAll(/https:\/\/suveoo\.com\/wealth\/tools\/[a-z-]+\?[^\s)）<」』】]+/g)].map((m) => m[0]);
        if (urls.length === 1) window.open(urls[0], "_blank", "noopener");
      }
      if (wasNew) setHeaderTitle(text.slice(0, 30));
      updateLastCache();
      busy = false;
      setBusyUI(false);
    };
    await S.chat.send(text, {
      /* 思考型模型（glm-5.3-flash）长思考期零文本输出：后端首个 thinking_delta 触发本事件，
         把裸三点动画升级为"深度分析中"文案——消除"等很久没反应"的观感（思考本身不可关，实测参数被网关忽略） */
      onThinking: () => {
        if (aiMsg.classList.contains("thinking") && !aiMsg.textContent.trim())
          aiMsg.innerHTML = `<span class="dots"><i></i><i></i><i></i></span><span class="thk-txt">${S.fmt.escape(S.t("ai.deepThinking"))}</span>`;
      },
      onToken: (t) => { raw += t; kick(); },
      onGenui: (card) => {
        flush(); /* 卡片插入前先追平当前文本，保持"文→卡"顺序自然 */
        const node = S.genui.render(card);
        if (node) { node.style.alignSelf = "flex-start"; thread.appendChild(node); scroll(); }
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
    const bar = S.ui.el(`<div class="gc-actions">
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
      /* 修复 3 + §5.1：无 tx_id 不渲染"·"段、无 trace_id 不渲染 trace 段（此前显示"操作成功 · trace …"）；
         birthday 建单以系统 summary 为主文案（锁定金额/执行时间/可取消——数字由系统给） */
      if (okExec) {
        const parts = [`${S.ui.icon("check", 14)} ${S.fmt.escape(out.summary || S.t("common.opOk"))}`];
        if (out.tx_id) parts.push(S.fmt.escape(String(out.tx_id)));
        let traceHtml = "";
        if (out.trace_id) {
          const tr = String(out.trace_id);
          traceHtml = ` <span class="muted small mono" title="${S.fmt.escape(tr)}">trace ${S.fmt.escape(tr.slice(0, 18))}…</span>`;
        }
        done.innerHTML = parts.join(" · ") + traceHtml;
      } else {
        done.innerHTML = `${S.ui.icon("x", 14)} ${S.fmt.escape(out?.reason || out?.error?.message || r.data?.error?.message || "BLOCKED")}`;
        done.classList.add("err");
      }
      bar.replaceWith(done);
      S.trust.onEvent({ kind: okExec ? "RESULT" : "BLOCKED", ok: okExec, reason: out?.reason });
      /* 修复 4：birthday 建单确认执行成功 → Trust Console 演示注入按钮接通（此前 showDemo 全站零调用） */
      if (okExec && out?.task_id && String(card.params?.task_type ?? "").startsWith("birthday_flower")) {
        S.trust.showDemo(async () => {
          const r2 = await S.api.post("/api/demo/inject-failure", { task_id: Number(out.task_id) });
          const btn = document.getElementById("tc-inject");
          const note = document.querySelector("#tc-demo .small");
          if (r2.data?.ok) {
            S.ui.toast(S.t("tasks.injected"));
            S.trust.evt("DEMO", null, S.t("trust.injectedNote"));
            if (btn) btn.disabled = true;
            if (note) note.textContent = S.t("trust.injectedNote");
          } else {
            S.ui.toast(r2.data?.error?.message ?? "failed", true);
          }
        });
      }
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
    location.replace("/account/login?next=" + encodeURIComponent(location.pathname));
    return;
  }
  if (q) send(q);
  /* 直达会话 URL：自动续入（loadSession 自带失败兜底；?q= 优先已 return 不了但 urlSid 已置 null） */
  if (urlSid) loadSession(urlSid, null);
});
