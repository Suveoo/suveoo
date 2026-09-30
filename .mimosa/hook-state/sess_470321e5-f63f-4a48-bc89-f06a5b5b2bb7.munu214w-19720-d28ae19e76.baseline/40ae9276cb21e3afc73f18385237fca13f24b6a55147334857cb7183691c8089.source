/* tool-kit.js — 计算工具页共享助手：URL 参数预填、oninput 联动重算、history.replaceState 同步（链接可分享）
   第五期 idle：bind/sync 支持 opts.scope/params/noSync —— 同一套页面控制器可在工具页路由与 AI 对话内嵌
   （S.toolPages[slug](root,{params,embed})）两处复用，互不干扰（内嵌不改 /ai 的 URL、ID 查找限定在容器内）。 */
S.toolKit = {
  /* 读输入数字；空或非法返回 null（页面据此提示）。scope 限定查找容器（内嵌实例互不冲突） */
  num(id, scope) {
    const el = (scope ?? document).querySelector?.("#" + id) ?? document.getElementById(id);
    const raw = (el?.value ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  fmt(v) { return "¥ " + S.fmt.moneyPlain(v); },
  /* bind(map, calc, opts)：map = [{ id, param?, def }]；param 缺省用 id；
     opts.scope：元素查找范围（默认 document——工具页路由态不变）；
     opts.params：URLSearchParams 或对象——预填来源（默认当前页 URL；AI 内嵌传深链解析出的参数）；
     opts.noSync：不把值写回地址栏（AI 内嵌在 /ai，绝不能改写 /ai 的 URL）。
     URL 有值先预填；每次 input/change 重算并把与默认值不同的字段写回 URL */
  bind(map, calc, opts = {}) {
    const scope = opts.scope ?? document;
    const q = opts.params instanceof URLSearchParams ? opts.params : new URLSearchParams(opts.params ?? location.search);
    const get = (id) => (scope === document ? document.getElementById(id) : scope.querySelector("#" + id));
    let touched = false;
    for (const f of map) {
      const el = get(f.id);
      if (!el) continue;
      const pv = q.get(f.param ?? f.id);
      if (pv != null && pv !== "") { el.value = pv; touched = true; }
      const h = () => { calc(); if (!opts.noSync) this.sync(map, scope); };
      el.addEventListener("input", h);
      if (el.tagName === "SELECT") el.addEventListener("change", h);
    }
    if (touched && !opts.noSync) this.sync(map, scope); // 规范化：去掉与默认值相同的参数
    calc();
  },
  sync(map, scope = document) {
    const q = new URLSearchParams();
    const get = (id) => (scope === document ? document.getElementById(id) : scope.querySelector("#" + id));
    for (const f of map) {
      const el = get(f.id);
      if (!el) continue;
      const val = String(el.value ?? "").trim();
      if (val === "" || val === String(f.def)) continue; // 默认值不进 URL，链接干净
      q.set(f.param ?? f.id, val);
    }
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  },
};

/* S.tools —— AI 对话内嵌工具渲染（第五期 idle 任务 4）：
   页面控制器把渲染主体注册到 S.toolPages[slug]；md.js 的"打开图形化计算器"按钮卡下方追加
   .tool-embed 占位（hidden）；消息定稿后 hydrate 在占位内渲染完整可交互工具（同款输入/计算/图表）。
   深链参数与工具页共用同一 URL 参数协议（opts.params 传入，绝不另造第二套）。 */
S.tools = {
  async hydrate(scope) {
    if (!scope || !scope.querySelectorAll) return;
    for (const el of scope.querySelectorAll(".tool-embed:not([data-hydrated])")) {
      const slug = el.dataset.tool;
      const fn = (window.S?.toolPages ?? {})[slug];
      if (!fn) continue; // 未注册（如脚本缺失）：保持隐藏占位，按钮卡跳页能力不受影响
      el.dataset.hydrated = "1";
      el.hidden = false;
      try {
        await fn(el, { params: new URLSearchParams(el.dataset.query || ""), embed: true });
      } catch (e) {
        console.error("[tool-embed]", slug, e);
        el.remove(); // 单卡异常只损失该内嵌块，不影响消息流（GenUI 卡同款纪律）
      }
    }
  },
};
