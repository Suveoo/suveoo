/**
 * Suveoo for macOS — 主进程入口
 * --------------------------------
 * 整体复用 Windows 壳（backend/windows/main/main.js），mac 差异五处：
 *  ① 深链走 app.on("open-url")（will-finish-launching 起挂，ready 前到达先存 pending）
 *  ② 菜单栏保留 mac 最小菜单（App/编辑）——mac 的 Cmd+C/V 依赖 Edit 菜单存在，不可清空
 *  ③ 未读角标走 app.dock.setBadge（替代 Windows 托盘 tooltip 角标）
 *  ④ 红钮 close→hide 驻留（队长拍板项①A：与 Windows/Android 后台语义一致，dock/菜单栏图标唤回）
 *  ⑤ 返回键 Cmd+←/→ 与 Cmd+[ ]（navigation.js 内适配，Alt 分支保留供外接 Win 键盘）
 * 版本策略：versionName 对齐 changelog 版本流（macOS 从 3.183.0 起），未来 GitHub 多端同 tag 发布。
 */
"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, shell } = require("electron");
const protocol = require("./protocol");
const nav = require("./navigation");
const { createTray } = require("./tray");
const notify = require("./notify");
const externalBrowser = require("./external-browser");
const { registerCapacitorIpc } = require("./ipc");

const IS_MAC = process.platform === "darwin";
const APP_START = "/home/index.html"; // 与 Android capacitor.config.json appStartPath 一致
const APP_VERSION = app.getVersion ? app.getVersion() : require("../package.json").version;
const faviconDir = () => path.join(protocol.frontendDir(), "favicon");

if (process.argv.includes("--smoke")) process.env.SVEOO_SMOKE = "1"; // 冒烟跳过壳注入口（解耦线上 manifest）

