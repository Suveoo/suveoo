/* ctl.js — 自绘控件（S.ctl）：替代原生 <select> 与 window.prompt 的 OTP 输入
   设计遵守 polish.css 克制原则：中性墨影、120-220ms 动效、无 emoji、文本左对齐。 */
S.ctl = {
  /* 全局点外关闭（同一时刻只允许一个下拉展开） */
  _closeAll() { document.querySelectorAll(".ctl-select.open").forEach((s) => s.classList.remove("open")); },
  /**
   * 自绘下拉。opts = { label, options: [{v, label, header?}], value, onChange }
   * header:true 的项渲染为不可选分组标题（长列表按类目分段，如 demo-lab 的 90 职业）。
   * 返回根元素（div.ctl-select）：.value 始终为当前选中 v（可赋值切换）；变化时派发 input 事件并回调 onChange，
   * 因此 S.toolKit.bind / 表单读取 .value 的既有代码无需改动。键盘：↑↓ 移动（跳过分组头）、Enter 确认、Esc 关闭。
   */
  select({ label = "", options = [], value, onChange } = {}) {
    const root = S.ui.el(`<div class="ctl-select"></div>`);
    const btn = S.ui.el(`<button type="button" class="ctl-btn" aria-haspopup="listbox" aria-expanded="false"><span class="ctl-val"></span>${S.ui.icon("chevron", 16)}</button>`);
    const list = S.ui.el(`<div class="ctl-list" role="listbox" aria-label="${S.fmt.escape(label)}" hidden></div>`);
    root.append(btn, list);
    const selectable = options.filter((o) => !o.header);
    let current = selectable.find((o) => String(o.v) === String(value)) ?? selectable[0] ?? { v: "", label: "" };
    const valEl = btn.querySelector(".ctl-val");
    const render = () => {
      valEl.textContent = current.label;
      list.innerHTML = options.map((o) => o.header
        ? `<div class="ctl-opt ctl-opt-header" role="presentation">${S.fmt.escape(o.label)}</div>`
        : `<div class="ctl-opt" role="option" data-v="${S.fmt.escape(String(o.v))}" aria-selected="${String(o.v) === String(current.v)}">${S.fmt.escape(o.label)}</div>`).join("");
    };
    const commit = (v, silent) => {
      const next = selectable.find((o) => String(o.v) === String(v));
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
      /* 仅当滚动发生在菜单外部（页面滚动/锚点漂移）才收起；菜单内部自身滚动（触屏拖动/滚轮）必须放行——
         scroll 不冒泡但走捕获，window capture 会收到文档内任何滚动容器的 scroll（含 .ctl-list 自身，
         手机触摸菜单内部即被误关的根因）。overscroll-behavior:contain 已防滚动铰链外溢。 */
      onScroll = (e) => { if (e && e.target && e.target !== window && (e.target === list || list.contains(e.target))) return; close(); };
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("resize", onScroll);
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel) sel.scrollIntoView({ block: "nearest" });
    };
    btn.onclick = () => (root.classList.contains("open") ? close() : open());
    list.addEventListener("click", (e) => {
      const opt = e.target.closest(".ctl-opt");
      if (!opt || opt.classList.contains("ctl-opt-header")) return;
      commit(opt.dataset.v);
      close();
      btn.focus();
    });
    btn.addEventListener("keydown", (e) => {
      const opts = [...list.querySelectorAll(".ctl-opt:not(.ctl-opt-header)")];
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
   * 日历选择器（第二十三期 /wealth/goals 截止日期）：背景模糊遮罩 + 锁滚；
   * 头部年/月为可点击数字 → 变输入框直接键入（鲁棒解析：去空格/全角/前导零，年夹 1970-2100、月 1-12）；
   * resolve("YYYY-MM-DD") 或 resolve(null)（取消/点遮罩）。挂 body 突破容器。
   * 第二十八轮 time:true → 日期时间版（预约转账）：日不直接关闭改为高亮，附 时/分/秒 三段
   * 可点击键入（同款鲁棒解析），resolve("YYYY-MM-DD HH:mm:ss")；此刻/取消/确定 三钮。
   */
  calendar({ value = "", time = false } = {}) {
    return new Promise((resolve) => {
      const m0 = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
      let cur = m0 ? new Date(m0[1] + "T00:00:00") : new Date();
      if (Number.isNaN(cur.getTime())) cur = new Date();
      let selDate = m0 ? m0[1] : null;
      let hh = m0 ? Number(m0[2]) : 9, mi = m0 ? Number(m0[3]) : 0, ss = m0?.[4] ? Number(m0[4]) : 0;
      const today = new Date();
      const mask = S.ui.el(`<div class="cal-mask"></div>`);
      const box = S.ui.el(`<div class="cal${time ? " cal-time" : ""}" role="dialog" aria-label="date"></div>`);
      mask.appendChild(box);
      document.body.appendChild(mask);
      S.ui._lockScroll();
      const close = (v) => { mask.remove(); S.ui._unlockScroll(); resolve(v); };
      mask.addEventListener("click", (e) => { if (e.target === mask) close(null); });
      const esc = (e) => { if (e.key === "Escape") { close(null); document.removeEventListener("keydown", esc); } };
      document.addEventListener("keydown", esc);
      /* 鲁棒数字解析："01"/"1"/"0001"/"0 1"/全角 → int 或 null */
      const num = (raw) => {
        const n = parseInt(String(raw ?? "").replace(/[\s\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/^0+(?=\d)/, ""), 10);
        return Number.isFinite(n) ? n : null;
      };
      const p2 = (x) => String(x).padStart(2, "0");
      /* 悬空编辑兜底：blur 未及触发（焦点被程序化挪走等边角）时，任何重渲染先把编辑值收账再重建 */
      let editing = null;
      const finishEdit = () => {
        if (!editing) return;
        const { inp, apply, lo, hi } = editing;
        editing = null;
        if (!inp.isConnected) return;
        const n = num(inp.value);
        if (n != null) apply(Math.min(hi, Math.max(lo, n)));
      };
      const render = () => {
        finishEdit();
        const y = cur.getFullYear(), m = cur.getMonth();
        const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; /* 周一为首 */
        const dim = new Date(y, m + 1, 0).getDate();
        const wk = [...Array(7)].map((_, i) => `<span class="cal-wk">${"一二三四五六日"[i]}</span>`).join("");
        let cells = "";
        for (let i = 0; i < firstDow; i++) cells += "<span></span>";
        for (let d = 1; d <= dim; d++) {
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const cls = selDate === iso ? "sel" : (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d ? "today" : "");
          cells += `<button type="button" class="${cls}" data-d="${iso}">${d}</button>`;
        }
        const timeRow = !time ? "" : `
          <div class="cal-timerow">
            <button type="button" class="cal-t" data-k="h">${p2(hh)}</button><i>时</i>
            <button type="button" class="cal-t" data-k="m">${p2(mi)}</button><i>分</i>
            <button type="button" class="cal-t" data-k="s">${p2(ss)}</button><i>秒</i>
          </div>
          <div class="cal-foot">
            <button type="button" class="cal-quick" data-q="now">此刻</button>
            <span class="grow"></span>
            <button type="button" class="cal-cancel">取消</button>
            <button type="button" class="cal-ok">确定</button>
          </div>`;
        box.innerHTML = `
          <div class="cal-head">
            <button type="button" class="cal-nav" data-n="-1" aria-label="prev">${S.ui.icon("arrow-left", 14)}</button>
            <span class="cal-ym"><button type="button" class="cal-y" data-y="${y}">${y}</button><i>年</i><button type="button" class="cal-m" data-m="${m + 1}">${m + 1}</button><i>月</i></span>
            <button type="button" class="cal-nav" data-n="1" aria-label="next">${S.ui.icon("arrow-right", 14)}</button>
          </div>
          <div class="cal-grid cal-wkrow">${wk}</div>
          <div class="cal-grid">${cells}</div>
          ${timeRow}`;
        /* 数字点击 → 输入态（Enter/失焦提交，Esc 还原）：年/月/时/分/秒共用 */
        const editNum = (btn, val, lo, hi, apply) => {
          const inp = document.createElement("input");
          inp.type = "text"; inp.inputMode = "numeric"; inp.className = "cal-edit";
          inp.value = String(val);
          btn.replaceWith(inp);
          inp.focus(); inp.select();
          editing = { inp, apply, lo, hi };
          const commit = () => { finishEdit(); render(); };
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
            else if (e.key === "Escape") { inp.value = String(val); inp.blur(); }
          });
          inp.addEventListener("blur", commit);
        };
        box.querySelector(".cal-y").onclick = (e) => editNum(e.currentTarget, y, 1970, 2100, (ny) => { cur = new Date(ny, m, 1); });
        box.querySelector(".cal-m").onclick = (e) => editNum(e.currentTarget, m + 1, 1, 12, (nm) => { cur = new Date(y, nm - 1, 1); });
        box.querySelectorAll(".cal-nav").forEach((b) => {
          b.onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() + Number(b.dataset.n), 1); render(); };
        });
        box.querySelectorAll(".cal-grid [data-d]").forEach((b) => {
          b.onclick = () => {
            if (!time) close(b.dataset.d);
            else { selDate = b.dataset.d; render(); }
          };
        });
        if (time) {
          const seg = { h: [() => hh, (v) => (hh = v), 0, 23], m: [() => mi, (v) => (mi = v), 0, 59], s: [() => ss, (v) => (ss = v), 0, 59] };
          box.querySelectorAll(".cal-t").forEach((b) => {
            const [get, set, lo, hi] = seg[b.dataset.k];
            b.onclick = (e) => editNum(e.currentTarget, get(), lo, hi, set);
          });
          box.querySelector(".cal-quick").onclick = () => {
            const n = new Date();
            cur = new Date(n.getFullYear(), n.getMonth(), 1);
            selDate = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;
            hh = n.getHours(); mi = n.getMinutes(); ss = n.getSeconds();
            render();
          };
          box.querySelector(".cal-cancel").onclick = () => close(null);
          box.querySelector(".cal-ok").onclick = () => { finishEdit(); close(selDate ? `${selDate} ${p2(hh)}:${p2(mi)}:${p2(ss)}` : null); };
        }
      };
      render();
    });
  },
  /**
   * Promise 化 OTP 弹窗（复用 consent 弹窗视觉）。
   * opts = { email（展示用）, send: async () => {...}（发码；返回 api 响应对象或布尔，
   *   响应带 channel/masked/alt 时按实际通道更新提示并挂 S.phone 切换条）,
   *   scene/extra（切换条重发参数，透传 otpSwitcher）,
   *   expiresAt（可选 ISO——grant 型红级确认（AI 确认卡等）传入：弹窗内显示有效剩余，
   *   归零锁定输入/发码/切换/确认，杜绝"卡已过期还能发码"） }
   * resolve(6 位码) 或 resolve(null)（取消）。发送按钮三态：待发 → 60s 倒计时 → 可重发。
   */
  otp({ email, send, scene = "redstep", extra = {}, expiresAt = null } = {}) {
    const grantExp = expiresAt ? Date.parse(expiresAt) : null;
    return new Promise((resolve) => {
      const box = S.ui.el(`
        <div class="modal-mask"><div class="modal">
          <h2>${S.fmt.escape(S.t("consent.otp"))}</h2>
          <p class="muted small" style="margin-top:4px" id="ctl-otp-hint">${S.fmt.escape(S.t("ctl.otpHint"))} <span class="mono">${S.fmt.escape(email ?? "")}</span></p>
          <div class="gc-otp" style="margin-top:12px">
            <input class="input" id="ctl-otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="······">
            <button class="btn btn-light" id="ctl-send" style="flex:none">${S.fmt.escape(S.t("consent.getCode"))}</button>
          </div>
          ${grantExp ? `<div class="gc-countdown" id="ctl-cd"></div>` : ""}
          <div class="modal-actions">
            <button class="btn btn-ghost" id="ctl-no">${S.fmt.escape(S.t("common.cancel"))}</button>
            <button class="btn btn-primary" id="ctl-ok">${S.fmt.escape(S.t("consent.confirm"))}</button>
          </div>
        </div></div>`);
      document.body.appendChild(box);
      S.ui._lockScroll();
      const input = box.querySelector("#ctl-otp");
      const sendBtn = box.querySelector("#ctl-send");
      const close = (v) => { clearInterval(timer); clearInterval(expTimer); box.remove(); S.ui._unlockScroll(); resolve(v); };
      input.focus();
      /* 队长令（第九十六轮）：打开即按会话默认接码通道显示接收方（绑手机号=短信掩码；
       * 未绑/偏好邮箱=邮箱掩码）——不再静态写死"邮箱 (xxx@gmail.com)"误导短信用户。
       * 第九十八轮（队长实测 AI 确认卡弹窗缺失切换按钮）：双通道齐全时直接预挂切换条
       * （pending 态"将发送至"）——此前切换条只在首次发码后才出现。 */
      (async () => {
        try {
          const sess = S.auth._session !== undefined ? S.auth._session : await S.auth.session();
          const hint = box.querySelector("#ctl-otp-hint");
          if (!hint || !sess) return;
          const desc = S.phone?.otpDescFromSession?.(sess);
          if (desc) {
            const sw = S.phone.otpSwitcher(desc, scene, extra, { pending: true });
            if (sw) { hint.replaceWith(sw); return; }
          }
          const tgt = sess.otp_channel === "phone" && sess.phone ? sess.phone : (sess.email ?? email ?? "");
          const mono = hint.querySelector(".mono");
          if (tgt && mono) mono.textContent = tgt;
        } catch { /* 会话不可得时保持调用方传入的展示 */ }
      })();
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector("#ctl-ok").click(); });
      box.querySelector("#ctl-no").onclick = () => close(null);
      box.addEventListener("click", (e) => { if (e.target === box) close(null); });
      box.querySelector("#ctl-ok").onclick = () => {
        const code = input.value.trim();
        if (!/^\d{6}$/.test(code)) { S.ui.toast(S.t("consent.otpNeeded"), true); return; }
        close(code);
      };
      /* 第九十九轮：grant 型弹窗的有效期倒计时——归零锁死输入/发码/切换/确认
       * （grant 已过期则验证码无处可用，杜绝"过期后还能获取验证码白白发码"）。 */
      let expired = false;
      let expTimer = null;
      const lockAll = () => {
        expired = true;
        clearInterval(timer);
        const cdEl = box.querySelector("#ctl-cd");
        if (cdEl) { cdEl.textContent = S.t("consent.expired"); cdEl.style.color = "var(--color-red, #C4453B)"; }
        input.disabled = true;
        sendBtn.disabled = true; sendBtn.textContent = S.t("consent.getCode");
        const swb = box.querySelector(".ph-switch-btn"); if (swb) swb.disabled = true;
        const okB = box.querySelector("#ctl-ok"); if (okB) okB.disabled = true;
      };
      if (grantExp) {
        const cdEl = box.querySelector("#ctl-cd");
        const tick = () => {
          const lv = Math.floor((grantExp - Date.now()) / 1000);
          if (lv <= 0) { clearInterval(expTimer); lockAll(); return; }
          if (cdEl) cdEl.textContent = `${S.t("consent.expiresIn")} ${lv}s`;
        };
        tick();
        expTimer = setInterval(tick, 1000);
        if (Date.parse(expiresAt) <= Date.now()) lockAll(); /* 打开即已过期（防御：调用方应已拦截） */
      }
      /* 发送三态：待发 → 倒计时（禁用）→ 可重发 */
      let timer = null;
      sendBtn.onclick = async () => {
        if (expired) return;
        sendBtn.disabled = true;
        sendBtn.textContent = S.t("ctl.sending");
        let res = null, ok = false;
        try {
          res = await send();
          ok = res && typeof res === "object" ? res.ok === true : !!res;
        } catch { ok = false; }
        if (!ok) { if (!expired) { sendBtn.disabled = false; sendBtn.textContent = S.t("consent.getCode"); } return; }
        S.ui.toast(S.t("consent.codeSent"));
        /* 第九十五轮：通道描述符（redstep 默认按绑定通道分流后，响应带 channel/masked/alt）——
         * 提示行改显实际接收方；绑手机号用户挂切换条（两通道码均算数）。
         * 第九十八轮：首次发码前已预挂 pending 切换条——发送后以实际响应重建（翻"已发送至"） */
        const d = res && typeof res === "object" && res.data && res.data.channel ? res.data : null;
        if (d && d.masked && !expired) {
          const anchor = box.querySelector("#ctl-otp-hint") ?? box.querySelector(".ph-switch");
          if (anchor) {
            const sw = S.phone?.otpSwitcher?.(d, scene, extra);
            if (sw) anchor.replaceWith(sw);
          }
        }
        let left = 60;
        sendBtn.textContent = S.t("ctl.resendIn", left);
        timer = setInterval(() => {
          left--;
          if (left <= 0) { clearInterval(timer); if (!expired) { sendBtn.disabled = false; sendBtn.textContent = S.t("consent.getCode"); } return; }
          sendBtn.textContent = S.t("ctl.resendIn", left);
        }, 1000);
      };
    });
  },
};
