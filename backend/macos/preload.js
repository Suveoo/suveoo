/**
 * Suveoo for macOS — preload（Capacitor 兼容 shim）
 * ----------------------------------------------------
 * 与 Windows 壳同源（backend/windows/preload.js）。contextBridge 不能跨隔离边界传
 * Proxy（会被结构化克隆摊平、方法全丢——第一百五十轮 E2E 实测根因），因此每个插件都
 * 必须以显式方法对象暴露。语义对齐 Android 壳插件，frontend/assets/js 零改动。
 * mac 差异仅 getPlatform()="macos"（配合前端 download 页 APK 守卫的 mac 分支）。
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
  getPlatform: () => "macos",
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
      clearCredentials: (arg) => invoke("Biometric", "clearCredentials", arg),
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
  platform: "macos",
  getVersion: () => ipcRenderer.invoke("app:version"),
  externalOpen: (url) => {
    if (typeof url !== "string") return Promise.resolve(false);
    return ipcRenderer.invoke("external:open", url).then(Boolean).catch(() => false);
  },
});
