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
  /* 卡面解析（第四十四轮）：按卡组织+槽位从 S.cardArts 清单（assets/data/card-arts.json，部署自动更新）
   * 选真图；组织目录空/图不够回落 mastercard；基座 art 尾号 N 即槽位（N 从 1 起）——存量卡面不变，
   * 队长补 visa/american-express/unionpay 图并部署后对应组织卡自动换真图且固定（槽位稳定）。
   * 任何异常/清单未加载一律回落基座 art 原样（零风险）。 */
  cardFront(card) {
    const fallback = "/" + (card?.art ?? "");
    try {
      const table = card?.kind === "debit" ? S.cardArts?.debit : S.cardArts?.credit;
      if (!table || !card?.network || !card.art) return fallback;
      const last = String(card.art).split("/").pop(); /* debit-card-8-front.webp（旧/新路径末段同名，含连字符的前缀段不影响） */
      const parts = last.split("-"); /* ["debit","card","8","front.webp"] */
      const slot = Number(parts[2]) - 1;
      if (!Number.isInteger(slot) || slot < 0) return fallback;
      const dir = { "万事达": "mastercard", "维萨": "visa", "Visa": "visa", "美国运通": "american-express", "运通": "american-express", "银联": "unionpay", "全付通": "unionpay" }[card.network] ?? "mastercard";
      const pool = (table[dir] ?? []).length ? table[dir] : table.mastercard ?? [];
      if (!pool.length) return fallback;
      return "/" + pool[slot % pool.length];
    } catch { return fallback; }
  },
};
