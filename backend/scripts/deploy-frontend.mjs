#!/usr/bin/env node
/**
 * deploy-frontend.mjs — 把 frontend/ 全量上传至 R2 桶 suveoo-bank-r2 根。
 * 路径一一对应：frontend/home/index.html → suveoo-bank-r2/home/index.html
 *
 * 用法：
 *   node scripts/deploy-frontend.mjs                # 增量（默认：仅上传源文件变更过的对象，state=.deploy-state.json）
 *   node scripts/deploy-frontend.mjs --force        # 全量（远端被清空/不确定时用）
 *   node scripts/deploy-frontend.mjs --filter i18n  # 仅上传路径含 "i18n" 的文件（不落 state）
 *   node scripts/deploy-frontend.mjs --concurrency 8
 * 依赖：backend 下已 npm install（wrangler），并已 wrangler login。
 */
import { execFile } from "node:child_process";
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "../../frontend");
const BUCKET = "suveoo-bank-r2";
// 直接用当前 Node 执行本地 wrangler bin（Windows 下 execFile 解析不了 npx.cmd 垫片）
const WRANGLER_BIN = path.resolve(HERE, "../node_modules/wrangler/bin/wrangler.js");
/* 2026-10-02：execFile 必须带 timeout——无超时下卡住的 wrangler 子进程会让 uploadOne 的 Promise 永挂（本轮实测 34 分钟） */
const runWrangler = (args, opts) => exec(process.execPath, [WRANGLER_BIN, ...args], { timeout: 180_000, killSignal: "SIGKILL", ...opts });

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const FILTER = flag("filter", null);
const CONCURRENCY = Number(flag("concurrency", "25"));
const NO_MINIFY = args.includes("--no-minify"); // 调试逃生口

/* ===== 上传前压缩（第四十五轮队长令）：仅作用于上传副本（临时文件），本地文件原样不动 =====
 * JS/MJS → esbuild minify（语义安全）；CSS → 去 /* *​/ 注释；HTML → 去 <!-- --> 注释；
 * JSON/图片/字体等二进制与数据不动。产物写 backend/.deploy-tmp/（上传完即删）。 */
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
let TMP_DIR = null;
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
async function minifiedCopy({ rel, full }, esbuild) {
  const ext = path.extname(full).toLowerCase();
  /* src=源文件（state 指纹用——tmp 副本 mtime 恒新会让增量失效）；full=实际上传路径 */
  if (NO_MINIFY || (ext !== ".js" && ext !== ".mjs" && ext !== ".css" && ext !== ".html")) return { rel, full, src: full };
  let out;
  if (ext === ".js" || ext === ".mjs") {
    out = (await esbuild.transform(await readFile(full, "utf8"), { minify: true, target: "es2020", legalComments: "none" })).code;
  } else if (ext === ".css") {
    out = stripCssComments(await readFile(full, "utf8"));
  } else {
    out = stripHtmlComments(await readFile(full, "utf8"));
  }
  TMP_DIR ??= await mkdtemp(path.join(tmpdir(), "suveoo-deploy-"));
  const tmp = path.join(TMP_DIR, rel.replace(/\//g, "_"));
  await writeFile(tmp, out, "utf8");
  return { rel, full: tmp, src: full };
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};

/* 2026-10-02 第六十九轮教训：walk 必须跳过点开头目录——.mimosa 工具缓存曾被当资产上传
 * （超长 key 的 put 在 GFW 网络下无限重试挂死 34 分钟，且会话内部状态泄漏到公开桶）
 * 2026-10-03 第七十轮：cards-front 的 .jpg/.svg 是队长放图的源文件，Web 只用 .webp 版
 * （card-arts.json 全部引用 .webp，全站零引用 jpg/svg）——200MB 死重不再入桶，与 build-apk.mjs 的
 * shouldSkip 同款规则。"卡 325/336"的卡点段正是这批 25MB 级源图。 */
const SKIP_RE = /cards-front\/.*\.(jpg|svg)$/i;
async function walk(dir, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, rel));
    else if (entry.isFile() && !SKIP_RE.test(rel)) out.push({ rel, full });
  }
  return out;
}

