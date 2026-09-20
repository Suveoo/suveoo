#!/usr/bin/env node
/**
 * deploy-frontend.mjs — 把 frontend/ 全量上传至 R2 桶 suveoo-bank-r2 根。
 * 路径一一对应：frontend/home/index.html → suveoo-bank-r2/home/index.html
 *
 * 用法：
 *   node scripts/deploy-frontend.mjs                # 全量
 *   node scripts/deploy-frontend.mjs --filter i18n  # 仅上传路径含 "i18n" 的文件
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
const runWrangler = (args, opts) => exec(process.execPath, [WRANGLER_BIN, ...args], opts);

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const FILTER = flag("filter", null);
const CONCURRENCY = Number(flag("concurrency", "4"));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};

async function walk(dir, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, rel));
    else if (entry.isFile()) out.push({ rel, full });
  }
  return out;
}

async function uploadOne({ rel, full }, attempt = 0) {
  const type = CONTENT_TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
  await runWrangler(["r2", "object", "put", `${BUCKET}/${rel}`, "--file", full, "--content-type", type, "--remote"], {
    cwd: HERE,
    maxBuffer: 64 * 1024 * 1024,
  });
  // 回验：wrangler put 偶发"假成功"（对象未落桶），get 确认后才算数
  const ok = await new Promise((resolve) => {
    runWrangler(["r2", "object", "get", `${BUCKET}/${rel}`, "--pipe", "--remote"], { cwd: HERE, maxBuffer: 64 * 1024 * 1024 })
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
  if (!ok && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // 退避后重传
    return uploadOne({ rel, full }, attempt + 1);
  }
  if (!ok) throw new Error("verified-missing after retries");
  return { rel };
}

async function main() {
  const all = (await walk(FRONTEND_DIR)).filter((f) => !FILTER || f.rel.includes(FILTER));
  /* 发布顺序纪律（b151 实证教训）：资产（JS/CSS/图片）先全部就位，HTML 最后切换——
     若 HTML 先到，页面以新 ?v= 引用拉到尚未更新的旧资产，SW/CDN 会把"新参数→旧内容"缓存住 1h */
  const phases = [[], []];
  for (const f of all) phases[f.rel.endsWith(".html") ? 1 : 0].push(f);
  const files = [...phases[0], ...phases[1]];
  const total = files.length;
  const totalBytes = (await Promise.all(files.map((f) => stat(f.full).then((s) => s.size)))).reduce((a, b) => a + b, 0);
  console.log(`上传 ${total} 个文件（${(totalBytes / 1024 / 1024).toFixed(1)} MB）至 ${BUCKET}/${FILTER ? `（过滤：${FILTER}）` : ""}`);

  let done = 0, failed = [];
  const queue = [...files];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      try {
        await uploadOne(f);
        done++;
        if (done % 25 === 0 || done === total) console.log(`  进度 ${done}/${total}`);
      } catch (e) {
        // 重试一次
        try { await uploadOne(f); done++; } catch (e2) { failed.push({ rel: f.rel, err: e2.message.slice(0, 200) }); }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failed.length) {
    console.error(`失败 ${failed.length} 个：`);
    for (const f of failed) console.error(`  ✗ ${f.rel} — ${f.err}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ 全部完成：${done}/${total}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
