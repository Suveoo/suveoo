/* ui.js — DOM/组件工具（S.ui） */
S.ui = {
  $: (sel, root = document) => root.querySelector(sel),
  $$: (sel, root = document) => [...root.querySelectorAll(sel)],
  el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; },
  /* 复制到剪贴板：clipboard API 失败/不可用（部分移动 webview、非聚焦文档）回落 execCommand */
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 落到兜底 */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  },
  /* icon(name, size)：线性 i-* 走 sprite（currentColor，接口与全站调用零改动）；
     彩色 ic-<glyph>-<family> 改为内联生成（第二十三轮 D：外部 sprite <use> 引用共享渐变 defs
     在部分 webview 间歇性不渲染——实测同页时画时不画；内联 defs 100% 可靠）。
     sprite 引用拼 ?v= ——R2 按 URL 缓存，bump 版本即对全员强制换图标（与插画同策略）。 */
  icon(name, size = 20) {
    if (name.startsWith("ic-")) return S.ui.iconC(name, size);
    return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="/assets/icons/sprite.svg?v=${S.ui.v()}#i-${name}"/></svg>`;
  },
  /* 彩色图标族：squircle 渐变底（六族+navy，135° 深→浅，色值=tokens.css）+ 白（金族深棕）前景 + 左上高光点 */
  iconC(name, size = 24) {
    const m = name.match(/^ic-([a-z0-9]+)-([a-z]+)$/);
    if (!m) return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="/assets/icons/sprite.svg?v=${S.ui.v()}#i-${name.slice(3)}"/></svg>`;
    const [, glyph, fam] = m;
    const grad = {
      navy: ["#1E2A78", "#35479E"], sky: ["#0E8FE0", "#38BDF8"], orange: ["#F97316", "#FFB020"],
      gold: ["#F5B301", "#FFD866"], violet: ["#6D28D9", "#A78BFA"], teal: ["#0D9488", "#2DD4BF"], rose: ["#E11D48", "#FB7185"],
    }[fam];
    const g = {
      pay: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
      users: '<circle cx="9" cy="8" r="3.5"/><path d="M3.2 19c.6-3.2 2.9-4.8 5.8-4.8s5.2 1.6 5.8 4.8"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.4c2.6.1 4.4 1.6 4.9 4.1"/>',
      bank: '<path d="m3 9 9-6 9 6"/><path d="M5 9v10h14V9"/><path d="M9 19v-6h6v6"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
      doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9.5 13h5M9.5 17h5"/>',
      card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
      wealth: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V8"/>',
      exchange: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
      trend: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m6 15 4-4 3 3 5-6"/><path d="M18 8h-3M18 8v3"/>',
      star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>',
      ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v3.4M17.3 17.7h3.4"/>',
      chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 14 4-4 3 3 5-6"/>',
      shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
      bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/><path d="M12 15v2"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    }[glyph];
    if (!grad || !g) return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="/assets/icons/sprite.svg?v=${S.ui.v()}#i-${glyph}"/></svg>`;
    const id = "icg-" + (++S.ui._icSeq);
    const fg = fam === "gold" ? "#4A3200" : "#fff";
    /* 左上高光小点已按队长要求移除（第三十三轮）：全站彩色 squircle 图标不再带偏左上圆点 */
    return `<svg class="ic ic-c" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs><rect width="24" height="24" rx="7.5" fill="url(#${id})"/><g fill="none" stroke="${fg}" stroke-width="3.43" stroke-linecap="round" stroke-linejoin="round" transform="translate(5 5) scale(.583)">${g}</g></svg>`;
  },
  _icSeq: 0,
  /* 当前 HTML 资产版本（?v=bNNN）：JS 内引用图片/插画时拼 ?v= 用——R2 内容更新后 bump 版本即全员换图（第十七轮教训） */
  v() { return (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1] ?? ""; },
  clear(node) { while (node.firstChild) node.removeChild(node.firstChild); },
  toast(msg, isErr = false) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = S.ui.el('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const t = S.ui.el(`<div class="toast${isErr ? " err" : ""}">${S.fmt.escape(msg)}</div>`);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  },
  _modalCount: 0,
  /* 弹窗锁背景滚动（嵌套计数：modal/OTP 等多个弹层共存时最后一个关掉才解锁） */
  _lockScroll() { S.ui._modalCount++; document.body.classList.add("modal-open"); },
  _unlockScroll() { S.ui._modalCount = Math.max(0, S.ui._modalCount - 1); if (!S.ui._modalCount) document.body.classList.remove("modal-open"); },
  modal(content, { onClose = null, large = false } = {}) {
    const mask = S.ui.el(`<div class="modal-mask"><div class="modal${large ? " modal-lg" : ""}" role="dialog"></div></div>`);
    const box = mask.querySelector(".modal");
    if (typeof content === "string") box.innerHTML = content; else box.appendChild(content);
    document.body.appendChild(mask);
    S.ui._lockScroll();
    const close = () => { mask.remove(); S.ui._unlockScroll(); onClose && onClose(); };
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    return { el: box, close };
  },
  skeleton(rows = 3) { return Array.from({ length: rows }, () => '<div class="skeleton" style="margin-bottom:12px"></div>').join(""); },
  empty(text, actionHtml = "") {
    return `<div class="empty"><img src="/assets/images/illustrations/empty-state.svg" alt=""><p>${S.fmt.escape(text)}</p>${actionHtml}</div>`;
  },
  badge(text, cls = "badge-gray") { return `<span class="badge ${cls}">${S.fmt.escape(text)}</span>`; },
  /* 密码框眼睛按钮：button[data-eye="<inputId>"] 点击切换 text/password 并换图标（注册与安全中心改密共用） */
  bindEyes(scope) {
    (scope ?? document).querySelectorAll("button[data-eye]").forEach((b) => {
      b.onclick = () => {
        const input = document.getElementById(b.dataset.eye);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        b.innerHTML = S.ui.icon(show ? "eye-off" : "eye", 18);
        b.setAttribute("aria-label", S.t(show ? "common.hidePass" : "common.showPass"));
        b.title = S.t(show ? "common.hidePass" : "common.showPass");
      };
    });
  },
  tierBadge(tier) {
    const m = { GREEN: ["badge-green", S.t("tier.GREEN")], YELLOW: ["badge-yellow", S.t("tier.YELLOW")], RED: ["badge-red", S.t("tier.RED")] };
    const [c, label] = m[tier] ?? m.GREEN;
    return `<span class="badge ${c}">${S.fmt.escape(label)}</span>`;
  },
};
