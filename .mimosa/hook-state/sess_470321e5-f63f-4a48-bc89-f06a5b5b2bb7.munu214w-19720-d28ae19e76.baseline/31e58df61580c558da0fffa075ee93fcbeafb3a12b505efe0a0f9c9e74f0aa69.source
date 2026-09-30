/* format.js — 金额/日期/卡号/时区格式化（全站命名空间 window.S） */
window.S = window.S || {};
S.fmt = {
  money(v, { sign = false } = {}) {
    const n = Number(v ?? 0);
    const s = Math.abs(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (sign && n > 0 ? "+" : n < 0 ? "-" : "") + "¥" + s;
  },
  moneyPlain(v) { return Number(v ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  date(iso, withTime = false) {
    if (!iso) return "—";
    const d = new Date(iso);
    const p = (x) => String(x).padStart(2, "0");
    const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
  },
  datetime(iso) { return this.date(iso, true); },
  /* 精确到秒：预约转账执行时间语义专用（确认卡/任务中心/任务列表——第二十八轮起预约可精确到秒，展示层不得截断） */
  datetimeSec(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return this.date(iso, true);
    return `${this.date(iso, true)}:${String(d.getSeconds()).padStart(2, "0")}`;
  },
  relTime(iso) {
    const diff = Date.now() - Date.parse(iso);
    if (diff < 60e3) return S.t("time.justNow");
    if (diff < 3600e3) return S.t("time.minAgo", Math.floor(diff / 60e3));
    if (diff < 86400e3) return S.t("time.hourAgo", Math.floor(diff / 3600e3));
    return S.t("time.dayAgo", Math.floor(diff / 86400e3));
  },
  cardNum(n) { return /^\d{16}$/.test(n ?? "") ? `**** ${n.slice(-4)}` : n; },
  /* 卡号输入鲁棒化（第二十八轮转账页）：全角/空格/横线全收 → 数字串；groupCard 每 4 位插空格。
     "6222880177757477" 与 "6222 8801 7775 7477" 归一为同一 16 位串。 */
  digits16(raw) { return String(raw ?? "").replace(/[\s\uFF10-\uFF19-]/g, (c) => (c === "-" ? "" : String.fromCharCode(c.charCodeAt(0) - 0xFEE0))).replace(/\D/g, "").slice(0, 16); },
  groupCard(digits) { return this.digits16(digits).replace(/(\d{4})(?=\d)/g, "$1 "); },
  luhn16(digits) { const d = this.digits16(digits); if (d.length !== 16) return false; let s = 0; for (let i = 0; i < 16; i++) { let n = Number(d[15 - i]); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; },
  /* 时区双显（预约转账）：本地 + 北京时间 */
  dualTime(iso) {
    const d = new Date(iso);
    /* 执行时间语义带秒（预约转账可精确到秒，第二十八轮起展示层不得截断） */
    const local = this.datetimeSec(iso);
    const bj = d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/\//g, "-");
    return { local, beijing: bj + " (UTC+8)" };
  },
  escape(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); },
  /* 通知正文链接化（第七期）：先转义，再仅对站内 URL 生成锚点（限定 suveoo.com 域，不接受外链） */
  linkify(s) { return this.escape(s).replace(/(https:\/\/suveoo\.com\/[a-z0-9/-]+)/g, '<a href="$1" class="notif-link">$1</a>'); },
};
