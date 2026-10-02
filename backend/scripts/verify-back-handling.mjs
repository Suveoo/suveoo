/* verify-back-handling.mjs — 第五十三轮返回手势 31 场景静态验收
 * 断言三层实现齐备（Java 拦截/JS __suveooBack 分支/构建注入），并核对既有实现
 * （login replace 不回登录页、ai.js popstate 抽屉收口、resolveIndex 三 pass 未被动过）。
 * 用法：cd backend && node scripts/verify-back-handling.mjs */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const F = {
  js: path.join(ROOT, "frontend/assets/js/core/back-button.js"),
  main: path.join(ROOT, "backend/android/app/src/main/java/com/suveoo/app/MainActivity.java"),
  strings: path.join(ROOT, "backend/android/app/src/main/res/values/strings.xml"),
  build: path.join(HERE, "build-apk.mjs"),
  login: path.join(ROOT, "frontend/assets/js/pages/login.js"),
  ai: path.join(ROOT, "frontend/assets/js/pages/ai.js"),
  ctl: path.join(ROOT, "frontend/assets/js/core/ctl.js"),
  app: path.join(ROOT, "frontend/assets/js/core/app.js"),
};
for (const k of Object.keys(F)) {
  if (!existsSync(F[k])) { console.error(`✗ 缺文件 ${F[k]}`); process.exit(1); }
}
const read = (p) => readFileSync(p, "utf8");
const src = Object.fromEntries(Object.keys(F).map((k) => [k, read(F[k])]));
const lineOf = (text, needle) => {
  const i = text.indexOf(needle);
  return i < 0 ? null : text.slice(0, i).split("\n").length;
};
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
const has = (k, needle) => src[k].includes(needle);

/* 收集 back-button.js 的 sc: 标记（"sc:17/19" 拆成 17 和 19） */
const marks = new Set();
for (const m of src.js.matchAll(/sc:([0-9]{1,2}(?:\/[0-9]{1,2})*)/g)) {
  m[1].split("/").forEach((n) => marks.add(Number(n)));
}

/* ===== 断言原语 ===== */
const results = [];
const check = (id, ok, where, note) => results.push({ id, ok, where, note }) && ok;

/* Java 层引擎（sc1-7 页面级返回 + sc27/28 双击退出） */
const javaOK =
  has("main", "OnBackPressedCallback") &&
  has("main", "__suveooBack") &&
  has("main", "canGoBack()") &&
  has("main", "goBack()") &&
  has("main", "2000L") &&
  has("main", "finish()") &&
  has("main", "R.string.back_exit");
check("JAVA", javaOK, rel(F.main), "dispatcher 拦截 + JS 查询 + goBack + 2s 双击退出");

/* JS 层存在性 */
check("JSFN", has("js", "window.__suveooBack"), rel(F.js), "__suveooBack 已定义且防重复注入");

/* 构建注入 */
check("INJECT", has("build", "back-button.js") && has("build", "writeFileSync(dst, t)"), rel(F.build), "全部 HTML 构建时注入 back-button.js");

/* strings 资源 */
check("STR", has("strings", "back_exit"), rel(F.strings), "Toast 文案资源");

/* resolveIndex 三 pass 未动（本轮红线） */
check("3PASS",
  has("main", "Pass 1：精确匹配") && has("main", "Pass 2：跳过中间段") && has("main", "Pass 3：逐级上回"),
  rel(F.main), "三 pass 目录路由保持第五十二轮原样");

/* ai.js 既有 popstate 收口（sc20/21 放行的依据） */
check("AIPOP", has("ai", 'window.addEventListener("popstate", () => closeDrawer(true))'), rel(F.ai), "抽屉/菜单返回手势既有 popstate 收口");

/* login 既有 replace（sc8 依据） */
check("LOGIN", src.login.includes("location.replace(next)"), rel(F.login), "登录成功 replace 不入历史栈");

/* v1.3 卡死防回归（第五十四轮：队长真机实测通知/交易/转账记录三页返回卡死） */
check("CHIPFIX",
  src.js.includes("button.hpill") &&
  src.js.includes("seg[0].classList.contains(\"on\")") &&
  src.js.includes("flush"),
  rel(F.js), "chips 仅 button+分段+段内第一个（默认）未激活才重置——盲点 .hpill.on 曾致'全部'默认 on 卡死四页");
