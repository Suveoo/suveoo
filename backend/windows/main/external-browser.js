/**
 * Suveoo for Windows — 站外链接内嵌浏览器（BrowserSheet 等价物）
 * ---------------------------------------------------------------
 * 单例子窗口：BrowserView 承载外域页面 + 自有协议工具条（/__win/toolbar.html，
 * 专属 preload + IPC，无 console 黑科技）。host 复核双保险（classifyTarget 已判，
 * 此处再验——防御纵深）。同一时间单实例，再点外链复用导航。
 */
"use strict";

const path = require("path");
const { BrowserWindow, BrowserView, ipcMain, shell } = require("electron");
const { toLocalUrl } = require("./protocol");

let extWin = null;
let extView = null;

const TOOLBAR_H = 40;

function isSafeExternal(urlStr) {
  let u;
  try { u = new URL(String(urlStr)); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "[::1]") return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0 || a >= 224) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

function layout() {
  if (!extWin || !extView) return;
  const [w, h] = extWin.getContentSize();
  extView.setBounds({ x: 0, y: TOOLBAR_H, width: w, height: Math.max(h - TOOLBAR_H, 0) });
}

function updateUrl(u) {
  if (!extWin || extWin.isDestroyed()) return;
  extWin.webContents
    .executeJavaScript(`window.suveooExtUpdate && window.suveooExtUpdate(${JSON.stringify(String(u).slice(0, 300))})`)
    .catch(() => {});
}

function createExtWindow(parentWin, url) {
  extWin = new BrowserWindow({
    width: 1100,
    height: 760,
    parent: parentWin || undefined,
    title: "Suveoo 浏览器",
    autoHideMenuBar: true,
    backgroundColor: "#FFFFFF",
    webPreferences: {
      preload: path.resolve(__dirname, "..", "bridge", "preload-toolbar.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  extView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  extWin.addBrowserView(extView);
  layout();

  extWin.loadURL(toLocalUrl("/__win/toolbar.html?url=" + encodeURIComponent(url)));
  extView.webContents.loadURL(url);

  extView.webContents.setWindowOpenHandler(({ url: u }) => {
    if (isSafeExternal(u)) extView.webContents.loadURL(u); // 二级外链仍在内嵌视图
    else if (/^https?:\/\/([\w-]+\.)?suveoo\.com\//.test(u)) {
      // 从外页跳回自家域：交给主窗口（navigation 归一）
      if (parentWin && !parentWin.isDestroyed()) parentWin.webContents.loadURL(u);
      try { extWin.close(); } catch {}
    }
    return { action: "deny" };
  });
  extView.webContents.on("did-navigate", (_e, u) => updateUrl(u));
  extView.webContents.on("did-navigate-in-page", (_e, u) => updateUrl(u));

  extWin.on("resize", layout);
  extWin.on("closed", () => { extWin = null; extView = null; });
  return extWin;
}

function registerIpc() {
  ipcMain.handle("ext:open", (e, url) => {
    if (!extWin || e.sender !== extWin.webContents) return false; // 仅工具条本窗可调
    if (!isSafeExternal(url)) return false;
    shell.openExternal(url);
    return true;
  });
  ipcMain.handle("ext:close", (e) => {
    if (extWin && e.sender === extWin.webContents) { try { extWin.close(); } catch {} }
    return true;
  });
}

/** 主入口：外链 → 单例内嵌浏览器窗口（替代 M1 的系统浏览器直开） */
function openExternalInApp(parentWin, url) {
  if (!isSafeExternal(url)) return false;
  if (extWin && !extWin.isDestroyed()) {
    extWin.show();
    extWin.focus();
    if (extView && !extView.webContents.isDestroyed()) { extView.webContents.loadURL(url); updateUrl(url); }
    return true;
  }
  createExtWindow(parentWin, url);
  return true;
}

module.exports = { openExternalInApp, isSafeExternal, registerIpc };