async function uploadOne(f, attempt = 0) {
  const type = CONTENT_TYPES[path.extname(f.full).toLowerCase()] ?? "application/octet-stream";
  const size = f._size ?? (await stat(f.src)).size;
  /* 分级超时（第七十轮）：大文件（>1MB 卡面图）给足上传时间；回验 get 45s 封顶——
     回验失败只触发退避重传，不应拖长整体等待（上一版统一 180s 卡观感就是"卡死"） */
  const putMs = size > 1024 * 1024 ? 240_000 : 90_000;
  await runWrangler(["r2", "object", "put", `${BUCKET}/${f.rel}`, "--file", f.full, "--content-type", type, "--remote"], {
    cwd: HERE,
    maxBuffer: 64 * 1024 * 1024,
    timeout: putMs,
  });
  /* 回验（第八十九轮升级为内容级）：wrangler put 间歇性"假成功"两种形态——①对象未落桶（get 失败）
   * ②对象落桶但为旧内容（第八十八轮 docs×8 与本轮 phone.js 实证：get 成功而内容仍旧）。
   * 现比较上传体与远端体的字节长度（压缩副本 vs 远端）：不等即视为失败进退避重传。 */
  /* 回验（第八十九轮：内容指纹级）——wrangler put 假成功两形态：①未落桶（get 失败）②落桶但旧内容
   * （第八十八轮 docs×8/本轮 phone.js 实证）。文本类比对源文件首尾各 200 字节指纹，不等即重传。 */
  const isTexty = /\.(html|js|css|json|txt|svg|webmanifest|xml)$/i.test(f.rel);
  const verifyOk = await new Promise((resolve) => {
    runWrangler(["r2", "object", "get", `${BUCKET}/${f.rel}`, "--pipe", "--remote"], { cwd: HERE, maxBuffer: 96 * 1024 * 1024, timeout: 60_000 })
      .then(async (r) => {
        const remote = String(r.stdout ?? "");
        if (!remote) return resolve(false);
        if (!isTexty || f._size >= 512 * 1024) return resolve(remote.length > 0); /* 非文本/超大：存在性验证 */
        const { readFile: rf } = await import("node:fs/promises");
        const local = await rf(f.full, "utf-8");
        const fp = (x) => x.slice(0, 200) + "·" + x.slice(-200);
        const same = fp(remote) === fp(local);
        if (!same) console.error(`  ⚠ 内容指纹不符（远端疑似旧版）: ${f.rel}`);
        resolve(same);
      })
      .catch(() => resolve(false));
  });
  const ok = verifyOk;
  if (!ok && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // 退避后重传
    return uploadOne(f, attempt + 1);
  }
  if (!ok) throw new Error("verified-missing after retries");
  return { rel: f.rel };
}

