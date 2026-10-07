/**
 * Suveoo for macOS — 三级自动更新（复用前端 shell-update.js 全套 UI）
 * ------------------------------------------------------------------
 * 与 Windows 版同源：前端经 Capacitor Update 插件驱动；本模块提供 getInfo/download/install/cancelDownload。
 * 决策语义与 shell-update.js 完全一致：
 *   cur.versionCode < manifest.minVersionCode → force（全屏阻断）
 *   manifest.versionCode > cur.versionCode    → optional（询问弹窗，可贪睡 24h）
 *   其余                                        → latest（静默）
 * 安全铁律：更新包仅 https + suveoo.com（含子域），拒绝环回/私网/其他 host
 * （与 Android UpdatePlugin.java:52 同款白名单）；sha256 不符拒绝交付安装。
 * mac 差异：install 语义 = shell.openPath 打开 DMG 挂载（队长拍板项②A）——用户把
 * Suveoo.app 拖入 /Applications 覆盖完成安装，与 Android「唤起系统安装器、按屏幕
 * 提示完成」同语义；只打开主进程自己下载并校验过的 updates 目录内 .dmg/.zip。
 */
"use strict";

const path = require("path");
const fs = require("fs");

/** semver → 单调递增 versionCode（major*1e6 + minor*1e3 + patch） */
function semverToCode(v) {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
}

/** 更新决策（纯函数）：latest / optional / force */
function decideAction(cur, manifest) {
  const curCode = Number(cur && cur.versionCode) || 0;
  const info = manifest || {};
  const manifestCode = Number(info.versionCode) || 0;
  const minCode = Number(info.minVersionCode ?? 0) || 0;
  if (curCode < minCode) return "force";
  if (manifestCode > curCode) return "optional";
  return "latest";
}

/** 更新包 URL 白名单（仅 https + suveoo.com 或子域；拒绝环回/私网） */
function isAllowedUpdateUrl(urlStr) {
  let u;
  try { u = new URL(String(urlStr)); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (h === "::1" || h === "[::1]") return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0 || a >= 224) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
    return h === "suveoo.com" || h.endsWith(".suveoo.com");
  }
  return h === "suveoo.com" || h.endsWith(".suveoo.com");
}

// ---------------------------------------------------------------- 运行时实现（electron 懒依赖，纯函数区可独立单测）
let dlState = null;   // { url, controller }
let dlLastFile = null; // 本进程最近一次校验通过（含 sha256）的更新包路径

function updateDir() {
  const { app } = require("electron");
  const dir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getInfo() {
  const { app } = require("electron");
  const versionName = app.getVersion();
  return { versionName, versionCode: semverToCode(versionName) };
}

/** 下载更新包：sha256 可选校验；onProgress(bytes,total,percent)；返回本地文件路径 */
async function download({ url, sha256 } = {}, onProgress) {
  if (!isAllowedUpdateUrl(url)) throw new Error("URL_NOT_ALLOWED");
  const { net } = require("electron");
  const crypto = require("crypto");
  const controller = new AbortController();
  dlState = { url, controller };

  const res = await net.fetch(url, { signal: controller.signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const file = path.join(updateDir(), path.basename(new URL(url).pathname) || "suveoo-setup.dmg");
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(file);
  let bytes = 0;

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      hash.update(value);
      out.write(value);
      if (typeof onProgress === "function") {
        onProgress({ bytes, total, percent: total > 0 ? Math.floor((bytes / total) * 100) : -1 });
      }
    }
    out.end();
    if (sha256) {
      const actual = hash.digest("hex").toLowerCase();
      if (actual !== String(sha256).toLowerCase()) {
        try { fs.unlinkSync(file); } catch {}
        throw new Error("SHA256_MISMATCH");
      }
    }
    dlLastFile = file;
    return file;
  } finally {
    dlState = null;
  }
}

function cancelDownload() {
  if (dlState && dlState.controller) {
    try { dlState.controller.abort(); } catch {}
  }
}

/** 渲染层提交的安装器候选判定（纯函数可单测）：仅 updates 目录内的 .dmg/.zip 可入选，
 *  其余（含 .exe/穿越/目录外）一律 null——渲染层路径不可信。 */
function installerCandidate(fileUriFromRenderer, dir) {
  if (typeof fileUriFromRenderer !== "string" || !fileUriFromRenderer) return null;
  const abs = path.resolve(fileUriFromRenderer);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== ".dmg" && ext !== ".zip") return null;
  if (!abs.startsWith(dir + path.sep)) return null;
  return abs;
}

/** 打开 DMG 挂载并退出当前实例——「唤起系统安装器，用户按屏幕提示（拖入 Applications）完成」
 *  语义（队长拍板项②A）。加固：只允许打开主进程自己下载并校验过的 updates 目录内
 *  .dmg/.zip；渲染层传入的路径仅当落在自家 updates 目录且真实存在时才纳入候选；
 *  经 Electron shell.openPath 打开，绝无 child_process 拼接执行。 */
async function install(fileUriFromRenderer) {
  const { app, shell } = require("electron");
  const dir = updateDir();
  const candidates = [];
  if (dlLastFile && fs.existsSync(dlLastFile)) candidates.push(dlLastFile);
  const fromRenderer = installerCandidate(fileUriFromRenderer, dir);
  if (fromRenderer && fs.existsSync(fromRenderer) && !candidates.includes(fromRenderer)) {
    candidates.push(fromRenderer);
  }
  const target = candidates[0];
  if (!target) throw new Error("INSTALLER_MISSING");
  const err = await shell.openPath(target);
  if (err) throw new Error(String(err));
  setTimeout(() => app.exit(0), 800);
  return { ok: true };
}

module.exports = { semverToCode, decideAction, isAllowedUpdateUrl, getInfo, download, cancelDownload, install, installerCandidate };
