/**
 * Suveoo for macOS — 本地资产协议
 * --------------------------------
 * 与 Windows 壳同源（backend/windows/main/protocol.js）：自定义安全协议 suveoo-app://
 * 承载 frontend/ 静态快照（零改动零构建）。origin = suveoo-app://local —— 与 Windows 壳
 * 完全相同，Worker SHELL_ORIGINS（worker-main.js:7876）已放行，零服务端改动。
 * frontend/assets/js/core/api.js:5 的双层 base 对非 suveoo.com 域名自动切
 * "https://suveoo.com" 绝对地址。静态解析顺序复刻 worker-main.js:7675：[p, p/index.html, p.html]。
 * mac 差异仅一处：shell-update.js 的 manifest 路径重写目标为 /dl/macos-manifest.json。
 */
"use strict";

const path = require("path");

const SCHEME = "suveoo-app";
const HOST = "local";
/** frontend 快照目录：开发态=仓库 ../../frontend；打包态=resources/frontend（extraResources） */
function frontendDir() {
  try {
    const { app } = require("electron");
    if (app && app.isPackaged) return path.join(process.resourcesPath, "frontend");
  } catch { /* 纯 Node（vitest）环境走仓库路径 */ }
  return path.resolve(__dirname, "..", "..", "..", "frontend");
}
/** 壳内部桥接页目录（工具条/离线页等；路径空间 /__win/**（沿用 Windows 命名保零 diff）；打包后位于 asar 内，fs 透明可读） */
const BRIDGE_DIR = path.resolve(__dirname, "..", "bridge");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

/** 与 worker 静态路由同顺序的候选键：[p, p/index.html, p.html]（p 为 "/" 时仅 index.html） */
function candidateKeys(pathname) {
  const p = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/[?#].*$/, "");
  if (p === "") return ["index.html"];
  return [p, `${p}/index.html`, `${p}.html`];
}

/** 动态路由重写（镜像 worker-main.js rewriteDynamicRoutes——第一百五十七轮队长实测：
 *  卡片页三按钮（交易明细/挂失/更多）与 /ai/s/{sid} 在壳内 404 的根因即壳缺此层。
 *  仅重写文件查找路径，地址栏 URL 不变——页面 JS 从 location.pathname 取 slug 不受影响。） */
function rewriteDynamicRoutes(pathname) {
  const m = /^\/account\/card\/[^/]+\/(history|settings|report-loss)\/?$/.exec(pathname);
  if (m) return `/account/card/${m[1]}`;
  if (/^\/ai\/s\/[a-zA-Z0-9_-]+\/?$/.test(pathname)) return "/ai";
  const am = /^\/assets\/images\/cards-front\/credit-cards\/(?!mastercard\/|visa\/|american-express\/|unionpay\/)([^/]+\.webp)$/.exec(pathname);
  if (am) return `/assets/images/cards-front/credit-cards/mastercard/${am[1]}`;
  const dm = /^\/assets\/images\/cards-front\/debit-cards\/(?!mastercard\/|visa\/|american-express\/|unionpay\/)([^/]+\.webp)$/.exec(pathname);
  if (dm) return `/assets/images/cards-front/debit-cards/mastercard/${dm[1]}`;
  return pathname;
}

/** 把候选键解析为 frontend 快照内的真实文件；防目录穿越，未命中返回 null */
function resolveAsset(pathname) {
  const FRONTEND_DIR = frontendDir();
  const route = rewriteDynamicRoutes(pathname);
  for (const key of candidateKeys(route)) {
    const abs = path.normalize(path.join(FRONTEND_DIR, key));
    if (abs !== FRONTEND_DIR && !abs.startsWith(FRONTEND_DIR + path.sep)) continue; // 防穿越
    try {
      const st = require("fs").statSync(abs);
      if (st.isFile()) return abs;
    } catch { /* 候选未命中，继续 */ }
  }
  return null;
}

/** suveoo-app://local<path> ← → 站内路径互转（导航重写与深链共用） */
function toLocalUrl(pathname) {
  return `${SCHEME}://${HOST}${pathname.startsWith("/") ? pathname : "/" + pathname}`;
}
function fromLocalUrl(url) {
  const u = new URL(url);
  return u.pathname + u.search + u.hash;
}

/** 必须在 app ready 之前调用：把 suveoo-app 注册为标准安全协议 */
function registerSchemesAsPrivileged() {
  const { protocol } = require("electron");
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
  ]);
}

