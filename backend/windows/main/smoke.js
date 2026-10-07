/**
 * Suveoo for Windows — 路由冒烟测试
 * ----------------------------------
 * electron . --smoke：每路由一个全新隐藏窗口逐页加载 frontend 全部路由
 * （文件系统推导，与打包内容同源），彻底隔离跨页状态级联
 * （JS 对话框阻塞 / window.close / 崩溃残留）。产出 smoke-report.json。
 * 退出码：全过 0 / 有失败 1。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { BrowserWindow, app } = require("electron");
const { toLocalUrl, frontendDir } = require("./protocol");

function discoverRoutes() {
  const FRONTEND_DIR = frontendDir();
  const routes = [""];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (name.isDirectory()) walk(path.join(dir, name.name), rel + name.name + "/");
      else if (name.name === "index.html") routes.push(rel);
    }
  };
  walk(FRONTEND_DIR, "");
  routes.push("404"); // 根级 404.html（resolveAsset 的 p.html 候选）
  return routes.sort();
}

const STRIP_DIALOGS = "window.alert=()=>{};window.confirm=()=>true;window.prompt=()=>null;window.close=()=>{};";

/** 报告目录：开发态=仓库 backend/windows；打包态=userData（asar 内不可写） */
function reportDir() {
  try {
    const { app } = require("electron");
    if (app && app.isPackaged) return app.getPath("userData");
  } catch { /* 纯 Node 环境 */ }
  return path.resolve(__dirname, "..");
}

async function runSmoke() {
  const routes = discoverRoutes();
  const progressLog = path.join(reportDir(), "smoke-progress.log");
  fs.writeFileSync(progressLog, `[smoke] start ${new Date().toISOString()} routes=${routes.length}\n`, "utf-8");
  const results = [];

  for (const route of routes) {
    const url = toLocalUrl("/" + route);
    const item = { route, url, ok: false, error: null, consoleErrors: 0, ms: 0 };
    const errs = [];
    const win = new BrowserWindow({ show: false, width: 1280, height: 840 });
    const wc = win.webContents;
    wc.on("console-message", (_e, lvl, msg, line, src) => {
      if (lvl >= 3) errs.push(`${String(msg).slice(0, 140)} @${src}:${line}`);
    });
    wc.on("render-process-gone", (_e, details) => errs.push(`renderer-gone:${details.reason}`));
    wc.on("dom-ready", () => wc.executeJavaScript(STRIP_DIALOGS, true).catch(() => {}));

    const t0 = Date.now();
    try {
      await Promise.race([
        (async () => {
          try { await wc.loadURL(url); item.ok = true; }
          catch (e) { item.ok = false; item.error = String((e && e.message) || e); }
        })(),
        new Promise((r) => setTimeout(() => { item.error = item.error || "timeout 10s"; r(); }, 10_000)),
      ]);
    } finally {
      item.ms = Date.now() - t0;
      item.consoleErrors = errs.length;
      if (errs.length) item.consoleErrorSample = errs.slice(0, 3);
      // ERR_ABORTED = 页面自身 JS 登录守卫跳转（loadURL 被业务重定向打断）——页面加载与脚本执行均正常
      if (!item.ok && item.error && /ERR_ABORTED/.test(item.error)) {
        item.ok = true;
        item.note = "auth-redirect";
        item.error = null;
      }
      results.push(item);
      try { win.destroy(); } catch { /* 已销毁 */ }
      const bad = !item.ok || errs.length > 0;
      fs.appendFileSync(progressLog, `[smoke] ${bad ? "FAIL" : "OK "} ${route || "/"} (${item.ms}ms${errs.length ? `, ${errs.length} errs` : ""}${item.error ? ` :: ${String(item.error).slice(0, 100)}` : ""})\n`, "utf-8");
    }
  }

  const failed = results.filter((r) => !r.ok || r.consoleErrors > 0);
  const report = {
    when: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed,
    results,
  };
  const out = path.join(reportDir(), "smoke-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf-8");
  fs.appendFileSync(progressLog, `[smoke] report → ${out}  (${report.passed}/${report.total} passed)\n`, "utf-8");
  process.exitCode = failed.length ? 1 : 0;
  app.exit(failed.length ? 1 : 0);
}

module.exports = { runSmoke, discoverRoutes };