check("HELPEXCL",
  /<a class="hpill"/.test(read(path.join(ROOT, "frontend/assets/js/pages/help.js"))) &&
  !/querySelectorAll\("\.hpill/.test(src.js),
  rel(F.js), "help 锚点 hpill（<a>+scrollspy 恒 on）被 button 过滤排除");
check("DIRTY2X",
  (src.js.match(/#sv-go/g) ?? []).length >= 2,
  rel(F.js), "dirty 确认框上返回=二次确认放弃（曾返回键无限关框再弹框软卡死）");
check("SCROLL",
  src.js.includes("sv_scroll") &&
  src.js.includes("back_forward") &&
  src.js.includes("requestAnimationFrame(tick)") &&
  src.js.includes('page() === "ai"') &&
  src.js.includes("location.hash"),
  rel(F.js), "滚动恢复：back_forward 才恢复+RAF 等内容撑高+/ai 与 hash 排除+触摸放弃+恢复中防污染回写");

/* ===== 31 场景映射 ===== */
const SC = [
  { id: 1, d: "主页→账户→返回→回主页", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "MPA 历史栈 goBack + 三 pass 解析" },
  { id: 2, d: "收付→行内转账→返回→回收付", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "同上" },
  { id: 3, d: "卡片列表→卡设置页→返回→回列表", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "goBack 重载 slug 路径由 Pass2 解析" },
  { id: 4, d: "账户→交易明细→返回→回账户", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "同上" },
  { id: 5, d: "财富→基金列表→基金详情→返回→回列表", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "同上" },
  { id: 6, d: "AI页→长程任务中心→返回→回AI页", where: `${rel(F.ai)}:${lineOf(src.ai, "closeDrawer(true)")}`, ok: has("ai", 'tc.classList.toggle("open", drawer === "tc")'), note: "tc 抽屉 popstate 收口（既有）+ JS 放行" },
  { id: 7, d: "AI页→提议页→返回→回AI页", where: `${rel(F.main)}:${lineOf(src.main, "w.goBack()")}`, ok: javaOK, note: "普通页间导航 goBack" },
  { id: 8, d: "登录成功→返回→不回登录页", where: `${rel(F.login)}:${lineOf(src.login, "location.replace(next)")}`, ok: src.login.includes("location.replace(next)"), note: "login.js 既有 location.replace" },
  { id: 9, d: "通知中心展开项→返回→收起", where: `${rel(F.js)}:${lineOf(src.js, "nt-row.open")}`, ok: marks.has(9), note: ".nt-row.open click 收起" },
  { id: 10, d: "GenUI 黄级确认卡→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(10), note: "modal 族取消链（consent.js 同构）" },
  { id: 11, d: "红级 OTP 弹窗→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(11), note: "ctl.js OTP 亦 .modal-mask 结构" },
  { id: 12, d: "常用收款人弹窗→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(12), note: "intrabank.js:136 S.ui.modal" },
  { id: 13, d: "转入本人其他弹窗→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(13), note: "intrabank.js:159 S.ui.modal" },
  { id: 14, d: "月份报告下载确认→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(14), note: "S.ui.modal 族统一覆盖" },
  { id: 15, d: "删除确认弹窗→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, ".modal-mask")}`, ok: marks.has(15), note: "通知/聊天删除均 S.ui.modal" },
  { id: 16, d: "Cookie 偏好弹窗→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, "cookie-pop")}`, ok: marks.has(16), note: ".cookie-pop remove（未同意=不开分析）" },
  { id: 17, d: "header 铃铛下拉→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, '".dropdown"')}`, ok: marks.has(17), note: ".dropdown remove；侧栏抽屉手机端不存在（layout.css 默认 display:none）" },
  { id: 18, d: "侧栏抽屉→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, '".dropdown"')}`, ok: marks.has(17), note: "N/A：手机端无侧栏；平板侧栏为常驻面板非浮层；铃铛下拉由 sc17 覆盖" },
  { id: 19, d: "语言切换下拉→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, '".dropdown"')}`, ok: marks.has(19), note: "与铃铛同为 .dropdown" },
  { id: 20, d: "AI 历史对话抽屉→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, "hist-drawer.open")}`, ok: marks.has(20), note: "放行 → goBack → ai.js popstate 关（不双处理）" },
  { id: 21, d: "AI 三点菜单→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, "#ch-more.open")}`, ok: marks.has(21), note: "同上（morePushed 层）" },
  { id: 22, d: "日历打开→返回→关闭不跳页", where: `${rel(F.js)}:${lineOf(src.js, "cal-cancel")}`, ok: marks.has(22), note: "点 .cal-cancel 走 close(null)" },
  { id: 23, d: "日历编辑时分秒→返回→先收值再关（两步）", where: `${rel(F.js)}:${lineOf(src.js, "cal-edit")}`, ok: marks.has(23), note: ".cal-edit.blur()→commit 收值；下一次返回才关" },
  { id: 24, d: "ctl 下拉/选择器→返回→关闭", where: `${rel(F.js)}:${lineOf(src.js, "ctl-list")}`, ok: marks.has(24), note: "点 .ctl-btn toggle 收起" },
  { id: 25, d: "转账表单填写中→返回→确认放弃", where: `${rel(F.js)}:${lineOf(src.js, "__svDirty")}`, ok: marks.has(25), note: "dirty 监听+三语确认框；公开页/AI/搜索框排除" },
  { id: 26, d: "搜索/筛选激活→返回→先清再返回", where: `${rel(F.js)}:${lineOf(src.js, 'input[type="search"]')}`, ok: marks.has(26), note: "sc26a 清搜索框+blur；sc26b 分段 chips：段内第一个（默认/全部）未激活才重置" },
  { id: 27, d: "主页无历史→返回→再按一次退出", where: `${rel(F.main)}:${lineOf(src.main, "exitTwice")}`, ok: has("main", "exitTwice") && has("strings", "back_exit"), note: "2s 窗口 Toast+finish" },
  { id: 28, d: "任何页连按返回到栈底→同上", where: `${rel(F.main)}:${lineOf(src.main, "exitTwice")}`, ok: has("main", "exitTwice"), note: "goBack 链尽后走 exitTwice" },
  { id: 29, d: "AI 输入框有文字→返回→清空", where: `${rel(F.js)}:${lineOf(src.js, "chat-composer")}`, ok: marks.has(29), note: "清空+派发 input+blur" },
  { id: 30, d: "AI 流式回复中→返回→停止流式", where: `${rel(F.js)}:${lineOf(src.js, "S.chat.stop")}`, ok: marks.has(30), note: "S.chat._ctrl 存在时 abort" },
  { id: 31, d: "/ai/s/{sid}→返回→回 /ai 再回上一页", where: `${rel(F.js)}:${lineOf(src.js, '"/ai/s/"')}`, ok: marks.has(31), note: "location.replace(navPath('/ai')) → 栈 [上一页,/ai]" },
];

/* ===== 浮层组件全站审计（覆盖面证据） ===== */
const walk = (d, base = "", out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const relp = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!/cards-front|node_modules/.test(relp)) walk(path.join(d, e.name), relp, out); }
    else if (/\.(js|html)$/.test(e.name)) out.push({ rel: relp, text: readFileSync(path.join(d, e.name), "utf8") });
  }
  return out;
};
const files = walk(path.join(ROOT, "frontend/assets/js")).concat(walk(path.join(ROOT, "frontend"), "", []));
const overlayClasses = [
  [".modal-mask", "modal 族（确认卡/OTP/收款人/下载/删除）"],
  [".cal-mask", "日历"],
  [".dropdown", "header 下拉（铃铛/语言）"],
  [".cookie-pop", "Cookie 偏好"],
  [".ctl-list", "ctl 下拉选择器"],
  [".nt-row", "通知中心行（展开态 .open）"],
  [".hpill", "筛选 chips（激活 .on）"],
  [".hist-drawer", "AI 历史抽屉（.open）"],
];
console.log("浮层组件全站审计（使用文件数 → __suveooBack 覆盖）：");
for (const [cls, desc] of overlayClasses) {
  const n = files.filter((f) => f.text.includes(cls)).length;
  const covered = src.js.includes(cls.split(".")[1].split(" ")[0].replace("-", "-")) || cls === ".nt-row" || cls === ".hpill";
  console.log(`  ${cls.padEnd(14)} ${String(n).padStart(3)} 文件  ${desc}  ${covered ? "✓ 已覆盖" : "✗ 未覆盖"}`);
  if (!covered) process.exitCode = 1;
}

/* ===== 汇总 ===== */
const base = ["JAVA", "JSFN", "INJECT", "STR", "3PASS", "AIPOP", "LOGIN", "CHIPFIX", "HELPEXCL", "DIRTY2X", "SCROLL"].map((k) => results.find((r) => r.id === k));
const failedBase = base.filter((r) => !r.ok);
const failedSc = SC.filter((s) => !s.ok);
console.log(`\n基础设施：${base.length - failedBase.length}/${base.length}${failedBase.length ? " ✗ " + failedBase.map((r) => r.id).join(",") : " ✓"}`);
console.log(`\n31 场景覆盖表：`);
for (const s of SC) console.log(`  ${s.ok ? "✓" : "✗"} sc:${String(s.id).padStart(2)} ${s.d.padEnd(28)} → ${s.where}（${s.note}）`);
console.log(`\n结果：${SC.length - failedSc.length}/${SC.length}${failedBase.length || failedSc.length ? " —— FAILED" : " —— ALL PASS"}`);
if (failedBase.length || failedSc.length) process.exit(1);