// 安全协议注册（必须在 app ready 之前）
protocol.registerSchemesAsPrivileged();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows 宿主混合显卡曾触发 GPU 崩溃而默认禁 GPU；VMware SVGA 3D 加速同样不可靠——
  // mac 默认沿用禁 GPU，真实 Mac/图形正常环境可 --enable-gpu 恢复（M1 双模式实测后固化）
  if (!process.argv.includes("--enable-gpu")) {
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
  }

  // —— mac 深链：open-url 事件（冷启动时在 ready 前送达，先排队；will-finish-launching 起挂双保险）——
  let pendingDeepLink = null;
  const deeplinkLog = (s) => {
    try {
      const fs = require("fs");
      const { app: a } = require("electron");
      fs.appendFileSync(require("path").join(a.getPath("userData"), "deeplink.log"), `[${new Date().toISOString()}] ${s}\n`);
    } catch { /* 日志失败不影响主流程 */ }
  };
  app.on("will-finish-launching", () => {
    app.on("open-url", (e, url) => {
      try { e.preventDefault(); } catch { /* 无 preventDefault 可拦时照常处理 */ }
      deeplinkLog(`open-url(wfl) ${url}`);
      if (mainWin && !mainWin.isDestroyed()) routeDeepLink(url);
      else pendingDeepLink = url;
    });
  });
  app.on("open-url", (e, url) => { // ready 后注册的这份兜底（覆盖非 will-finish-launching 路径）
    try { e.preventDefault(); } catch {}
    deeplinkLog(`open-url ${url}`);
    if (mainWin && !mainWin.isDestroyed()) routeDeepLink(url);
    else pendingDeepLink = url;
  });

  function routeDeepLink(deep) {
    if (typeof deep !== "string" || !deep.startsWith("suveoo://")) return;
    deeplinkLog(`route ${deep} win=${!!(mainWin && !mainWin.isDestroyed())}`);
    const t = nav.classifyTarget(deep);
    if (t.kind === "internal") mainWin.webContents.loadURL(t.url);
  }

  app.on("second-instance", (_e, argv) => {
    // `open "suveoo://…"` 唤起运行中实例时 mac 也可能走 argv（与 open-url 双保险）
    deeplinkLog(`second-instance argv=${JSON.stringify(argv)}`);
    const deep = argv.find((a) => a.startsWith("suveoo://"));
    const target = mainWin || globalThis.__e2eWin; // E2E 模式路由到协调器窗口
    if (target && !target.isDestroyed()) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
      if (deep) {
        const t = nav.classifyTarget(deep);
        if (t.kind === "internal") target.webContents.loadURL(t.url);
      }
    }
  });

  let mainWin = null;
  let trayRef = null;

  function capEmit(plugin, event, data) {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("cap:event", { plugin, event, data });
    }
  }

  function createWindow() {
    mainWin = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 1024,
      minHeight: 680,
      show: false,
      autoHideMenuBar: true,
      icon: nativeImage.createFromPath(path.join(faviconDir(), "favicon-128x128.png")),
      backgroundColor: "#FFFFFF",
      title: "Suveoo",
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });

    nav.attachNavigationGuard(mainWin, {
      onExternal: (url) => externalBrowser.openExternalInApp(mainWin, url),
    });
    mainWin.once("ready-to-show", () => mainWin.show());
    mainWin.on("close", (e) => {
      // 红钮 → 驻留（队长拍板项①A：对齐 Android/Windows 后台语义；托盘「退出」/菜单「退出」才真正退出）
      if (!app.isQuitting) { e.preventDefault(); mainWin.hide(); }
    });
    mainWin.webContents.on("render-process-gone", (_e, details) => {
      process.stdout.write(`[main] renderer gone: ${details.reason}; reloading\n`);
      mainWin.webContents.reload();
    });
    mainWin.loadURL(protocol.toLocalUrl(APP_START));
    if (pendingDeepLink) { const d = pendingDeepLink; pendingDeepLink = null; routeDeepLink(d); }
    return mainWin;
  }

  app.whenReady().then(() => {
    protocol.registerProtocolHandler();
    if (IS_MAC) {
      // mac 最小菜单：清空菜单会废掉 Cmd+C/V/X/A（快捷键由 Edit 菜单承载）与 Cmd+Q
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
          label: app.name || "Suveoo",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide", label: "隐藏 Suveoo" },
            { role: "hideOthers", label: "隐藏其他" },
            { type: "separator" },
            { role: "close", label: "关闭窗口" },
            { role: "quit", label: "退出 Suveoo" },
          ],
        },
        {
          label: "编辑",
          submenu: [
            { role: "cut", label: "剪切" },
            { role: "copy", label: "复制" },
            { role: "paste", label: "粘贴" },
            { role: "selectAll", label: "全选" },
          ],
        },
      ]));
    } else {
      Menu.setApplicationMenu(null);
    }
    if (!IS_MAC) app.setAppUserModelId("com.suveoo.app"); // Windows Toast 归属（mac 无此 API）

    ipcMain.handle("app:version", () => APP_VERSION);
    ipcMain.handle("app:platform", () => "macos");

    // 文件下载（/download 页安装包等）：直存系统下载目录，完成弹通知 + 可打开所在文件夹
    const { session, Notification } = require("electron");
    session.defaultSession.on("will-download", (_e, item) => {
      const safe = path.basename(item.getFilename() || "suveoo-download").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      try { item.setSavePath(path.join(app.getPath("downloads"), safe)); } catch { /* 保留默认另存对话框 */ }
      item.once("done", (_ev, state) => {
        if (state !== "completed" || !Notification.isSupported()) return;
        const toast = new Notification({ title: "Suveoo", body: `下载完成：${safe}` });
        toast.on("click", () => { try { shell.showItemInFolder(item.getSavePath()); } catch {} });
        toast.show();
      });
    });

    ipcMain.handle("external:open", (_e, url) => {
      const t = nav.classifyTarget(url);
      if (t.kind === "external") return externalBrowser.openExternalInApp(mainWin, t.url);
      return false;
    });

    // 插件路由 + 内嵌浏览器工具条 IPC + 通知点击回推（事件走 shim，前端逻辑闭环）
    registerCapacitorIpc({ emit: capEmit, getMainWindow: () => mainWin });
    externalBrowser.registerIpc();
    notify.setClickRouter((url) => {
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
      }
      capEmit("LocalNotifications", "localNotificationActionPerformed", {
        actionId: "tap",
        notification: { id: Date.now() % 2147483647, extra: url ? { url } : {} },
      });
    });
    notify.setBadgeSink((count) => {
      if (IS_MAC) {
        // mac 角标：dock 图标数字（菜单栏 Tray 不支持数字角标）
        try { if (app.dock) app.dock.setBadge(count > 0 ? String(Math.min(count, 99)) : ""); } catch {}
      } else if (trayRef && trayRef.tray) {
        trayRef.tray.setToolTip(count > 0 ? `Suveoo — ${count} 条新通知` : "Suveoo — Agentic Banking Control Plane");
      }
    });

    if (process.argv.includes("--smoke")) {
      require("./smoke").runSmoke();
      return;
    }
    const e2eArg = process.argv.find((a) => a.startsWith("--e2e="));
    if (e2eArg) {
      require("./e2e").runE2E(e2eArg.slice(6));
      return;
    }
    if (process.argv.some((a) => a.startsWith("--shot="))) {
      require("./qa-shot").runShot(process.argv);
      return;
    }

    const win = createWindow();
    // 冷启动深链：OS 经 argv 唤起本应用为第一实例时（`open`/命令行带 suveoo://）——
    // second-instance 只覆盖"已运行再唤起"，第一实例 argv 由此处兜底路由
    const coldDeep = process.argv.find((a) => a.startsWith("suveoo://"));
    if (coldDeep) routeDeepLink(coldDeep);
    trayRef = createTray(win);
    require("./credential").isAvailable().catch(() => {}); // Touch ID 可用性预热
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); // dock 图标点击
  });

  app.on("before-quit", () => { app.isQuitting = true; });
  app.on("window-all-closed", () => { /* 驻留托盘/dock，不退出 */ });
}
