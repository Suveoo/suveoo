/**
 * Suveoo for Windows — 导航守卫
 * -----------------------------
 * 站内链接 100% 主窗口内打开（suveoo-app:// 与 https://suveoo.com 双源互写）；
 * 站外链接 M1 先交系统默认浏览器（M2 换 BrowserView 内嵌浏览器窗口）。
 * URL 安全铁律：仅 http/https 可外开；host 白名单外一律拒绝。
 */
"use strict";

const { toLocalUrl, fromLocalUrl } = require("./protocol");

/** 生产域（含 www）：站内，重写为本地协议 */
function isProdSite(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === "https:" && (/^suveoo\.com$/i.test(u.hostname) || /^www\.suveoo\.com$/i.test(u.hostname) || /\.suveoo\.com$/i.test(u.hostname));
  } catch { return false; }
}

function isLocalAsset(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === "suveoo-app:" && u.hostname === "local";
  } catch { return false; }
}

/** 站内（本地协议或生产域）判定 */
function isInternal(urlStr) {
  return isLocalAsset(urlStr) || isProdSite(urlStr);
}

/**
 * 解析目标：站内返回 { kind: "internal", url }（已归一为 suveoo-app://）；
 * 外部返回 { kind: "external", url }；非法返回 { kind: "deny" }。
 * 深链 suveoo://account/cards 也在此归一（M2 注册系统协议后生效）。
 */
function classifyTarget(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return { kind: "deny" };
  let u;
  try { u = new URL(urlStr); } catch { return { kind: "deny" }; }

  if (isLocalAsset(urlStr)) return { kind: "internal", url: urlStr };

  // 深链：suveoo://account/cards → suveoo-app://local/account/cards
  if (u.protocol === "suveoo:") {
    const rest = urlStr.slice("suveoo://".length);
    return { kind: "internal", url: toLocalUrl("/" + rest.replace(/^\/+/, "")) };
  }

  if (isProdSite(urlStr)) {
    // www → 裸域；保留 path/search/hash
    return { kind: "internal", url: toLocalUrl(u.pathname + u.search + u.hash) };
  }

  // 站外：仅放行 http/https 且拒绝环回/私网/保留地址（安全铁律）
  if (u.protocol === "http:" || u.protocol === "https:") {
    const h = u.hostname.toLowerCase();
    const isLoopback = h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h.endsWith(".localhost");
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    const isPrivateV4 = ipv4 && (Number(ipv4[1]) === 10 || Number(ipv4[1]) === 127 || (Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168) || (Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31) || Number(ipv4[1]) === 0 || Number(ipv4[1]) >= 224);
    const isPrivateV6 = u.hostname.includes(":") && (u.hostname === "::" || u.hostname.startsWith("fc") || u.hostname.startsWith("fd") || u.hostname.startsWith("fe80"));
    if (isLoopback || isPrivateV4 || isPrivateV6) return { kind: "deny" };
    return { kind: "external", url: urlStr };
  }

  return { kind: "deny" };
}

/** 挂到 BrowserWindow.webContents：will-navigate + setWindowOpenHandler + 返回键 */
function attachNavigationGuard(win, { onExternal } = {}) {
  const wc = win.webContents;

  wc.on("will-navigate", (event, url) => {
    // 生产域下载路径（/dl/**）：本地壳无此资产，拦截转下载流（will-download 落盘系统下载目录）
    let dl = null;
    try {
      const u0 = new URL(url);
      if (u0.protocol === "https:" && (/^suveoo\.com$|^www\.suveoo\.com$/.test(u0.hostname) || u0.hostname.endsWith(".suveoo.com")) && u0.pathname.startsWith("/dl/")) dl = url;
    } catch { /* fallthrough */ }
    if (dl) { event.preventDefault(); wc.downloadURL(dl); return; }

    const t = classifyTarget(url);
    if (t.kind === "internal") {
      if (url !== t.url) { // 生产域/深链 → 重写为本地协议
        event.preventDefault();
        wc.loadURL(t.url);
      }
      return; // 本地协议原样放行
    }
    event.preventDefault();
    if (t.kind === "external") openExternal(t.url, onExternal);
  });

  wc.setWindowOpenHandler(({ url }) => {
    try {
      const u0 = new URL(url);
      if (u0.protocol === "https:" && (/^suveoo\.com$|^www\.suveoo\.com$/.test(u0.hostname) || u0.hostname.endsWith(".suveoo.com")) && u0.pathname.startsWith("/dl/")) {
        wc.downloadURL(url);
        return { action: "deny" };
      }
    } catch { /* fallthrough */ }
    const t = classifyTarget(url);
    if (t.kind === "internal") {
      queueMicrotask(() => wc.loadURL(t.url)); // window.open 站内 → 主窗口内开
      return { action: "deny" };
    }
    if (t.kind === "external") openExternal(t.url, onExternal);
    return { action: "deny" };
  });

  // 返回/前进：Alt+←/→ 双平台 + mac 惯例 Cmd+←/→ 与 Cmd+[ ]（Backspace 不绑定，避免输入框误触）
  wc.on("before-input-event", (event, input) => {
    const action = navKeyAction(input, process.platform === "darwin");
    if (action === "back" && wc.navigationHistory.canGoBack()) {
      event.preventDefault();
      wc.navigationHistory.goBack();
    }
    if (action === "fwd" && wc.navigationHistory.canGoForward()) {
      event.preventDefault();
      wc.navigationHistory.goForward();
    }
  });
}

/** 返回/前进键判定（纯函数可单测）：Alt+←/→ 双平台；mac 另加 Cmd+←/→ 与 Cmd+[ ]；其余 null */
function navKeyAction(input, isMac) {
  if (!input || input.type !== "keyDown") return null;
  const altBack = input.alt === true && input.key === "ArrowLeft";
  const altFwd = input.alt === true && input.key === "ArrowRight";
  const macBack = isMac === true && input.meta === true && (input.key === "ArrowLeft" || input.key === "[");
  const macFwd = isMac === true && input.meta === true && (input.key === "ArrowRight" || input.key === "]");
  if (altBack || macBack) return "back";
  if (altFwd || macFwd) return "fwd";
  return null;
}

/** M1：外链交系统浏览器；M2 换 BrowserView 内嵌浏览器（onExternal 钩子预留给 M2） */
function openExternal(url, onExternal) {
  if (typeof onExternal === "function") return onExternal(url);
  require("electron").shell.openExternal(url);
}

module.exports = { classifyTarget, attachNavigationGuard, isInternal, isProdSite, navKeyAction };
