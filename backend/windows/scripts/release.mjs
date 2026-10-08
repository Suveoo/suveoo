#!/usr/bin/env node
/**
 * Suveoo for Windows — 一键发布到 R2（构建 → 哈希 → 上传 → manifest 更新）
 * =====================================================================
 * 用法：
 *   node scripts/release.mjs          # 完整发布（R2 上传安装包 + 更新 manifest）
 *   node scripts/release.mjs --dry    # 只构建+哈希，不上传
 *   node scripts/release.mjs --notes "修复 xx"   # manifest notes 覆写
 * 分发通道：R2 + suveoo.com/download（GitHub Release 不在本脚本范围——队长未来随 macOS 客户端一起发）。
 * 铁律：wrangler r2 object put 必带 --remote。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // backend/windows
const BACKEND = path.resolve(ROOT, "..");                                // backend（wrangler.toml 所在）
const DRY = process.argv.includes("--dry");
const NOTES_ARG = (process.argv.find((a) => a.startsWith("--notes=")) || "").slice(8) || null;

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const V = pkg.version;
const semverToCode = (v) => { const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/); return m ? +m[1] * 1e6 + +m[2] * 1e3 + +m[3] : 0; };

const log = (s) => process.stdout.write(`[release] ${s}\n`);
const run = (cmd, args, opts = {}) => {
  // npx/npm 在 Windows 是 .cmd 壳，必须经 shell；直接 exe（rcedit/python）保持 shell:false 免引号转义
  const viaShell = opts.shell ?? (process.platform === "win32" && !/\.(cmd|exe)$/i.test(cmd) && !/[/\\]/.test(cmd));
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: viaShell, ...opts, env: opts.env });
  if (r.status !== 0) { log(`FAIL: ${cmd} ${args.join(" ")} (exit ${r.status})`); process.exit(1); }
  return r;
};

// ① 图标（幂等）
log(`icon → ${run("python", [path.join(ROOT, "scripts", "make-ico.py")], { stdio: "pipe" }).stdout.toString().trim() || "ok"}`);

// ② 构建（三段式：dir → rcedit 图标/元数据 → prepackaged nsis+portable；
//    绕开 winCodeSign 缓存的 darwin 符号链接解包问题——signAndEditExecutable=false）
log(`building ${V} …`);
const ENV = {
  ...process.env,
  ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR: "https://npmmirror.com/mirrors/electron-builder-binaries/",
};
run("npx", ["electron-builder", "--win", "dir"], { cwd: ROOT, env: ENV });
// 在 winCodeSign 缓存中定位 rcedit-x64.exe（哈希目录随版本变化，不硬编码）
const WCS = path.join(process.env.LOCALAPPDATA || "", "electron-builder", "Cache", "winCodeSign");
let RCEDIT = null;
for (const ent of existsSync(WCS) ? readdirSync(WCS) : []) {
  const p = path.join(WCS, ent, "rcedit-x64.exe");
  if (existsSync(p)) RCEDIT = p;
}
if (!RCEDIT) { log(`rcedit-x64.exe 不存在于 ${WCS}（winCodeSign 缓存异常）`); process.exit(1); }
run(RCEDIT, [
  path.join(ROOT, "dist", "win-unpacked", "Suveoo.exe"),
  "--set-icon", path.join(ROOT, "build", "icon.ico"),
  "--set-version-string", "ProductName", "Suveoo",
  "--set-version-string", "FileDescription", "Suveoo — Agentic Banking Control Plane",
  "--set-file-version", `${V}.0`,
  "--set-product-version", `${V}.0`,
]);
run("npx", ["electron-builder", "--win", "nsis", "portable", "--prepackaged", "dist/win-unpacked"], { cwd: ROOT, env: ENV });

// ③ 哈希
const setup = path.join(ROOT, "dist", `suveoo-setup-${V}.exe`);
const portable = path.join(ROOT, "dist", `suveoo-portable-${V}.exe`);
for (const f of [setup, portable]) if (!existsSync(f)) { log(`missing artifact: ${f}`); process.exit(1); }
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const shaSetup = sha(setup);
const shaPortable = sha(portable);
writeFileSync(`${setup}.sha256`, `${shaSetup}  suveoo-setup-${V}.exe\n`, "utf8");
writeFileSync(`${portable}.sha256`, `${shaPortable}  suveoo-portable-${V}.exe\n`, "utf8");
const mb = (f) => (statSync(f).size / 1048576).toFixed(1);
log(`setup    ${mb(setup)} MB  sha256=${shaSetup.slice(0, 16)}…`);
log(`portable ${mb(portable)} MB  sha256=${shaPortable.slice(0, 16)}…`);

if (DRY) { log("--dry：跳过上传，产物在 dist/"); process.exit(0); }

// ④ 上传安装包到 R2（必带 --remote）
for (const f of [setup, portable]) {
  log(`upload r2 dl/${path.basename(f)}`);
  run("npx", ["wrangler", "r2", "object", "put", `suveoo-bank-r2/dl/${path.basename(f)}`, "--remote", "--file", f], { cwd: BACKEND });
}

// ⑤ manifest 更新（保留线上 minVersionCode——强制线是服务端独立决策）
let minVersionCode = 0;
try {
  const cur = JSON.parse(run("npx", ["wrangler", "r2", "object", "get", "suveoo-bank-r2/dl/windows-manifest.json", "--remote", "--pipe"], { cwd: BACKEND, stdio: "pipe" }).stdout.toString() || "{}");
  minVersionCode = Number(cur.minVersionCode) || 0;
} catch { /* 线上无 manifest（首次） */ }
const manifest = {
  versionName: V,
  version: V, /* 第一百五十九轮：前端 shell-update.js 读 info.version（Android apk-manifest 字段名）——缺此字段显示 vundefined */
  versionCode: semverToCode(V),
  minVersionCode,
  url: `/dl/suveoo-setup-${V}.exe`,
  file: `suveoo-setup-${V}.exe`,
  sizeBytes: statSync(setup).size,
  sha256: shaSetup,
  portableUrl: `/dl/suveoo-portable-${V}.exe`,
  releasedAt: new Date().toISOString().slice(0, 10),
  notes: NOTES_ARG || `Suveoo for Windows ${V}`,
};
const mf = path.join(ROOT, "dist", "windows-manifest.json");
writeFileSync(mf, JSON.stringify(manifest, null, 2) + "\n", "utf8");
log("upload r2 dl/windows-manifest.json");
run("npx", ["wrangler", "r2", "object", "put", "suveoo-bank-r2/dl/windows-manifest.json", "--remote", "--content-type", "application/json", "--file", mf], { cwd: BACKEND });

log(`DONE ${V} → https://suveoo.com/dl/suveoo-setup-${V}.exe ｜ manifest vc${manifest.versionCode}`);
