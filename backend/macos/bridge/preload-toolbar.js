/** 外链浏览器窗口工具条 preload——仅暴露 open/close 两个动作（host 复核在主进程） */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("suveooExt", {
  open: (url) => ipcRenderer.invoke("ext:open", String(url || "").slice(0, 500)),
  close: () => ipcRenderer.invoke("ext:close"),
});
