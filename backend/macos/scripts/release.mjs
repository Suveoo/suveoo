#!/usr/bin/env node
/**
 * Suveoo for macOS — 一键发布到 R2（构建 → 哈希 → 上传 → manifest 更新）
 * =====================================================================
 * 用法：
 *   node scripts/release.mjs          # 完整发布（R2 上传 DMG+zip + 更新 manifest）
 *   node scripts/release.mjs --dry    # 只构建+哈希，不上传不写 manifest
 *   node scripts/release.mjs --no-upload  # 协作模式：构建+签名+lipo 验证+写 dist/macos-manifest.json，不上传
 *                                         # （VM 构建后工件经共享目录由宿主机上传——vmhgfs 大文件上传不稳的既定协作模式）
 *   node scripts/release.mjs --notes "修复 xx"   # manifest notes 覆写
 * 分发通道：R2 + suveoo.com/download（GitHub Release 不在本脚本范围——队长未来多端同 tag 统一发）。
 * 铁律：wrangler r2 object put 必带 --remote。
 * 与 Windows 版差异：无 rcedit 环节（mac 元数据经 electron-builder 配置注入）；
 * 双产物 = suveoo-setup-{v}.dmg（拖装）+ suveoo-macos-{v}.zip（脚本党/自动更新备选）。
 * 第一百六十轮起产物为 universal 双架构（Intel x86_64 + Apple Silicon arm64 合一）：
 * 壳为纯 Electron+JS 零原生模块，Intel 机构建时直接组装 Electron 官方双架构预编译产物；
 * lipo 双片断言防单架构漏配；VM 可实测 x64 切片，arm64 切片待真机（上游 Electron + 架构无关 JS，低风险）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // backend/macos
const BACKEND = path.resolve(ROOT, "..");                                // backend（wrangler.toml 所在）
const DRY = process.argv.includes("--dry");
const NOUPLOAD = process.argv.includes("--no-upload");
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

// ② 三段式构建（镜像 Windows 流程的 mac 版；universal 双架构）：
//    dir --universal → 手动 codesign ad-hoc（electron-builder 25 对 identity:"-" 会误查证书名而跳过签名）→ --prepackaged dmg+zip
log(`building ${V} (universal) …`);
const ENV = {
  ...process.env,
  ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR: "https://npmmirror.com/mirrors/electron-builder-binaries/",
};
// 清理旧构建目录再开建：universal 的 --dir 产物落 dist/mac-universal，而旧 x64 流程落 dist/mac——
// 残留旧目录曾骗过 3.183.2 首构建（签名与 lipo 检查到的是 3.183.1 旧 x64 包），构建前一律清掉防再犯
for (const stale of ["mac", "mac-universal"]) {
  rmSync(path.join(ROOT, "dist", stale), { recursive: true, force: true });
}
run("npx", ["electron-builder", "--mac", "dir", "--universal"], { cwd: ROOT, env: ENV });
const APP = path.join(ROOT, "dist", "mac-universal", "Suveoo.app"); // universal --dir 输出目录（非 mac/）
if (!existsSync(APP)) { log(`missing unpacked app: ${APP}`); process.exit(1); }
// ad-hoc 签名（无 Apple 开发者账号；--deep 覆盖内嵌 Helper/XPC 等全部 Mach-O）
run("codesign", ["--force", "--deep", "-s", "-", APP]);
run("codesign", ["--verify", "--verbose=1", APP]); // 签名自验（失败即中止发布）
// 双架构断言：主程序必须同时含 x86_64 与 arm64——缺片即中止（防 flag 失效静默出单架构包）
const LIPO = spawnSync("lipo", ["-archs", path.join(APP, "Contents", "MacOS", "Suveoo")], { encoding: "utf8" }).stdout?.trim() || "";
log(`lipo -archs → ${LIPO}`);
if (!LIPO.includes("x86_64") || !LIPO.includes("arm64")) { log("FAIL: 非双架构产物（缺 x86_64 或 arm64 切片）"); process.exit(1); }
run("npx", ["electron-builder", "--mac", "dmg", "zip", "--prepackaged", path.join(ROOT, "dist", "mac-universal"), "--universal"], { cwd: ROOT, env: ENV });

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

if (DRY) { log("--dry：跳过上传与 manifest，产物在 dist/"); process.exit(0); }

// ④ 上传安装包到 R2（必带 --remote）；--no-upload 协作模式跳过（VM 构建工件经共享目录由宿主机上传）
if (!NOUPLOAD) {
  for (const f of [setup, zipf]) {
    log(`upload r2 dl/${path.basename(f)}`);
    run("npx", ["wrangler", "r2", "object", "put", `suveoo-bank-r2/dl/${path.basename(f)}`, "--remote", "--file", f], { cwd: BACKEND });
  }
}

// ⑤ manifest 更新（保留线上 minVersionCode——强制线是服务端独立决策）
let minVersionCode = 0;
try {
  const cur = JSON.parse(run("npx", ["wrangler", "r2", "object", "get", "suveoo-bank-r2/dl/macos-manifest.json", "--remote", "--pipe"], { cwd: BACKEND, stdio: "pipe" }).stdout.toString() || "{}");
  minVersionCode = Number(cur.minVersionCode) || 0;
} catch { /* 线上无 manifest（首次） */ }
const manifest = {
  versionName: V,
  version: V, /* 第一百五十九轮：前端 shell-update.js 读 info.version（Android apk-manifest 字段名）——缺此字段显示 vundefined */
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
if (NOUPLOAD) {
  log(`--no-upload：manifest 已写 ${mf}；DMG/zip/manifest 三件待宿主机上传（wrangler r2 put --remote）`);
} else {
  log("upload r2 dl/macos-manifest.json");
  run("npx", ["wrangler", "r2", "object", "put", "suveoo-bank-r2/dl/macos-manifest.json", "--remote", "--content-type", "application/json", "--file", mf], { cwd: BACKEND });
  log(`DONE ${V} → https://suveoo.com/dl/suveoo-setup-${V}.dmg ｜ manifest vc${manifest.versionCode}`);
}
