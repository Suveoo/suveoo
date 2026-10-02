/* notify.js — 系统级消息通知服务（第四十六轮 / 第五十六轮全面修复+增强）
 * 双端适配：
 *   Web（suveoo.com）：Notification API + Service Worker registration.showNotification
 *   Android 壳（Capacitor）：@capacitor/local-notifications（系统通知栏 + Notification Channels）
 *
 * 第五十六轮根因修复：模块级 permission 变量初始恒 "default" 且从不恢复真实权限——
 * 页面刷新后（sessionStorage 已记 asked）不再调 requestPermission → poll() 首行恒短路
 * → 系统通知永不弹出。现启动即恢复：Web 同步读 Notification.permission，壳异步
 * checkPermissions()。
 *
 * 增强：① 通知类别（Web tag=suveoo-{type} 同类替换不堆叠；Android 5 Channels 按紧急度
 * 配 importance，用户可在系统设置分级控制）② 点击精确跳转（按类别 target，data.url 透传
 * SW notificationclick / 壳 actionPerformed）③ 通知偏好（GET/POST /api/notifications/prefs
 * 跨设备同步；关闭的类别不弹系统通知，通知中心不受影响）④ 偏好设置弹窗 openPrefs()
 * （账户页入口：权限未开先索取权、被拒引导系统设置）。 */
