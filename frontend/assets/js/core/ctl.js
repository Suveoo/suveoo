/* ctl.js — 自绘控件（S.ctl）：替代原生 <select> 与 window.prompt 的 OTP 输入
   设计遵守 polish.css 克制原则：中性墨影、120-220ms 动效、无 emoji、文本左对齐。 */
S.ctl = {
  /* 全局点外关闭（同一时刻只允许一个下拉展开） */
  _closeAll() { document.querySelectorAll(".ctl-select.open").forEach((s) => s.classList.remove("open")); },
  /**
   * 自绘下拉。opts = { label, options: [{v, label}], value, onChange }
   * 返回根元素（div.ctl-select）：.value 始终为当前选中 v（可赋值切换）；变化时派发 input 事件并回调 onChange，
   * 因此 S.toolKit.bind / 表单读取 .value 的既有代码无需改动。键盘：↑↓ 移动、Enter 确认、Esc 关闭。
   */
  select({ label = "", options = [], value, onChange } = {}) {
    const root = S.ui.el(`<div class="ctl-select"></div>`);
    const btn = S.ui.el(`<button type="button" class="ctl-btn" aria-haspopup="listbox" aria-expanded="false"><span class="ctl-val"></span>${S.ui.icon("chevron", 16)}</button>`);
    const list = S.ui.el(`<div class="ctl-list" role="listbox" aria-label="${S.fmt.escape(label)}" hidden></div>`);
    root.append(btn, list);
    let current = options.find((o) => String(o.v) === String(value)) ?? options[0] ?? { v: "", label: "" };
    const valEl = btn.querySelector(".ctl-val");
    const render = () => {
      valEl.textContent = current.label;
      list.innerHTML = options.map((o) => `<div class="ctl-opt" role="option" data-v="${S.fmt.escape(String(o.v))}" aria-selected="${String(o.v) === String(current.v)}">${S.fmt.escape(o.label)}</div>`).join("");
    };
    const commit = (v, silent) => {
      const next = options.find((o) => String(o.v) === String(v));
      if (!next) return;
      current = next;
      render();
      if (!silent) { root.dispatchEvent(new Event("input", { bubbles: true })); onChange?.(current.v); }
    };
    /* 下拉面板挂 body（fixed 定位）：突破任何祖先的 overflow/滚动容器（模态、卡片内不再裁剪/内滚）；
       open 时锚定按钮位置，下方空间不足上翻；页面滚动/缩放即收起（业界惯例——避免锚点漂移）；
       close 时面板归位回 root 内（宿主容器销毁时随root 一并移除，无孤儿 DOM） */
    let onScroll = null;
    const close = () => {
      if (onScroll) { window.removeEventListener("scroll", onScroll, { capture: true }); window.removeEventListener("resize", onScroll); onScroll = null; }
      root.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      list.hidden = true;
      root.append(list);
    };
    const open = () => {
      S.ctl._closeAll();
      root.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      document.body.appendChild(list);
      list.hidden = false;
      const r = btn.getBoundingClientRect();
      list.style.left = r.left + "px";
      list.style.minWidth = Math.max(r.width, 160) + "px";
      const below = window.innerHeight - r.bottom, listH = list.offsetHeight;
      list.style.top = (below < listH + 12 && r.top > listH + 12 ? r.top - listH - 4 : r.bottom + 4) + "px";
      onScroll = () => close();
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("resize", onScroll);
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel) sel.scrollIntoView({ block: "nearest" });
    };
    btn.onclick = () => (root.classList.contains("open") ? close() : open());
    list.addEventListener("click", (e) => {
      const opt = e.target.closest(".ctl-opt");
      if (!opt) return;
      commit(opt.dataset.v);
      close();
      btn.focus();
    });
    btn.addEventListener("keydown", (e) => {
      const opts = [...list.querySelectorAll(".ctl-opt")];
      if (!opts.length) return;
      const idx = opts.findIndex((o) => o.dataset.v === String(current.v));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!root.classList.contains("open")) { open(); return; }
        const next = opts[Math.max(0, Math.min(opts.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))];
        commit(next.dataset.v);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        root.classList.contains("open") ? (close(), btn.focus()) : open();
      } else if (e.key === "Escape" && root.classList.contains("open")) {
        e.stopPropagation();
        close();
      }
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target) && !list.contains(e.target)) close(); }, { capture: true });
    Object.defineProperty(root, "value", {
      get: () => current.v,
      set: (v) => commit(v, true),
      configurable: true,
    });
    render();
    return root;
  },
  /**
   * Promise 化 OTP 弹窗（复用 consent 弹窗视觉）。
   * opts = { email（展示用）, send: async () => {...}（发码，抛错或返回 falsy 视为失败） }
   * resolve(6 位码) 或 resolve(null)（取消）。发送按钮三态：待发 → 60s 倒计时 → 可重发。
   */
  otp({ email, send } = {}) {
    return new Promise((resolve) => {
      const box = S.ui.el(`
        <div class="modal-mask"><div class="modal">
          <h2>${S.fmt.escape(S.t("consent.otp"))}</h2>
          <p class="muted small" style="margin-top:4px">${S.fmt.escape(S.t("ctl.otpHint"))} <span class="mono">${S.fmt.escape(email ?? "")}</span></p>
          <div class="gc-otp" style="margin-top:12px">
            <input class="input" id="ctl-otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="······">
            <button class="btn btn-light" id="ctl-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="ctl-no">${S.fmt.escape(S.t("common.cancel"))}</button>
            <button class="btn btn-primary" id="ctl-ok">${S.fmt.escape(S.t("consent.confirm"))}</button>
          </div>
        </div></div>`);
      document.body.appendChild(box);
      S.ui._lockScroll();
      const input = box.querySelector("#ctl-otp");
      const sendBtn = box.querySelector("#ctl-send");
      const close = (v) => { clearInterval(timer); box.remove(); S.ui._unlockScroll(); resolve(v); };
      input.focus();
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector("#ctl-ok").click(); });
      box.querySelector("#ctl-no").onclick = () => close(null);
      box.addEventListener("click", (e) => { if (e.target === box) close(null); });
      box.querySelector("#ctl-ok").onclick = () => {
        const code = input.value.trim();
        if (!/^\d{6}$/.test(code)) { S.ui.toast(S.t("consent.otpNeeded"), true); return; }
        close(code);
      };
      /* 发送三态：待发 → 倒计时（禁用）→ 可重发 */
      let timer = null;
      sendBtn.onclick = async () => {
        sendBtn.disabled = true;
        sendBtn.textContent = S.t("ctl.sending");
        let ok = false;
        try { ok = !!(await send()); } catch { ok = false; }
        if (!ok) { sendBtn.disabled = false; sendBtn.textContent = S.t("consent.getCode"); return; }
        S.ui.toast(S.t("consent.codeSent"));
        let left = 60;
        sendBtn.textContent = S.t("ctl.resendIn", left);
        timer = setInterval(() => {
          left--;
          if (left <= 0) { clearInterval(timer); sendBtn.disabled = false; sendBtn.textContent = S.t("consent.getCode"); }
          else sendBtn.textContent = S.t("ctl.resendIn", left);
        }, 1000);
      };
    });
  },
};
