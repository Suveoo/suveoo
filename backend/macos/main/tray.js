/**
 * Suveoo for macOS — 菜单栏托盘
 * -------------------------------
 * 与 Windows 版同源。mac 差异：① Tray 在 mac 是菜单栏图标，单击即应唤起主窗
 * （Windows 用 double-click）；② 图标缩至 16pt 高度自适应菜单栏。红钮 close→hide
 * 驻留语义下，托盘「退出」与菜单「退出 Suveoo」是唯二真正退出入口。
 */
"use strict";

const path = require("path");
const { Tray, Menu, nativeImage, app } = require("electron");
const { frontendDir } = require("./protocol");

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(frontendDir(), "favicon", "favicon-128x128.png"));
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ height: 18 }); // 菜单栏高度自适应（保比高）
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
  if (process.platform === "darwin") {
    tray.on("click", () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }); // mac 单击唤起
  } else {
    tray.on("double-click", () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });
  }
  return { tray, rebuild };
}

module.exports = { createTray };