S.notify = (() => {
  /* 已读基准跨标签共享（第六十三轮）：localStorage 而非模块内存——同账号多标签只有先见者弹，
   * 杜绝节流标签迟醒后重复弹同一批；登出/过期即清除（换账号重新对齐，绝不回放上一账号积压）。 */
  const SEEN_KEY = "suveoo_notif_seen", SHOWN_KEY = "suveoo_notif_shown";
  let lastSeenId = null;
  let timer = null;
  let permission = "default";
  let prefs = null; /* null=未设置（全开）；{TYPE:false} 关闭该类系统弹窗 */
  const isCapacitor = typeof window.Capacitor !== "undefined";

  /* Android：清除本应用已发到通知栏的通知（登出/会话过期后的隐私——通知含金额收款方，
   * 不应留在无主设备的通知栏）。id 来自 show() 的记录（上限 10 条，cancel 不存在的 id 为无害空操作）。
   * 挂在模块初始化（任意页面加载且无 token 即触发）：手动登出（replace /home）与 401 过期
   * （redirect 登录页）都必然经过"登录态外的一次页面加载"，一处收口覆盖两条路径。 */
  const clearShownTray = async () => {
    if (!isCapacitor) return;
    try {
      const ids = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "[]");
      if (ids.length) {
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      localStorage.removeItem(SHOWN_KEY);
    } catch { /* 插件不可用时静默 */ }
  };
  if (isCapacitor && !localStorage.getItem("suveoo_token")) clearShownTray();

  /* 类别统一出处：channel（Android channelId）/ importance（1-5）/ target（点击跳转）/ tag
   * icon/cls 与通知中心（notifications.js）同款——五类五色，弹窗/中心视觉一致 */
  const META = {
    TRANSFER: { channel: "transfers", importance: 4, target: "/account/transactions", icon: "send", cls: "t-transfer" },
    SECURITY: { channel: "security", importance: 5, target: "/account/security", icon: "shield", cls: "t-security" },
    WEALTH: { channel: "wealth", importance: 4, target: "/wealth", icon: "wealth", cls: "t-wealth" },
    TASK: { channel: "tasks", importance: 3, target: "/ai/tasks", icon: "clock", cls: "t-task" },
    SYSTEM: { channel: "general", importance: 3, target: "/notifications", icon: "bell", cls: "t-system" },
  };
  const TYPES = Object.keys(META);
  const catKey = (t) => `notif.cat.${t === "TRANSFER" ? "transfer" : t === "SYSTEM" ? "system" : t.toLowerCase()}`;

  /* 权限恢复（根因修复）：不请求、只查询——Web 同步可得，壳走插件。
   * 第六十二轮补修：Android 13+ 插件 checkPermissions 走 Capacitor 权限系统，返回三态
   * granted/denied/**prompt**（PermissionState.PROMPT，永无 "default" 字面量）——此前原样透传
   * "prompt"，而开机询问门控判 p !== "default" → 恒早退不询问（队长实测 v2.1 复现）。
   * 与 requestPermission 同口径归一化：非 granted/denied 一律折算 "default"（未决态）。 */
  async function checkPermission() {
    try {
      if (isCapacitor) {
        const res = await window.Capacitor.Plugins.LocalNotifications.checkPermissions();
        permission = res?.display === "granted" ? "granted" : res?.display === "denied" ? "denied" : "default";
      } else if ("Notification" in window) {
        permission = Notification.permission;
      }
    } catch { /* 保持现值 */ }
    return permission;
  }

  async function requestPermission() {
    try {
      if (isCapacitor) {
        const res = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
        /* display 三态：granted/denied/prompt——prompt（弹窗被划掉未选择）保持 "default"，
         * 下次启动可再问（第六十二轮：此前一律折算 denied，划掉一次=永不再问的怪象） */
        permission = res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
      } else if ("Notification" in window) {
        permission = await Notification.requestPermission();
      }
    } catch { permission = permission === "granted" ? "granted" : "denied"; }
    return permission;
  }

  /* 通道名跟随系统语言（第六十二轮）：App Info → Notification Categories 是系统面，应按手机
   * 语言显示（队长实测英文机显示中文）。与 i18n 的 notif.cat.* 同源值内嵌三语（系统语言
   * ≠应用内语言，不能走 S.t）；zh-HK/MO/繁体归 zh-TW，其余非 zh 归 en-US。
   * 通道名更新：对既有 id 重复 createChannel = 原位改名（importance 锁定不变，用户级设置保留），
   * 故每次启动按当前系统语言重建即自动纠正。 */
  const CH_NAMES = {
    "zh-CN": { transfers: "转账", security: "安全", wealth: "理财", tasks: "任务", general: "系统" },
    "zh-TW": { transfers: "轉帳", security: "安全", wealth: "理財", tasks: "任務", general: "系統" },
    "en-US": { transfers: "Transfers", security: "Security", wealth: "Wealth", tasks: "Tasks", general: "System" },
  };
  const CH_LOCALE = () => {
    const l = ((navigator.languages && navigator.languages[0]) || navigator.language || "zh-CN").toLowerCase();
    if (l.startsWith("zh")) return /tw|hk|mo|hant/.test(l) ? "zh-TW" : "zh-CN";
    return "en-US";
  };

  /* Android 8+ Notification Channels（用户可在系统设置分级开关；importance 与紧急度匹配）。
   * 第五十八轮根因修复：插件 API 是 createChannel（单数，逐个创建）——此前误调不存在的
   * createChannels 复数方法 → 异常被吞 → 通道从未创建 → schedule 引用无效 channelId 被
   * Android 静默丢弃（App 收不到系统通知的根因）。 */
  async function ensureChannels() {
    if (!isCapacitor) return;
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      const names = CH_NAMES[CH_LOCALE()] ?? CH_NAMES["en-US"];
      for (const t of TYPES) {
        await LocalNotifications.createChannel({
          id: META[t].channel,
          name: names[META[t].channel],
          importance: META[t].importance,
          visibility: 1, /* public：锁屏可见 */
        });
      }
    } catch { /* 旧插件/平台不支持时静默（通知仍走默认通道） */ }
  }

  /* 偏好拉取（null=未设置=全开） */
  async function loadPrefs() {
    try {
      const r = await S.api.get("/api/notifications/prefs");
      prefs = r?.ok ? (r.data?.prefs ?? null) : null;
    } catch { prefs = null; }
    return prefs;
  }

  /* 弹系统通知（n={id,type,title,body}）。偏好关闭的类别不弹（通知中心仍显示）。
   * tag=suveoo-{type}：同类多条替换不堆叠（Web）；壳按 channelId 分组+分级（white-S smallIcon）。 */
  async function show(n) {
    if (permission !== "granted") return false;
    const meta = META[n.type] ?? META.SYSTEM;
    if (prefs && prefs[n.type] === false) return false;
    const url = S.router?.navPath?.(meta.target) ?? meta.target;
    try {
      if (isCapacitor) {
        /* isExactNotification:false（第六十二轮根因修复）：插件该字段默认 true——任何 schedule
         * 调用（哪怕无 schedule.at 的即时通知）在 Android 12+ 都会因缺 exact-alarm 权限跳转
         * "Alarms & reminders" 设置页并【丢弃本条通知】（队长实测：允许 Notifications 仍收不到、
         * 弹窗时机随机=第一条新通知到达时）。我们全部是轮询触发的即时通知，零 exact-alarm 需求；
         * 置 false 后走纯 NotificationManager 即时投递，仅需 POST_NOTIFICATIONS 一项权限。 */
        const notifId = (n.id ?? Date.now()) % 2147483647;
        await window.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [{ id: notifId, title: n.title, body: n.body ?? "", channelId: meta.channel, smallIcon: "ic_stat_suveoo", iconColor: "#1E2A78", isExactNotification: false, extra: { url } }],
        });
        /* 记录已发 id（登出时清通知栏用；上限 10 条滚动） */
        try {
          const ids = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "[]");
          ids.push(notifId);
          localStorage.setItem(SHOWN_KEY, JSON.stringify(ids.slice(-10)));
        } catch { /* ignore */ }
        return true;
      }
      /* Web：优先 SW（可从后台标签触发 + data.url 点击跳转），降级 Notification API。
       * icon 第五十八轮换品牌图（favicon.svg 渲染的白 S navy 方块；旧 favicon-192 是星形旧版） */
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(n.title, {
          body: n.body ?? "", tag: `suveoo-${n.type}`, icon: "/favicon/notif-icon-192.png", badge: "/favicon/notif-icon-96.png",
          data: { url },
        });
        return true;
      }
      if ("Notification" in window) { new Notification(n.title, { body: n.body ?? "", tag: `suveoo-${n.type}`, icon: "/favicon/notif-icon-192.png" }); return true; }
    } catch { /* 静默 */ }
    return false;
  }

  /* 轮询新通知：比对 id（通知 id DESC——首条比上次大即有新）。
   * body 直传纯文本（系统通知不解析 HTML，此前 escape 会把 & 显示成 &amp;——显示 bug 已修）
   * 第六十三轮登录态语义：①无 token（登出/1h 过期）= 立即清基准并退出——通知含金额收款方，
   *   未登录不弹是隐私设计，且换账号登录后从新基准对齐、绝不回放上一账号积压；
   * ②Web 会话中途权限被浏览器设置吊销 → 每轮同步真实权限并停弹（此前只在启动时查一次）。 */
  async function poll() {
    if (!S.api.token) {
      lastSeenId = null;
      try { localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
      return;
    }
    if (!isCapacitor && "Notification" in window && Notification.permission !== permission) permission = Notification.permission;
    if (permission !== "granted") return;
    try {
      const r = await S.api.get("/api/notifications?cursor=0");
      if (!r.ok || !r.data?.notifications?.length) return;
      const latest = r.data.notifications[0];
      if (lastSeenId == null) { lastSeenId = latest.id; localStorage.setItem(SEEN_KEY, String(latest.id)); return; } /* 首轮只记住基准 */
      if (latest.id > lastSeenId) {
        const newOnes = r.data.notifications.filter((n) => n.id > lastSeenId && !n.read);
        lastSeenId = latest.id;
        localStorage.setItem(SEEN_KEY, String(lastSeenId));
        for (const n of newOnes.slice(0, 3)) await show(n); /* 同批最多 3 条防轰炸 */
      }
    } catch { /* 网络/登录态异常静默 */ }
  }

  function start() {
    if (timer) clearInterval(timer);
    if (!S.api.token) return;
    /* 恢复跨标签共享的已读基准（同账号多标签去重；换账号/过期已被 poll 清除） */
    const seen = Number(localStorage.getItem(SEEN_KEY));
    lastSeenId = Number.isFinite(seen) && seen > 0 ? seen : null;
    /* 启动三件：恢复真实权限（根因修复）→ 建 Android 通道 → 拉偏好；随后首轮基准 + 30s 轮询 */
    checkPermission().then(() => { ensureChannels(); loadPrefs(); });
    poll();
    timer = setInterval(poll, 30000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    lastSeenId = null;
    try { localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
  }

  /* 通知点击精确跳转：壳端（Web SW 点击在 service-worker.js，用 data.url） */
  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      LocalNotifications.addListener("localNotificationReceived", () => {});
      LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
        const url = e?.notification?.extra?.url ?? e?.notification?.data?.url;
        if (url) location.href = url; /* 相对路径，壳内由三 pass 目录路由解析 */
      });
    } catch { /* ignore */ }
  }

  /* 通知偏好设置弹窗（账户页入口调用）：
   * 权限未开启先索取权（被拒→引导系统设置不弹窗）；granted 后展示类别开关。
   * 第五十九轮精修：整行 label 可点（移动端友好）；五类五色图标与通知中心同款；
   * hairline 通栏分隔；右上 × 关闭；说明短句防孤字。原实现裸用 ck-row——其 flex 样式
   * 只在 .cookie-pop 作用域，modal 内无布局导致开关换行"消失"。 */
  async function openPrefs() {
    await checkPermission();
    if (permission !== "granted") {
      const p = await requestPermission();
      if (p !== "granted") { S.ui.toast(S.t("notif.deniedHint"), true); return; }
    }
    await loadPrefs();
    const cur = {}; for (const t of TYPES) cur[t] = prefs?.[t] === false ? false : true;
    const m = S.ui.modal(`<div class="np-head"><h2>${S.fmt.escape(S.t("notif.prefsTitle"))}</h2>
        <button class="np-x" id="np-x" aria-label="${S.fmt.escape(S.t("common.close"))}">${S.ui.icon("x", 15)}</button></div>
      <p class="muted small np-hint">${S.fmt.escape(S.t(isCapacitor ? "notif.prefsHintApp" : "notif.prefsHint"))}</p>
      <div class="np-list">
        ${TYPES.map((t) => `<label class="np-row">
          <span class="nt-ico ${META[t].cls}">${S.ui.icon(META[t].icon, 15)}</span>
          <span class="np-name">${S.fmt.escape(S.t(catKey(t)))}</span>
          <span class="switch"><input type="checkbox" data-t="${t}" ${cur[t] ? "checked" : ""} aria-label="${S.fmt.escape(S.t(catKey(t)))}"><span class="tk"></span></span>
        </label>`).join("")}
      </div>
      <div class="modal-actions"><button class="btn btn-primary" id="np-save">${S.fmt.escape(S.t("notif.prefsSave"))}</button></div>`);
    m.el.querySelector("#np-x").onclick = () => m.close();
    m.el.querySelector("#np-save").onclick = async () => {
      const next = {}; for (const t of TYPES) next[t] = m.el.querySelector(`input[data-t="${t}"]`).checked;
      const r = await S.api.post("/api/notifications/prefs", next);
      if (r.ok) { prefs = next; m.close(); S.ui.toast(S.t("notif.prefsSaved")); }
      else S.ui.toast(S.t("common.loadFailed"), true);
    };
  }

  return {
    requestPermission, checkPermission, show, start, stop, openPrefs,
    get permission() { return permission; },
  };
})();
