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
  /** 站内跳转白名单（P3-15）：只接受以单个 / 开头的站内路径。
   *  拒绝 //host（协议相对）、/\\host、绝对 URL、javascript:/data: 与控制字符——登录页 next 参数此前未校验。 */
  safeNext(v, fallback = "/home") {
    const s = String(v ?? "");
    if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return fallback;
    if (/[\u0000-\u001f\u007f]/.test(s)) return fallback;
    return s;
  },
  /* 通知标题去 emoji（第五十八轮）：严谨银行风格——源头（后端 title/前端弹窗前缀）已清零，
   * 此处清洗历史存量通知（通知中心/铃铛下拉渲染层统一走这）。仅清彩色 emoji 与变体选择符，
   * 保留 ✓✗·→ 等纯文本记号 */
  stripEmoji(s) { return String(s ?? "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]+\s*/gu, ""); },
  /* 通知正文链接化（第七期）：先转义，再仅对站内 URL 生成锚点（限定 suveoo.com 域，不接受外链）。
   * 第一百二十二轮：①壳内（S.api.base 非空）剥 origin → 相对路径（App 内原生打开，Java 路由兜底）；
   * ②正则扩支持 query——旧类 [a-z0-9/-]+ 遇 ? 即断（带参 URL 在通知里被截成半截链接）；
   * 转义文本里 & 为 &amp;，故 query 字符类含 ; 。 */
  linkify(s) {
    const inShell = !!(S.api && S.api.base);
    return this.escape(s).replace(/(https:\/\/suveoo\.com\/[a-z0-9/_-]*(?:\?[a-zA-Z0-9=&.%_~:;-]*)?)/g, (m, url) => {
      const href = inShell ? url.slice("https://suveoo.com".length) : url;
      return `<a href="${href}" class="notif-link">${url}</a>`;
    });
  },
  /* 卡面解析（第四十四轮 / 第六十一轮去重修复）：按卡组织+槽位从 S.cardArts 清单选真图。
   *
   * 第六十一轮修复——同网络卡面重复 bug：
   *   原实现 pool[slot % pool.length] 只保证跨槽位稳定，不保证同网络多卡去重——
   *   两张银联卡 slot 0 和 3 均映射 unionpay[0]（3 张图 pool，0%3=0, 3%3=0）→ 重复卡面。
   *
   * 新算法：同网络内按"出现序"（而非槽位取模）分配不同图——
   *   同网络第 k 张卡 → pool[k % pool.length]（k 从 0 起，按卡的注册顺序）。
   *   用 (userId+network+slug) 的稳定 hash 决定 k 的起点，确保同用户多卡分配不同 k。
   *   组织目录空/图不够时回落 mastercard 同逻辑。清单未加载一律回落基座 art。
   *   存量用户部署后自动换新图（列表页能看到变化，不受缓存影响——图片 URL 变了）。 */
  cardFront(card, allCards) {
    const fallback = "/" + (card?.art ?? "");
    try {
      const table = card?.kind === "debit" ? S.cardArts?.debit : S.cardArts?.credit;
      if (!table || !card?.network || !card.art) return fallback;
      const last = String(card.art).split("/").pop();
      const parts = last.split("-");
      const slot = Number(parts[2]) - 1;
      if (!Number.isInteger(slot) || slot < 0) return fallback;
      const NET2DIR = { "万事达": "mastercard", "维萨": "visa", "Visa": "visa", "美国运通": "american-express", "运通": "american-express", "银联": "unionpay", "全付通": "unionpay" };
      const dir = NET2DIR[card.network] ?? "mastercard";
      const pool = (table[dir] ?? []).length ? table[dir] : table.mastercard ?? [];
      if (!pool.length) return fallback;

      /* 同目录去重（第六十一轮）：银联+全付通均映射 unionpay 目录——须按目录分组而非网络标签，
       * 否则一张银联+一张全付通仍可能撞同一张 unionpay 图。按 slug 排序取出现序 k。 */
      if (allCards && Array.isArray(allCards) && allCards.length > 1) {
        const siblings = allCards
          .filter((c) => {
            if (c.kind !== card.kind) return false;
            const cd = NET2DIR[c.network] ?? "mastercard";
            return cd === dir;
          })
          .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
        if (siblings.length > 1) {
          const k = siblings.findIndex((c) => c.slug === card.slug);
          if (k >= 0 && k < siblings.length) {
            return "/" + pool[k % pool.length];
          }
        }
      }

      /* 单卡或无列表上下文：退化为 slot 取模 */
      return "/" + pool[slot % pool.length];
    } catch { return fallback; }
  },

  /** 写操作失败响应 → 具体化文案（第一百轮·队长令：拒绝泛泛"转账失败/操作失败"）。
   * 优先级：err.<REASON> i18n 映射（可带 {0} 参数，金额/尾号等从响应细节提取）
   * → 服务端 error.message（多数 BIZ_REJECT 自带中文说明）
   * → fallbackKey 泛化文案（最后手段）。
   * 金额类细节：INVARIANT_BALANCE 从 stages.INVARIANTS.detail 提取可用余额；金额统一 moneyPlain。 */
  blockedMsg(r, fallbackKey = "common.opFailed") {
    const t = (k, fb) => { try { return S.t(k, fb); } catch { return fb; } };
    const d = r?.data ?? {};
    const reason = d.reason ?? d.error?.code ?? null;
    if (!reason) return t(fallbackKey, "操作失败");
    /* 细节提取：INVARIANTS 明细（余额/PR）与卡片尾号 */
    const invStage = (d.stages ?? []).find((x) => x && x.stage === "INVARIANTS" && Array.isArray(x.detail));
    const inv = invStage ? invStage.detail : [];
    const balTxt = String((inv.find((v) => v.code === "INVARIANT_BALANCE") ?? {}).detail ?? "");
    const balM = balTxt.match(/balance=(-?[\d.]+)/);
    const prTxt = String((inv.find((v) => v.code === "INVARIANT_PR_MISMATCH") ?? {}).detail ?? "");
    const prM = prTxt.match(/product R(\d) > user PR(\d)/);
    const last4 = d.error?.card_last4 ?? d.card_last4 ?? null;
    const k = "err." + reason;
    let txt = k;
    try { txt = S.t(k); } catch { /* 保持 = k 视为无映射 */ }
    if (txt === k) {
      /* 无专用映射：服务端 message 或泛化 */
      const svr = d.error?.message;
      return typeof svr === "string" && svr && svr !== reason ? svr : t(fallbackKey, "操作失败");
    }
    /* 参数注入（按需） */
    if ((reason === "INVARIANT_BALANCE" || reason === "INSUFFICIENT_BALANCE") && balM) return S.t(k, this.moneyPlain(balM[1]));
    if (reason === "INVARIANT_PR_MISMATCH" && prM) return S.t(k, prM[1], prM[2]);
    if (reason === "RECIPIENT_CARD_FROZEN" && last4) return S.t(k, String(last4));
    return txt;
  },
};
