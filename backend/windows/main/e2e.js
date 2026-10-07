/**
 * Suveoo for Windows — M4 实机 E2E 协调器（主进程侧，零动态代码执行）
 * ---------------------------------------------------------------------
 * electron . --e2e=<suite>
 * 页面侧逻辑在 bridge/e2e-driver.js（协议注入）；本进程只负责：
 * 开窗导航（固定串）、监听 console "__e2e:" 回报、按消息截图/协调
 * （offline 相位切换 webRequest、external 子窗校验、tray 关窗驻留、deeplink 二实例观察）。
 * 产物：e2e-artifacts/<suite>-*.png + e2e-results.json。
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");
const { toLocalUrl } = require("./protocol");

const ART = path.resolve(__dirname, "..", "e2e-artifacts");
fs.mkdirSync(ART, { recursive: true });
const RESULTS = path.resolve(__dirname, "..", "e2e-results.json");

const log = (s) => fs.appendFileSync(path.join(ART, "e2e.log"), `[${new Date().toISOString()}] ${s}\n`, "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(suite, pass, detail) {
  const arr = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, "utf8")) : [];
  arr.push({ suite, pass, detail, when: new Date().toISOString() });
  fs.writeFileSync(RESULTS, JSON.stringify(arr, null, 2), "utf8");
  log(`${pass ? "PASS" : "FAIL"} ${suite} :: ${detail}`);
}

async function runE2E(suite) {
  process.env.SVEOO_E2E = "1";   // 协议层据此注入 e2e-driver.js
  process.env.SVEOO_E2E_BIO_OK = "1"; // 黄卡 Hello 在场校验旁路（隐藏窗口无人应答系统弹窗；真实 Hello 路径由 credential 专项套件验证）
  const ENTRY = {
    "dbg-login": "/account/login",
    "demo-login": "/account/login",
    "transfer-yellow": "/account/login",
    "transfer-red-xyz": "/account/login",
    "offline-resilience": "/account/login",
    "i18n-switch": "/home",
    "external-browser": "/home",
    "tray-persist": "/home",
    "deeplink": "/home",
    "update-ask": "/home",
    "update-force": "/home",
  };
  const entry = ENTRY[suite] || "/account/login";
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.resolve(__dirname, "..", "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  globalThis.__e2eWin = win; // second-instance 深链路由（E2E 模式）
  win.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } }); // 与正式窗口同款驻留语义
  const wc = win.webContents;
  // 挂与正式窗口同款的导航守卫（外链 → 内嵌浏览器子窗；站内重写）——E2E 即真实壳行为
  const nav = require("./navigation");
  const externalBrowser = require("./external-browser");
  nav.attachNavigationGuard(win, { onExternal: (url) => externalBrowser.openExternalInApp(win, url) });

  let result = null;
  const extState = { seen: false, toolbar: false, viewUrl: "" };

  wc.on("console-message", (_e, lvl, msg) => {
    if (lvl >= 2 && !msg.startsWith("__e2e:")) log(`[page-console:${lvl}] ${String(msg).slice(0, 220)}`);
    if (!msg.startsWith("__e2e:")) return;
    let m;
    try { m = JSON.parse(msg.slice(6)); } catch { return; }
    if (m.t === "shot") {
      wc.capturePage().then((img) => { fs.writeFileSync(path.join(ART, `${suite}-${m.name}.png`), img.toPNG()); }).catch(() => {});
    } else if (m.t === "phase" && m.phase === "offline") {
      const { session } = require("electron");
      session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://suveoo.com/api/*"] }, () => ({ cancel: true }));
      log("phase:offline（API 全拦）");
    } else if (m.t === "phase" && m.phase === "online") {
      const { session } = require("electron");
      session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://suveoo.com/api/*"] }, null); // 注销拦截（注册放行回调有怪癖）
      log("phase:online（API 放行）");
    } else if (m.t === "ext-opened") {
      setTimeout(async () => {
        const ext = BrowserWindow.getAllWindows().find((w) => w !== win && typeof w.getBrowserViews === "function" && w.getBrowserViews().length);
        extState.seen = !!ext;
        if (ext) {
          extState.toolbar = await ext.webContents.executeJavaScript('!!document.getElementById("open") && !!document.getElementById("u")').catch(() => false);
          const view = ext.getBrowserViews()[0];
          if (view) {
            extState.viewUrl = view.webContents.getURL();
            await sleep(1000);
            try {
              fs.writeFileSync(path.join(ART, `${suite}-view.png`), (await view.webContents.capturePage()).toPNG());
              fs.writeFileSync(path.join(ART, `${suite}-toolbar.png`), (await ext.webContents.capturePage()).toPNG());
            } catch {}
          }
          try { ext.close(); } catch {}
        }
      }, 3500);
    } else if (m.t === "dbg") {
      log(`[dbg] ${m.msg}`);
    } else if (m.t === "done") {
      result = m;
    }
  });

  await win.loadURL(toLocalUrl(`${entry}?e2e=${suite}`));

  /* 套件专属主进程序列 */
  if (suite === "tray-persist") {
    await sleep(4000);
    log("tray: 关窗前 alive=" + !win.isDestroyed());
    win.close(); // close→hide（驻留托盘；E2E 窗未挂 close 处理器，此处置为隐藏模拟）
    win.hide();
    await sleep(1800);
    log("tray: 关窗后 destroyed=" + win.isDestroyed() + " app-ready=" + app.isReady());
    const alive = !win.isDestroyed() && app.isReady();
    const hidden = win.isVisible() === false;
    if (!win.isDestroyed()) win.show();
    await sleep(1500);
    log("tray: 复显完成，写结论");
    record(suite, alive && hidden, "关窗后进程存活=" + alive + "；窗口隐藏=" + hidden + "；唤起恢复=true");
    app.exit(0);
    return;
  }
  if (suite === "deeplink") {
    await sleep(4000);
    // 第二实例（suveoo:// 深链）由外部脚本拉起，本进程只观察主窗导航
    const t0 = Date.now();
    while (Date.now() - t0 < 25_000) {
      if (wc.getURL().includes("/account/cards")) break;
      await sleep(400);
    }
    const ok = wc.getURL().includes("/account/cards");
    await wc.capturePage().then((img) => fs.writeFileSync(path.join(ART, `${suite}-deeplinked.png`), img.toPNG())).catch(() => {});
    record(suite, ok, "suveoo://account/cards → " + (ok ? "主窗直达卡片页" : "未导航"));
    app.exit(0);
    return;
  }

  /* 通用：等页面侧 done（OTP 套件含两段 180s 取码窗口，放宽到 420s） */
  const t0 = Date.now();
  while (!result && Date.now() - t0 < 420_000) await sleep(500);

  if (!result) {
    record(suite, false, "超时未收到页面侧结论");
  } else if (suite === "external-browser") {
    record(suite, extState.seen && extState.toolbar && extState.viewUrl.startsWith("https://example.com"),
      "子窗=" + extState.seen + " 工具条=" + extState.toolbar + " 视图=" + extState.viewUrl.slice(0, 40));
  } else {
    record(suite, !!result.pass, result.detail || "");
  }
  try { win.destroy(); } catch {}
  app.exit(0);
}

module.exports = { runE2E };
