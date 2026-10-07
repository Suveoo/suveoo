/**
 * Suveoo for Windows — 系统托盘
 * -----------------------------
 * M1：显示主窗口 / 退出；窗口关闭 → 驻留托盘（对齐 Android 后台语义）。
 * M2 将叠加：未读角标、速览菜单、通知点击路由。
 */
"use strict";

const path = require("path");
const { Tray, Menu, nativeImage, app } = require("electron");
const { frontendDir } = require("./protocol");

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(frontendDir(), "favicon", "favicon-128x128.png"));
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function createTray(win) {
  const tray = new Tray(trayIcon());
  tray.setToolTip("Suveoo — Agentic Banking Control Plane");
  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "显示 Suveoo", click: () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } },
      { type: "separator" },
      { label: "退出", click: () => { app.exit(0); } },
    ]));
  };
  rebuild();
  tray.on("double-click", () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });
  return { tray, rebuild };
}

module.exports = { createTray };