function registerProtocolHandler() {
  const { protocol } = require("electron");
  const fs = require("fs");
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);

    // 壳内部桥接页：/__win/<file> → backend/macos/bridge/<file>（防穿越；路径名沿用 Windows 保零 diff）
    if (u.pathname.startsWith("/__win/")) {
      // E2E OTP 回填通道（仅测试态）：/__win/e2e-otp.txt ← backend/macos/e2e-otp.txt（外部脚本写入）
      if (u.pathname === "/__win/e2e-otp.txt" && process.env.SVEOO_E2E === "1") {
        const f = path.resolve(__dirname, "..", "e2e-otp.txt");
        const code = fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "";
        return new Response(code, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      }
      // E2E 账户凭据注入（仅测试态）：/__win/e2e-creds.json ← backend/macos/e2e-creds.json（gitignore）
      if (u.pathname === "/__win/e2e-creds.json" && process.env.SVEOO_E2E === "1") {
        const f = path.resolve(__dirname, "..", "e2e-creds.json");
        if (!fs.existsSync(f)) return new Response("{}", { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        return new Response(fs.readFileSync(f), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      const key = decodeURIComponent(u.pathname.slice("/__win/".length)).replace(/^\/+/, "");
      const abs = path.normalize(path.join(BRIDGE_DIR, key));
      if (abs.startsWith(BRIDGE_DIR + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const ext = path.extname(abs).toLowerCase();
        return new Response(fs.readFileSync(abs), {
          status: 200,
          headers: { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" },
        });
      }
      return new Response("Not Found", { status: 404 });
    }

    const file = resolveAsset(u.pathname);
    if (!file) {
      const notFound = resolveAsset("/404.html");
      if (notFound) {
        const buf = fs.readFileSync(notFound);
        return new Response(buf, { status: 404, headers: { "content-type": MIME[".html"] } });
      }
      return new Response("Not Found", { status: 404 });
    }
    const ext = path.extname(file).toLowerCase();
    let buf = fs.readFileSync(file);

    // —— 壳注入口（仅 HTML；等价 build-apk.mjs 对 APK 的注入，前端仓库零改动）——
    // ① 前端两个壳脚本（更新 UI / 生物识别）原本由 APK 构建注入，网页不引用——壳内补挂
    // ② shell-update.js 的 APK manifest 路径重写为 macOS manifest + 下载附带 sha256 校验
    if (ext === ".html" && !process.env.SVEOO_SMOKE) {
      let html = buf.toString("utf8");
      if (/<\/body>/i.test(html)) {
        let inject =
          '<script defer src="/assets/js/core/shell-update.js"></script>\n' +
          '<script defer src="/assets/js/core/biometric-shell.js"></script>\n';
        if (process.env.SVEOO_E2E === "1") inject += '<script defer src="/__win/e2e-driver.js"></script>\n';
        html = html.replace(/<\/body>/i, inject + "</body>");
        buf = Buffer.from(html, "utf8");
      }
    }
    if (file.endsWith("shell-update.js")) {
      let js = buf.toString("utf8");
      js = js.replace('"/dl/apk-manifest.json?t="', '"/dl/macos-manifest.json?t="');
      js = js.replace("Upd.download({ url: info.url })", "Upd.download({ url: info.url, sha256: info.sha256 })");
      buf = Buffer.from(js, "utf8");
    }

    return new Response(buf, {
      status: 200,
      headers: { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-cache" },
    });
  });
}

module.exports = { SCHEME, HOST, frontendDir, BRIDGE_DIR, resolveAsset, toLocalUrl, fromLocalUrl, registerSchemesAsPrivileged, registerProtocolHandler, candidateKeys, rewriteDynamicRoutes };
