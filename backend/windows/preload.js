/**
 * Suveoo for Windows — preload（Capacitor 兼容 shim）
 * ----------------------------------------------------
 * contextBridge 不能跨隔离边界传 Proxy（会被结构化克隆摊平、方法全丢——
 * 第一百五十轮 E2E 实测抓到的根因），因此每个插件都必须以显式方法对象暴露。
 * 语义对齐 Android 壳插件，frontend/assets/js 零改动。
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (plugin, method, arg) => ipcRenderer.invoke("cap:invoke", plugin, method, arg ?? {});

/** addListener（Update 进度 / 通知点击）：订阅 + "cap:event" 回推过滤 */
function makeAddListener(plugin) {
  return (event, cb) => {
    if (typeof cb !== "function") return { remove: () => {} };
    ipcRenderer.invoke("cap:listen", plugin, String(event)).catch(() => {});
    const handler = (_e, payload) => {
      if (payload && payload.plugin === plugin && payload.event === event) {
        try { cb(payload.data); } catch { /* 回调异常不扰动事件流 */ }
      }
    };
    ipcRenderer.on("cap:event", handler);
    return { remove: () => ipcRenderer.removeListener("cap:event", handler) };
  };
}
const removeAllListeners = () => { ipcRenderer.invoke("cap:unlistenAll").catch(() => {}); };

contextBridge.exposeInMainWorld("Capacitor", {
  isNativePlatform: () => true,
  getPlatform: () => "windows",
  Plugins: {
    NativeBridge: {
      saveToken: (arg) => invoke("NativeBridge", "saveToken", arg),
      getSyncState: () => invoke("NativeBridge", "getSyncState"),
    },
    LocalNotifications: {
      checkPermissions: () => invoke("LocalNotifications", "checkPermissions"),
      requestPermissions: () => invoke("LocalNotifications", "requestPermissions"),
      createChannel: (arg) => invoke("LocalNotifications", "createChannel", arg),
      schedule: (arg) => invoke("LocalNotifications", "schedule", arg),
      cancel: (arg) => invoke("LocalNotifications", "cancel", arg),
      addListener: makeAddListener("LocalNotifications"),
      removeAllListeners,
    },
    Biometric: {
      isAvailable: () => invoke("Biometric", "isAvailable"),
      storeCredentials: (arg) => invoke("Biometric", "storeCredentials", arg),
      quickLogin: () => invoke("Biometric", "quickLogin"),
      verify: () => invoke("Biometric", "verify"),
      clearCredentials: () => invoke("Biometric", "clearCredentials"),
    },
    Update: {
      getInfo: () => invoke("Update", "getInfo"),
      download: (arg) => invoke("Update", "download", arg),
      install: (arg) => invoke("Update", "install", arg),
      cancelDownload: () => invoke("Update", "cancelDownload"),
      addListener: makeAddListener("Update"),
      removeAllListeners,
    },
  },
});

contextBridge.exposeInMainWorld("suveooBridge", {
  platform: "windows",
  getVersion: () => ipcRenderer.invoke("app:version"),
  externalOpen: (url) => {
    if (typeof url !== "string") return Promise.resolve(false);
    return ipcRenderer.invoke("external:open", url).then(Boolean).catch(() => false);
  },
});