async function main() {
  /* 前置：重新生成卡面清单（队长把新卡图放对应目录后部署即自动更新可用图集，第四十三轮） */
  await import("./gen-card-arts.mjs");
  const esbuild = NO_MINIFY ? null : (await import("esbuild")).default ?? (await import("esbuild"));
  let all = (await walk(FRONTEND_DIR)).filter((f) => !FILTER || f.rel.includes(FILTER));
  /* 压缩副本：本地文件不动，上传走临时产物（JS esbuild/CSS·HTML 去注释） */
  all = await Promise.all(all.map((f) => minifiedCopy(f, esbuild)));
  /* 发布顺序纪律（b151 实证教训）：资产（JS/CSS/图片）先全部就位，HTML 最后切换——
     若 HTML 先到，页面以新 ?v= 引用拉到尚未更新的旧资产，SW/CDN 会把"新参数→旧内容"缓存住 1h */
  const phases = [[], []];
  for (const f of all) phases[f.rel.endsWith(".html") ? 1 : 0].push(f);
  const files = [...phases[0], ...phases[1]];
  const total = files.length;
  const totalBytes = (await Promise.all(files.map((f) => stat(f.full).then((s) => s.size)))).reduce((a, b) => a + b, 0);

  /* ===== 增量跳过（第七十轮根治"卡 325/336"）：绝大多数部署只有十几个 JS/CSS/HTML 真实变更，
     270MB 卡面图每次全量重传是纯粹的暴露面——GFW 代理偶发停滞撞上大文件段就是"卡死"。
     state 记 {rel → size+mtimeMs}（上传成功后才记）；--force 全量逃生口（远端被清/不确定时用）。
     压缩产物是确定函数（esbuild 同版本同输入同输出/去注释纯文本变换），源未变即可跳过。 */
  const FORCE = args.includes("--force");
  const STATE_PATH = path.resolve(HERE, "../.deploy-state.json");
  let state = {};
  if (!FORCE && !FILTER) { try { state = JSON.parse((await readFile(STATE_PATH, "utf8")).toString()); } catch { state = {}; } }
  for (const f of files) { f._size = (await stat(f.src)).size; f._mtime = (await stat(f.src)).mtimeMs; }
  const changed = [], skipped = [];
  for (const f of files) {
    const prev = state[f.rel];
    if (prev && prev.size === f._size && prev.mtimeMs === f._mtime) skipped.push(f);
    else changed.push(f);
  }
  const stateAfter = { ...state };
  console.log(`上传 ${changed.length}/${total} 个文件（${(totalBytes / 1024 / 1024).toFixed(1)} MB 总量，跳过未变更 ${skipped.length} 个${FILTER ? `，过滤：${FILTER}` : ""}${FORCE ? "，--force 全量" : ""}）至 ${BUCKET}/`);

  /* 大文件（>1MB）单独低并发通道：20 路并发齐压代理时停滞概率放大（队长实测卡点全在大文件段） */
  const BIG = 1024 * 1024;
  const smallQ = changed.filter((f) => f._size <= BIG);
  const bigQ = changed.filter((f) => f._size > BIG);
  let done = 0, failed = [];
  /* 进度走 stderr（stdout 在管道下全缓冲——卡住时一行都看不到，无法定位卡在哪个文件） */
  const progress = (tag) => { done++; if (done % 10 === 0 || done === changed.length) console.error(`  进度 ${done}/${changed.length}（${tag}）`); };
  async function worker(q, tag) {
    while (q.length) {
      const f = q.shift();
      try {
        await uploadOne(f);
        stateAfter[f.rel] = { size: f._size, mtimeMs: f._mtime };
        progress(tag);
      } catch (e) {
        try {
          await uploadOne(f);
          stateAfter[f.rel] = { size: f._size, mtimeMs: f._mtime };
          progress(tag);
        } catch (e2) { failed.push({ rel: f.rel, err: e2.message.slice(0, 200) }); console.error(`  ✗ ${f.rel} — ${e2.message.slice(0, 120)}`); }
      }
    }
  }
  await Promise.all([
    ...Array.from({ length: CONCURRENCY }, () => worker(smallQ, "小文件")),
    ...Array.from({ length: Math.max(2, Math.min(4, CONCURRENCY)) }, () => worker(bigQ, "大文件")),
  ]);
  /* state 只在本次无失败时整体落盘（有失败时保留旧 state，下次自动重传失败者） */
  if (!failed.length && !FILTER) {
    await writeFile(STATE_PATH, JSON.stringify(stateAfter), "utf8").catch(() => {});
  }
  if (TMP_DIR) await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {}); // 临时压缩副本即删

  if (failed.length) {
    console.error(`失败 ${failed.length} 个：`);
    for (const f of failed) console.error(`  ✗ ${f.rel} — ${f.err}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ 全部完成：${done}/${changed.length}（跳过未变更 ${skipped.length}，state 已更新）`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
