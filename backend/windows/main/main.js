/**
 * Suveoo for Windows — 主进程入口
 * --------------------------------
 * M1：自定义协议加载 frontend 快照 / 导航守卫 / 托盘驻留 / 单实例 / --smoke
 * M2：Capacitor 兼容插件（通知 Toast/三级更新/Windows Hello/内嵌浏览器）/ AUMID / 角标
 * 版本策略：versionName 对齐 changelog 版本流（3.181.0 起），未来 GitHub 多端同 tag 发布。
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

const APP_START = "/home/index.html"; // 与 Android capacitor.config.json appStartPath 一致
const APP_VERSION = app.getVersion ? app.getVersion() : require("../package.json").version;
const faviconDir = () => path.join(protocol.frontendDir(), "favicon");
/* 应用图标（ico 多尺寸）：打包态=resources/icon.ico（extraResources），开发态=build/icon.ico */
const APP_ICON = path.join(process.resourcesPath || path.join(__dirname, ".."), "icon.ico");

if (process.argv.includes("--smoke")) process.env.SVEOO_SMOKE = "1"; // 冒烟跳过壳注入口（解耦线上 manifest）

/* 第一百六十轮终六：AUMID 必须尽早设置（模块顶层、ready 前）——Windows 用它归属 Toast/任务栏；
 * 配合安装器写入的 AppUserModelId 注册表项（DisplayName/IconUri）通知中心才能显示 Suveoo 而非 Electron */
if (process.platform === "win32") app.setAppUserModelId("com.suveoo.app");

// 安全协议注册（必须在 app ready 之前）
protocol.registerSchemesAsPrivileged();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 本机实测：混合显卡（Intel iGPU + 独显）下 Chromium GPU 进程偶发 SIGSEGV——
  // 银行界面以 DOM/SVG 为主无需硬件加速，默认禁 GPU；显式 --enable-gpu 可恢复
  if (!process.argv.includes("--enable-gpu")) {
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
  }

  app.on("second-instance", (_e, argv) => {
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

  // —— 深链诊断日志（GUI 子系统无 stdout，一律文件日志；镜像 mac 壳同名机制）——
  const deeplinkLog = (s) => {
    try {
      const fs = require("fs");
      const { app: a } = require("electron");
      fs.appendFileSync(require("path").join(a.getPath("userData"), "deeplink.log"), `[${new Date().toISOString()}] ${s}\n`);
    } catch { /* 日志失败不影响主流程 */ }
  };

  function routeDeepLink(deep) {
    if (typeof deep !== "string" || !deep.startsWith("suveoo://")) return;
    deeplinkLog(`route ${deep} win=${!!(mainWin && !mainWin.isDestroyed())}`);
    const t = nav.classifyTarget(deep);
    if (t.kind === "internal" && mainWin && !mainWin.isDestroyed()) mainWin.webContents.loadURL(t.url);
  }

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
      icon: nativeImage.createFromPath(require("fs").existsSync(APP_ICON) ? APP_ICON : path.join(faviconDir(), "favicon-128x128.png")), /* ico 优先（多尺寸，任务栏/通知更清晰）；打包态 resources/icon.ico */
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
      // 关闭 → 驻留托盘（对齐 Android 后台语义；托盘「退出」才真正退出）
      if (!app.isQuitting) { e.preventDefault(); mainWin.hide(); }
    });
    mainWin.webContents.on("render-process-gone", (_e, details) => {
      process.stdout.write(`[main] renderer gone: ${details.reason}; reloading\n`);
      mainWin.webContents.reload();
    });
    mainWin.loadURL(protocol.toLocalUrl(APP_START));
    return mainWin;
  }

  app.whenReady().then(() => {
    protocol.registerProtocolHandler();
    Menu.setApplicationMenu(null); // 无原生菜单栏（autoHideMenuBar + 空 Menu，Alt 不弹）

    ipcMain.handle("app:version", () => APP_VERSION);
    ipcMain.handle("app:platform", () => "windows");

    // 文件下载（/download 页安装包等）：直存系统下载目录，完成弹 Toast + 可打开所在文件夹
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

    // M2：插件路由 + 内嵌浏览器工具条 IPC + 通知点击回推（事件走 shim，前端逻辑闭环）
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
      if (trayRef && trayRef.tray) {
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
    trayRef = createTray(win);
    require("./credential").isAvailable().catch(() => {}); // Hello 可用性预热（首次 PS 探测数秒，提前到启动期）
    // 冷启动深链：注册表协议唤起本应用为第一实例时（suveoo:// 落在启动 argv）——
    // second-instance 只覆盖"已运行再唤起"，第一实例 argv 由此处兜底路由（mac 壳同款）
    const coldDeep = process.argv.find((a) => a.startsWith("suveoo://"));
    if (coldDeep) routeDeepLink(coldDeep);
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("before-quit", () => { app.isQuitting = true; });
  app.on("window-all-closed", () => { /* 驻留托盘，不退出 */ });
}
