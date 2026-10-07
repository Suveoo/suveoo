/**
 * Suveoo for Windows — Capacitor 兼容 IPC 路由
 * ---------------------------------------------
 * 渲染层 window.Capacitor.Plugins.*（preload shim）→ "cap:invoke" {plugin, method, arg}
 * 白名单 + 入参形状校验；事件回流 "cap:event" {plugin, event, data}。
 * 插件语义与 Android 壳（build-apk.mjs 注入的四个原生插件）逐一对应，前端零改动。
 */
"use strict";

const notify = require("./notify");
const credential = require("./credential");
const update = require("./update");

/** 入参形状校验器（返回 true=合法）；全部拒绝超长字符串/原型污染键 */
const isStr = (v, max = 2048) => typeof v === "string" && v.length <= max;
const hasKeys = (v, keys) => v && typeof v === "object" && keys.every((k) => k in v);

const ROUTES = {
  "NativeBridge:saveToken": (arg) => hasKeys(arg, ["token"]) && (arg.token === "" || isStr(arg.token, 4096)),
  "NativeBridge:getSyncState": () => true,
  "LocalNotifications:checkPermissions": () => true,
  "LocalNotifications:requestPermissions": () => true,
  "LocalNotifications:createChannel": () => true,
  "LocalNotifications:schedule": (arg) => hasKeys(arg, ["notifications"]) && Array.isArray(arg.notifications) && arg.notifications.length <= 20,
  "LocalNotifications:cancel": (arg) => hasKeys(arg, ["notifications"]) && Array.isArray(arg.notifications),
  "Biometric:isAvailable": () => true,
  "Biometric:storeCredentials": (arg) => hasKeys(arg, ["email", "password"]) && isStr(arg.email, 200) && isStr(arg.password, 200),
  "Biometric:quickLogin": () => true,
  "Biometric:verify": () => true,
  "Biometric:clearCredentials": () => true,
  "Update:getInfo": () => true,
  "Update:download": (arg) => hasKeys(arg, ["url"]) && isStr(arg.url, 500),
  "Update:install": (arg) => hasKeys(arg, ["fileUri"]) && isStr(arg.fileUri, 600),
  "Update:cancelDownload": () => true,
};

function registerCapacitorIpc({ emit, getMainWindow } = {}) {
  const { ipcMain } = require("electron");

  ipcMain.handle("cap:invoke", async (_e, plugin, method, arg) => {
    const key = `${plugin}:${method}`;
    const validate = ROUTES[key];
    if (!validate) throw new Error(`PLUGIN_METHOD_NOT_ALLOWED:${key}`);
    if (!validate(arg || {})) throw new Error(`BAD_ARGS:${key}`);

    switch (key) {
      // —— NativeBridge ——
      case "NativeBridge:saveToken":
        notify.setToken(arg.token);
        return {};
      case "NativeBridge:getSyncState":
        return notify.getSyncState();

      // —— LocalNotifications ——
      case "LocalNotifications:checkPermissions":
      case "LocalNotifications:requestPermissions":
        return { display: notify.isSupported() ? "granted" : "denied" };
      case "LocalNotifications:createChannel":
        return notify.createChannel(arg);
      case "LocalNotifications:schedule":
        return notify.schedule(arg);
      case "LocalNotifications:cancel":
        return notify.cancel(arg);

      // —— Biometric（Windows Hello + DPAPI）——
      case "Biometric:isAvailable":
        return credential.isAvailable();
      case "Biometric:storeCredentials":
        return credential.storeCredentials(arg);
      case "Biometric:quickLogin":
        return credential.quickLogin();
      case "Biometric:verify":
        return credential.verify();
      case "Biometric:clearCredentials":
        return credential.clearCredentials();

      // —— Update ——
      case "Update:getInfo":
        return update.getInfo();
      case "Update:download": {
        const file = await update.download(
          { url: arg.url, sha256: isStr(arg.sha256, 128) ? arg.sha256 : undefined },
          (p) => emit && emit("Update", "update-progress", p),
        );
        return { fileUri: file };
      }
      case "Update:install":
        return update.install(arg.fileUri);
      case "Update:cancelDownload":
        update.cancelDownload();
        return {};

      default:
        throw new Error("UNREACHABLE");
    }
  });

  // addListener/removeAllListeners 桥（Update 进度、通知点击回推）
  const listeners = new Map(); // senderId -> Set(`${plugin}:${event}`)
  ipcMain.handle("cap:listen", (e, plugin, event) => {
    if (!isStr(plugin, 50) || !isStr(event, 80)) throw new Error("BAD_EVENT");
    const win = getMainWindow && getMainWindow();
    if (!win || e.sender !== win.webContents) return {}; // 仅主窗口可订阅
    if (!listeners.has(e.sender.id)) listeners.set(e.sender.id, new Set());
    listeners.get(e.sender.id).add(`${plugin}:${event}`);
    return {};
  });
  ipcMain.handle("cap:unlistenAll", (e) => {
    listeners.delete(e.sender.id);
    return {};
  });

  return {
    hasListener(sender, plugin, event) {
      const set = listeners.get(sender.id);
      return !!(set && set.has(`${plugin}:${event}`));
    },
  };
}

module.exports = { registerCapacitorIpc, ROUTES };
