#!/usr/bin/env node
/**
 * Suveoo for macOS — 一键发布到 R2（构建 → 哈希 → 上传 → manifest 更新）
 * =====================================================================
 * 用法：
 *   node scripts/release.mjs          # 完整发布（R2 上传 DMG+zip + 更新 manifest）
 *   node scripts/release.mjs --dry    # 只构建+哈希，不上传
 *   node scripts/release.mjs --notes "修复 xx"   # manifest notes 覆写
 * 分发通道：R2 + suveoo.com/download（GitHub Release 不在本脚本范围——队长未来多端同 tag 统一发）。
 * 铁律：wrangler r2 object put 必带 --remote。
 * 与 Windows 版差异：无 rcedit 环节（mac 元数据经 electron-builder 配置注入）；
 * 双产物 = suveoo-setup-{v}.dmg（拖装）+ suveoo-macos-{v}.zip（脚本党/自动更新备选）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // backend/macos
const BACKEND = path.resolve(ROOT, "..");                                // backend（wrangler.toml 所在）
const DRY = process.argv.includes("--dry");
const NOTES_ARG = (process.argv.find((a) => a.startsWith("--notes=")) || "").slice(8) || null;

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const V = pkg.version;
const semverToCode = (v) => { const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/); return m ? +m[1] * 1e6 + +m[2] * 1e3 + +m[3] : 0; };

const log = (s) => process.stdout.write(`[release] ${s}\n`);
const run = (cmd, args, opts = {}) => {
  // mac 无 Windows 的 .cmd 壳问题，统一 shell:false（npx 为可执行脚本）
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts, env: opts.env });
  if (r.status !== 0) { log(`FAIL: ${cmd} ${args.join(" ")} (exit ${r.status})`); process.exit(1); }
  return r;
};

// ① 图标（幂等）
log(`icon → ${run("bash", [path.join(ROOT, "scripts", "make-icns.sh")], { stdio: "pipe" }).stdout.toString().trim() || "ok"}`);

// ② 三段式构建（镜像 Windows 流程的 mac 版）：
//    dir → 手动 codesign ad-hoc（electron-builder 25 对 identity:"-" 会误查证书名而跳过签名）→ --prepackaged dmg+zip
log(`building ${V} …`);
const ENV = {
  ...process.env,
  ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR: "https://npmmirror.com/mirrors/electron-builder-binaries/",
};
run("npx", ["electron-builder", "--mac", "dir"], { cwd: ROOT, env: ENV });
const APP = path.join(ROOT, "dist", "mac", "Suveoo.app");
if (!existsSync(APP)) { log(`missing unpacked app: ${APP}`); process.exit(1); }
// ad-hoc 签名（无 Apple 开发者账号；--deep 覆盖内嵌 Helper/XPC 等全部 Mach-O）
run("codesign", ["--force", "--deep", "-s", "-", APP]);
run("codesign", ["--verify", "--verbose=1", APP]); // 签名自验（失败即中止发布）
run("npx", ["electron-builder", "--mac", "dmg", "zip", "--prepackaged", path.join(ROOT, "dist", "mac")], { cwd: ROOT, env: ENV });

// ③ 哈希
const setup = path.join(ROOT, "dist", `suveoo-setup-${V}.dmg`);
const zipf = path.join(ROOT, "dist", `suveoo-macos-${V}.zip`);
for (const f of [setup, zipf]) if (!existsSync(f)) { log(`missing artifact: ${f}`); process.exit(1); }
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const shaSetup = sha(setup);
const shaZip = sha(zipf);
writeFileSync(`${setup}.sha256`, `${shaSetup}  suveoo-setup-${V}.dmg\n`, "utf8");
writeFileSync(`${zipf}.sha256`, `${shaZip}  suveoo-macos-${V}.zip\n`, "utf8");
const mb = (f) => (statSync(f).size / 1048576).toFixed(1);
log(`dmg ${mb(setup)} MB  sha256=${shaSetup.slice(0, 16)}…`);
log(`zip ${mb(zipf)} MB  sha256=${shaZip.slice(0, 16)}…`);

if (DRY) { log("--dry：跳过上传，产物在 dist/"); process.exit(0); }

// ④ 上传安装包到 R2（必带 --remote）
for (const f of [setup, zipf]) {
  log(`upload r2 dl/${path.basename(f)}`);
  run("npx", ["wrangler", "r2", "object", "put", `suveoo-bank-r2/dl/${path.basename(f)}`, "--remote", "--file", f], { cwd: BACKEND });
}

// ⑤ manifest 更新（保留线上 minVersionCode——强制线是服务端独立决策）
let minVersionCode = 0;
try {
  const cur = JSON.parse(run("npx", ["wrangler", "r2", "object", "get", "suveoo-bank-r2/dl/macos-manifest.json", "--remote", "--pipe"], { cwd: BACKEND, stdio: "pipe" }).stdout.toString() || "{}");
  minVersionCode = Number(cur.minVersionCode) || 0;
} catch { /* 线上无 manifest（首次） */ }
const manifest = {
  versionName: V,
  versionCode: semverToCode(V),
  minVersionCode,
  url: `/dl/suveoo-setup-${V}.dmg`,
  file: `suveoo-setup-${V}.dmg`,
  sizeBytes: statSync(setup).size,
  sha256: shaSetup,
  zipUrl: `/dl/suveoo-macos-${V}.zip`,
  zipSha256: shaZip,
  releasedAt: new Date().toISOString().slice(0, 10),
  notes: NOTES_ARG || `Suveoo for macOS ${V}`,
};
const mf = path.join(ROOT, "dist", "macos-manifest.json");
writeFileSync(mf, JSON.stringify(manifest, null, 2) + "\n", "utf8");
log("upload r2 dl/macos-manifest.json");
run("npx", ["wrangler", "r2", "object", "put", "suveoo-bank-r2/dl/macos-manifest.json", "--remote", "--content-type", "application/json", "--file", mf], { cwd: BACKEND });

log(`DONE ${V} → https://suveoo.com/dl/suveoo-setup-${V}.dmg ｜ manifest vc${manifest.versionCode}`);
