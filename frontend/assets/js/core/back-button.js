/* back-button.js — Android 壳返回手势 JS 侧 + 滚动位置恢复（第五十三轮 v1.2 / 第五十五轮 v1.4）
 * 由 MainActivity 返回拦截经 evaluateJavascript 调用（仅壳内）；网页版即使加载也零副作用
 * （本文件不挂任何自动监听以外的行为，且 __suveooBack 无人调用）。
 * 约定：return true = 已消费（Java 不动历史栈，本函数已关闭最上层浮层/做了动作）；
 *       return false = 放行（Java canGoBack → goBack；否则"再按一次退出"）。
 * 场景编号 sc:NN 对应队长 31 场景验收表，verify-back-handling.mjs 依赖这些标记。 */
(() => {
  if (window.__suveooBack) return; /* 防重复注入 */
  const q = (s) => document.querySelector(s);
  const page = () => document.body?.dataset?.page ?? "";
  const isPublic = () => S.router?.PUBLIC_PAGES?.has(page()) ?? false;

  /* sc:25 表单脏标记：页面输入过未提交 → 返回前弹确认（排除搜索框/AI composer/弹窗内输入） */
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.closest('.modal-mask, .cal-mask, [hidden]')) return; /* 弹窗/日历内输入不脏页面 */
    if (t.matches('input[type="search"], input[type="checkbox"], input[type="radio"], [type="file"]')) return;
    if (page() === "ai" && t.closest(".chat-composer")) return; /* sc:29 单独管（清空而非确认） */
    window.__svDirty = true;
  }, true);

  /* sc:25 确认框文案（APK 专用文件，不进全站 i18n 体系；zh/zh-TW/en 三语） */
  const dirtyText = () => {
    const l = (S.i18n?.lang ?? "zh-CN").toLowerCase();
    if (l.startsWith("en")) return { t: "Discard unsaved input?", b: "Stay", g: "Discard & go back" };
    if (l.includes("tw")) return { t: "返回將放棄尚未送出的內容", b: "留在本頁", g: "放棄並返回" };
    return { t: "返回将放弃尚未提交的内容", b: "留在本页", g: "放弃并返回" };
  };

  window.__suveooBack = function () {
    if (!window.S) return false; /* 页面加载早期（S 未就绪）：降级放行，Java 走 canGoBack */
    /* ===== 浮层层（关最上层，一次一件） ===== */

    /* sc:23 日历编辑态：blur 触发 ctl.js 的 commit（finishEdit 收值+render），日历保持开；
     *     再按一次返回才走 sc:22 关日历 —— "先收值，再关闭（两步）" */
    const edit = q(".cal-edit");
    if (edit) { edit.blur(); return true; }

    /* sc:22 日历打开：点取消（与用户可见路径一致，走 close(null) 完整链路） */
    if (q(".cal-mask")) { q(".cal-mask .cal-cancel")?.click(); return true; }

    /* sc:24 ctl 下拉选择器：点按钮收起（btn 点击即 toggle） */
    const ctlList = q(".ctl-list:not([hidden])");
    if (ctlList) { ctlList.closest(".ctl-select")?.querySelector(".ctl-btn")?.click(); return true; }

    /* sc:10/11/12/13/14/15 modal 族（S.ui.modal：转账确认卡/红级 OTP/常用收款人/转入本人/
     *     月份报告确认/删除确认等，GenUI consent 同构）——优先点取消按钮走 onClose/解锁滚动的
     *     完整关闭链路（裸 remove 会泄漏 modal-open 锁滚计数与 onCancel 回调） */
    const modal = q(".modal-mask");
    if (modal) {
      /* sc:25 dirty 确认框上按返回 = 二次确认放弃（第一次返回弹框、第二次返回退出——Android
       * "再按一次"直觉；v1.2 曾走通用取消分支，返回键无限关框再弹框软卡死） */
      if (modal.querySelector("#sv-go")) {
        window.__svDirty = false;
        modal.querySelector("#sv-go").click(); /* 放弃并返回（清脏标记 + history.back） */
        return true;
      }
      const cancel = modal.querySelector("#ck-no, .modal-x, .modal-actions .btn-ghost, [data-close]");
      if (cancel) cancel.click();
      else { modal.dispatchEvent(new MouseEvent("click")); } /* S.ui.modal 点遮罩即关 */
      return true;
    }

    /* sc:16 Cookie 偏好弹窗：无取消钮（合规卡），移除即关（未同意=不开分析，合规安全） */
    const ck = q(".cookie-pop");
    if (ck) { ck.remove(); return true; }

    /* 第六十一轮 sc:16b 处理中覆盖层（S.ui.proc）开着：资金操作已在途不可中断，
     * 返回=丢回执+误导航——消费返回并提示；空态零命中（.proc-card 只在处理中存在） */
    if (q(".proc-card")) { S.ui.toast(S.t("common.procBack")); return true; }

    /* sc:17/19 header 下拉（铃铛速览/语言切换）：与点外部关闭同效果 */
    const dd = q(".dropdown");
    if (dd) { dd.remove(); return true; }

    /* sc:9 通知中心展开项：点行收起（已读项 click 即收；未读项首点已 await markRead，此处再点必收） */
    const openRow = q(".nt-row.open");
    if (openRow) { openRow.click(); return true; }

    /* ===== 搜索/筛选（先清状态，再按一次才返回） ===== */

    /* sc:26a 搜索框有值：清空并派发 input（页面监听自动重渲染），blur 收起软键盘 */
    const search = q('input[type="search"]');
    if (search && search.value) {
      search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); search.blur();
      return true;
    }
    /* sc:26b 筛选 chips：仅当某段处于【非默认】选中——段内第一个（惯例"全部"/默认项）未激活
     * 且段内有激活项——才点击第一个重置；默认态不拦截。
     * v1.2 教训（队长真机实测三页卡死）：曾盲点第一个 .hpill.on——"全部"默认永远带 .on，
     * 点击无任何效果却 return true 拦截返回 → 通知中心/交易记录/转账记录按返回死循环卡页。
     * 分段规则：同一父容器内按相邻 data-k 切段（tx-chips 的 dir 组与 days 组独立判定）；
     * 只认 button.hpill/button.chip——help 页 hpill 是锚点导航（<a>+scrollspy 恒 on），天然排除 */
    const pills = [...document.querySelectorAll("button.hpill, button.chip")];
    const byParent = new Map();
    for (const p of pills) {
      const g = p.parentElement;
      if (!g) continue;
      if (!byParent.has(g)) byParent.set(g, []);
      byParent.get(g).push(p);
    }
    for (const [, list] of byParent) {
      let seg = [], segK = null;
      const flush = () => {
        if (seg.length > 1 && !seg[0].classList.contains("on") && seg.some((x) => x.classList.contains("on"))) {
          seg[0].click(); /* 重置本段为默认（全部） */
          return true;
        }
        return false;
      };
      for (const p of list) {
        const k = p.dataset.k ?? "";
        if (seg.length && k !== segK) { if (flush()) return true; seg = []; }
        seg.push(p); segK = k;
      }
      if (flush()) return true;
    }

    /* ===== AI 页特殊（data-page="ai"） ===== */

    /* sc:20/21 历史抽屉/任务中心抽屉/三点菜单：【放行】—— ai.js 已用 pushState+popstate
     *     自治收口（返回手势=goBack→popstate→关抽屉，不跳页）。此处若自行关闭会留下死历史条目 */
    if (q(".hist-drawer.open, #tc.open, #ch-more.open")) return false;

    /* sc:30 流式回复进行中：先停流（abort 后 chat-client 自行复原发送按钮），不跳页 */
    if (typeof S.chat?.stop === "function" && S.chat._ctrl) { S.chat.stop(); return true; }

    /* 第六十轮 sc:30b 语音录音进行中（主页 hero 与 /ai 通用）：先停录音（discard——文字已上屏
     *     由 sc:29 决定去留），不跳页；空态零命中（active() 只在真实录音会话中为 true） */
    if (typeof S.voice?.active === "function" && S.voice.active()) { S.voice.stop({ discard: true }); return true; }

    /* sc:29 输入框有文字：清空（而非跳页），再按一次才返回 */
    const aiInput = page() === "ai" ? q(".chat-composer textarea, .chat-composer input") : null;
    if (aiInput && aiInput.value) {
      aiInput.value = ""; aiInput.dispatchEvent(new Event("input", { bubbles: true })); aiInput.blur();
      return true;
    }

    /* sc:31 会话 URL /ai/s/{sid}：replace 回 /ai（新对话）——历史栈变 [上一页, /ai]，
     *     再按返回回上一页（replaceState 进的会话 URL 不在栈中，无此拦截会直接跳过 /ai） */
    if (location.pathname.startsWith("/ai/s/")) {
      location.replace(S.router?.navPath?.("/ai") ?? "/ai/index.html");
      return true;
    }

    /* ===== sc:25 表单脏确认（非公开页且输入过；公开页/登录注册/AI 页不弹） ===== */
    if (window.__svDirty && !isPublic() && page() !== "ai") {
      const txt = dirtyText();
      S.ui.modal(`<h2>${S.fmt.escape(txt.t)}</h2>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="sv-stay">${S.fmt.escape(txt.b)}</button>
          <button class="btn btn-primary" id="sv-go">${S.fmt.escape(txt.g)}</button>
        </div>`);
      document.getElementById("sv-stay").onclick = () => document.querySelector(".modal-mask")?.dispatchEvent(new MouseEvent("click"));
      document.getElementById("sv-go").onclick = () => { window.__svDirty = false; history.back(); };
      return true; /* 本次返回=弹出确认；确认框自身再按返回会被上方 modal 分支关闭（=留下） */
    }

    /* ===== sc:1-7/27/28 放行：Java 层 canGoBack→goBack（MPA 页面级返回）；无历史→再按一次退出 ===== */
    return false;
  };

  /* ===== 滚动位置恢复（第五十五轮 v1.4：返回导航保持浏览位置，不回顶部）=====
   * 根因：壳内 goBack 重新供给 HTML，列表数据 fetch 后异步渲染——WebView 原生滚动恢复在
   * load 时刻执行，此刻页面高度不足被 clamp 失败留在顶部（手机 Chrome 有"等内容再恢复"
   * 优化，WebView 没有）。
   * 方案：同源（https://localhost）所有页面共享 sessionStorage——滚动 debounce+pagehide
   * 记录 {pathname:y}；新文档 navigation.type==="back_forward"（仅 Java goBack 产生）时
   * RAF 循环等 scrollHeight 撑够再 scrollTo 回原位（到位即停，至多 2.5s）。
   * 排除：/ai（聊天页自身锚定底部语义）；带 hash 的 URL（锚点导航优先）；非返回导航
   * （新进入/replace 天然回顶）。
   * 特殊情况（跨模块/表单提交）：本站提交成功均为 modal 或 location.replace（不入历史栈），
   * 到达页 navigation.type=navigate 天然回顶——符合"数据已更新回顶部"；dirty"放弃并返回"
   * 是 back_forward，恢复到出发浏览位置（回到待检查处）。
   * 防污染：恢复进行中不回写记录（防 2.5s 超时停在错误位置覆盖原值）；用户触摸/滚轮
   * 立即放弃恢复（手动优先）。 */
  (() => {
    const KEY = "sv_scroll";
    const readMap = () => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
    let restoring = false, deb = 0;
    const save = () => {
      if (restoring) return;
      const m = readMap();
      m[location.pathname] = scrollY;
      try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 隐私模式等 */ }
    };
    addEventListener("scroll", () => { clearTimeout(deb); deb = setTimeout(save, 150); }, { passive: true });
    addEventListener("pagehide", save);

    const nav = performance.getEntriesByType?.("navigation")?.[0];
    const isBack = nav ? nav.type === "back_forward" : performance.navigation?.type === 2;
    const target = isBack && !location.hash ? readMap()[location.pathname] ?? 0 : 0;
    if (!(target >= 4) || page() === "ai") return;

    restoring = true;
    const abandon = () => { restoring = false; };
    addEventListener("touchstart", abandon, { once: true, passive: true });
    addEventListener("wheel", abandon, { once: true, passive: true });
    let frames = 0;
    const tick = () => {
      if (!restoring) return;
      if (Math.abs(scrollY - target) < 4) { restoring = false; return; } /* 已到位 */
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max >= target - 4) scrollTo(0, Math.min(target, max));
      if (++frames > 150) { restoring = false; return; } /* ~2.5s 兜底：内容始终没撑够 */
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();
})();
