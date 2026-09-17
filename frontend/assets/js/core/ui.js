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
  icon(name, size = 20) { return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-${name}"/></svg>`; },
  clear(node) { while (node.firstChild) node.removeChild(node.firstChild); },
  toast(msg, isErr = false) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = S.ui.el('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const t = S.ui.el(`<div class="toast${isErr ? " err" : ""}">${S.fmt.escape(msg)}</div>`);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  },
  modal(content, { onClose = null, large = false } = {}) {
    const mask = S.ui.el(`<div class="modal-mask"><div class="modal${large ? " modal-lg" : ""}" role="dialog"></div></div>`);
    const box = mask.querySelector(".modal");
    if (typeof content === "string") box.innerHTML = content; else box.appendChild(content);
    document.body.appendChild(mask);
    const close = () => { mask.remove(); onClose && onClose(); };
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
  /* 预测问题 chip 尾部的灰色回勾箭头（自绘 SVG，跟随最后一个字） */
  chipGo: `<svg class="chip-go" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 10 5 14l4 4"/><path d="M5 14h10a4 4 0 0 0 4-4V7"/></svg>`,
  tierBadge(tier) {
    const m = { GREEN: ["badge-green", S.t("tier.GREEN")], YELLOW: ["badge-yellow", S.t("tier.YELLOW")], RED: ["badge-red", S.t("tier.RED")] };
    const [c, label] = m[tier] ?? m.GREEN;
    return `<span class="badge ${c}">${S.fmt.escape(label)}</span>`;
  },
};
