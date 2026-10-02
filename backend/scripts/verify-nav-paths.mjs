/* verify-nav-paths.mjs — 第五十一轮 v1.1 静态验收
 * 模拟 MpaWebViewClient.resolveIndex 算法，把前端所有导航目标
 * （HTML href/src 字面量 + JS 跳转字面量）在 assets/public 上跑一遍，
 * 任何解析不到实体文件的路径都会暴露（v2 失败类：链接没覆盖到）。
 * 用法：cd backend && node scripts/verify-nav-paths.mjs */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "../../frontend"); // 与 assets/public 同源（构建前校验）

/* ===== resolveIndex 的 Node 复刻（与 MainActivity.java 逐行对应） ===== */
const assetExists = (p) => existsSync(path.join(PUBLIC, p));
function resolveIndex(p) {
  for (;;) {
    const cand = p.endsWith("/") ? p : p + "/";
    if (assetExists(cand + "index.html")) return cand + "index.html";
    const cut = p.lastIndexOf("/");
    if (cut <= 0) return assetExists("index.html") ? "index.html" : null;
    p = p.slice(0, cut);
  }
}
/* 完整响应解析：精确文件 → 目录补全 → 逐级回退（对应 shouldInterceptRequest 全链路） */
function resolveAny(rawPath) {
  if (assetExists(rawPath) && statSync(path.join(PUBLIC, rawPath)).isFile()) return { kind: "exact", file: rawPath };
  if (rawPath.startsWith("/api/")) return { kind: "api-delegated" };
  const idx = resolveIndex(rawPath);
  if (idx) return { kind: "dir-index", file: idx };
  return null;
}

/* ===== 收集全部导航/资源目标 ===== */
const files = [];
const walk = (d, base = "") => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full, rel);
    else if (/\.(html|js)$/.test(e.name) && !/cards-front/.test(rel)) files.push({ rel, full });
  }
};
walk(PUBLIC);

const targets = new Map(); // path -> [来源]
const add = (p, src) => {
  if (!targets.has(p)) targets.set(p, []);
  targets.get(p).push(src);
};

const SKIP_EXT = /\.(png|webp|jpg|jpeg|gif|ico|svg|woff2?|ttf|otf|mp3|mp4|webm|wasm|pdf|txt|css|json|map)$/i;
for (const { rel, full } of files) {
  const text = readFileSync(full, "utf8");
  /* HTML: href="/x" src="/x" + refresh url=/x */
  for (const m of text.matchAll(/(?:href|src)\s*=\s*"\/([^"#?]+)/g)) add("/" + m[1], `${rel}`);
  for (const m of text.matchAll(/http-equiv="refresh"\s+content="0;url=\/([^"?#]+)/g)) add("/" + m[1], `${rel}(refresh)`);
  /* JS 跳转字面量：location.replace('/x') location.href='/x' go('/x') navPath(`/x`) href:"/x" */
  for (const m of text.matchAll(/location\.(?:replace|href|assign)\(\s*["'`]\/([^"'?#]+)/g)) add("/" + m[1], `${rel}(js-nav)`);
  for (const m of text.matchAll(/(?:go|navPath|S\.router\.go|S\.router\.navPath)\(\s*["'`]\/?([^"'?#`]+)/g)) add("/" + m[1].replace(/^\//, "/"), `${rel}(router)`);
  for (const m of text.matchAll(/fetch\(\s*["'`]\/([^"'?#]+)/g)) add("/" + m[1], `${rel}(fetch)`);
  /* fetch("/assets/...") 相对资源 */
}

/* 动态页路由（无法静态收集的运行时模式）单独登记 */
for (const dyn of ["/ai/s/abc123", "/ai/s/sid789/"]) add(dyn, "dynamic(ai-session)");
for (const dyn of ["/account/login?next=%2Faccount", "/ai?q=hi", "/home?from=app"]) add(dyn.split("?")[0], "dynamic(query)");

/* ===== 逐个验证 ===== */
const bad = [];
for (const [p, srcs] of [...targets].sort()) {
  const clean = p.split("?")[0].split("#")[0];
  if (SKIP_EXT.test(clean)) continue; /* 静态资源由 Capacitor 精确文件分支处理 */
  const r = resolveAny(clean);
  if (!r) bad.push({ path: clean, from: srcs.slice(0, 3) });
  else if (r.kind === "api-delegated") { /* API 在壳内是绝对地址，这里出现说明是 web 相对调用（正常） */ }
}
console.log(`共 ${targets.size} 个唯一路径目标，其中需目录路由/文件校验 ${[...targets].filter(([p]) => !SKIP_EXT.test(p.split("?")[0])).length} 个`);
if (bad.length) {
  console.log("✗ 以下路径无法解析到实体文件：");
  for (const b of bad) console.log(`  ${b.path}  ← ${b.from.join(", ")}`);
  process.exit(1);
}
console.log("✓ 全部导航/资源路径均能解析（精确文件或目录 index.html 回退）");

/* 关键页面抽查：打印目录路由映射 */
const keyPages = ["/home", "/", "/account", "/account/login", "/pay", "/ai", "/wealth", "/transfer/history", "/notifications", "/ai/s/xyz789"];
console.log("\n关键页面目录路由映射：");
for (const k of keyPages) {
  const exact = assetExists(k) ? "精确文件" : "";
  const r = exact || resolveIndex(k);
  console.log(`  ${k.padEnd(22)} → ${exact || r || "✗ 无"}`);
}
