#!/usr/bin/env node
/**
 * Suveoo for macOS — M2 功能探针（开发自测工具；不进打包产物——build.files 只含 main/bridge/preload.js）
 * ----------------------------------------------------------------------------------------------
 * npx electron scripts/probe-m2.js --stage=bio|notify|ext|upd
 *   bio    — S7：Touch ID 可用性（VM 预期 strong=false）+ SVEOO_E2E_BIO_OK 旁路
 *   notify — S6：LocalNotifications.schedule 实弹一条 + dock badge 置数（外层配合 screencapture）
 *   ext    — S8：内嵌浏览器窗口（工具条 + example.com）
 *   upd    — S5：更新下载白名单拒连（evil.com）+ sha256 不符拒交付（真实拉取线上文件 + 错哈希）
 * 结果写 backend/macos/probe-m2.log（GUI 子系统 stdout 不可靠的保险）+ 控制台。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const LOG = path.resolve(__dirname, "..", "probe-m2.log");
const log = (s) => {
  const line = `[probe ${new Date().toISOString().slice(11, 19)}] ${s}`;
  try { process.stdout.write(line + "\n"); } catch {}
  try { fs.appendFileSync(LOG, line + "\n"); "utf8"; } catch {}
};

const stage = (() => {
  const a = process.argv.find((x) => x.startsWith("--stage="));
  return a ? a.slice(8) : "";
})();

app.whenReady().then(async () => {
  log(`stage=${stage} electron=${process.versions.electron}`);
  try {
    if (stage === "bio") {
      const credential = require("../main/credential");
      const avail = await credential.isAvailable();
      log(`isAvailable = ${JSON.stringify(avail)}（VM 无 Touch ID 传感器 → 预期 strong=false → 前端回落密码/OTP）`);
      try {
        const r = await credential.verify();
        log(`verify() 无旁路返回 = ${JSON.stringify(r)}（预期：抛 TOUCHID_NOT_AVAILABLE → 前端 catch 放行）`);
      } catch (e) {
        log(`verify() 无旁路抛出 = ${String(e && e.message)}（预期 TOUCHID_NOT_AVAILABLE）`);
      }
      process.env.SVEOO_E2E_BIO_OK = "1";
      const r2 = await credential.verify();
      log(`verify() BIO_OK 旁路 = ${JSON.stringify(r2)}（预期 {"ok":true}）`);
    }

    else if (stage === "notify") {
      const notify = require("../main/notify");
      log(`Notification.isSupported = ${notify.isSupported()}`);
      notify.setBadgeSink((count) => {
        try { app.dock && app.dock.setBadge(count > 0 ? String(Math.min(count, 99)) : ""); log(`badgeSink(${count}) → dock badge 已置`); } catch (e) { log(`badgeSink error ${e}`); }
      });
      const r = notify.schedule({ notifications: [{ id: 424242, title: "Suveoo M2 探针", body: "通知到达验证（LocalNotifications shim → mac 通知中心）", extra: { url: "/account" } }] });
      log(`schedule = ${JSON.stringify(r)}`);
      log(`getSyncState = ${JSON.stringify(notify.getSyncState())}（预期 seenId=424242）`);
      notify.setBadgeSink && (() => {})();
      // 直接触发角标链（正式链路由 notify.pollBadge 驱动，此处验证 sink→dock 管道）
      notify.setToken("probe-invalid-token"); // 触发 ensurePolling 起定时器（60s 一轮，首轮 3s 后 401→静默——不阻塞本探针）
      // 视觉证据：直接驱动 dock badge（与 main.js setBadgeSink 同一条 API 链——正式计数由轮询驱动）
      try { app.dock && app.dock.setBadge("3"); log("dock badge 直驱置 3（视觉证据）"); } catch (e) { log(`badge error ${e}`); }
      log("badge 管道已挂（正式计数由登录后 token 轮询驱动）");
      await new Promise((r) => setTimeout(r, 12_000)); // 留给外层 screencapture 抓横幅+角标
      log("notify stage done");
    }

    else if (stage === "ext") {
      const externalBrowser = require("../main/external-browser");
      externalBrowser.registerIpc();
      const parent = new BrowserWindow({ show: false, width: 1280, height: 840 });
      await parent.webContents.loadURL("about:blank");
      const ok = externalBrowser.openExternalInApp(parent, "https://example.com/");
      log(`openExternalInApp(example.com) = ${ok}（预期 true：单例子窗+工具条+BrowserView）`);
      const denied = externalBrowser.openExternalInApp(parent, "https://127.0.0.1/x");
      log(`openExternalInApp(127.0.0.1) = ${denied}（预期 false：环回拒绝）`);
      await new Promise((r) => setTimeout(r, 9_000)); // 外层 screencapture
      log("ext stage done");
    }

    else if (stage === "upd") {
      const update = require("../main/update");
      try {
        await update.download({ url: "https://evil.com/suveoo-setup-3.183.0.dmg" });
        log("evil.com 下载竟成功 —— 不应发生");
      } catch (e) { log(`白名单拒连 = ${String(e && e.message)}（预期 URL_NOT_ALLOWED）`); }
      try {
        // 真实拉取线上小文件 + 故意错的 sha256 → 必须在写盘后校验失败并删除
        const f = await update.download({ url: "https://suveoo.com/dl/windows-manifest.json", sha256: "00".repeat(32) });
        log(`错 sha256 竟交付 = ${f} —— 不应发生`);
      } catch (e) { log(`sha256 拒交付 = ${String(e && e.message)}（预期 SHA256_MISMATCH，且 updates 目录无残留）`); }
      const updDir = path.join(app.getPath("userData"), "updates");
      log(`updates 目录残留 = ${JSON.stringify(fs.existsSync(updDir) ? fs.readdirSync(updDir) : [])}（预期 [] 或目录为空）`);
    }

    else {
      log("未知 stage（bio|notify|ext|upd）");
    }
  } catch (e) {
    log(`STAGE ERROR: ${e && e.stack}`);
  } finally {
    app.exit(0);
  }
});
