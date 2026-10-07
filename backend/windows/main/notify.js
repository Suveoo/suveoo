/**
 * Suveoo for Windows — 通知主进程侧（Windows Toast + 托盘角标）
 * ---------------------------------------------------------------
 * 展示单一来源：渲染层 notify.js（关窗驻留托盘时渲染进程仍存活、轮询不断）经
 * LocalNotifications shim 调 schedule → 本模块发 Windows Toast（Electron Notification）。
 * 点击 Toast → 聚焦主窗口并按 extra.url 路由（对齐 Android localNotificationActionPerformed）。
 * 托盘角标：主进程用渲染层同步来的 token 低频轮询未读数，>0 时叠红点。
 */
"use strict";

const path = require("path");

const shownIds = new Set(); // cancel 用（登出清通知栏）
let maxShownId = 0;         // NativeBridge.getSyncState 基线（已弹最大 id，对齐 Android NotifyService.svc_seen）
let clickRouter = null;     // (url) => void 由 main 注入
let badgeSink = null;       // (count) => void 由 main 注入（M2：托盘 tooltip 未读数；M3 图标 overlay）

function isSupported() {
  const { Notification } = require("electron");
  return Notification.isSupported();
}

/** LocalNotifications shim → schedule({notifications:[{id,title,body,extra}]}) */
function schedule(payload) {
  const { Notification, nativeImage } = require("electron");
  const list = (payload && Array.isArray(payload.notifications)) ? payload.notifications : [];
  const results = [];
  for (const n of list) {
    const id = Number(n.id) || Date.now();
    shownIds.add(id);
    maxShownId = Math.max(maxShownId, id);
    if (!isSupported()) continue;
    const toast = new Notification({
      title: String(n.title || "Suveoo").slice(0, 120),
      body: String(n.body || "").slice(0, 240),
      silent: false,
      timeoutType: "default",
      // icon: 用默认 AUMID 应用图标（setAppUserModelId 已设），不自绘
    });
    const url = n && n.extra && n.extra.url ? String(n.extra.url) : "";
    toast.on("click", () => {
      if (typeof clickRouter === "function") clickRouter(url);
      try { toast.close(); } catch {}
    });
    toast.show();
    results.push({ id });
  }
  return { notifications: results };
}

/** LocalNotifications shim → cancel（Windows Toast 即逝；仅记账，登出语义闭环） */
function cancel(payload) {
  const list = (payload && Array.isArray(payload.notifications)) ? payload.notifications : [];
  for (const n of list) shownIds.delete(Number(n.id));
  return {};
}

function createChannel() { return {}; } // Windows 无通道概念：幂等空操作（系统设置按应用整体开关）

/** NativeBridge shim → getSyncState：返回本进程已弹通知最大 id（页面据此合并已读基准） */
function getSyncState() { return { seenId: maxShownId }; }

// ---------------------------------------------------------------- 托盘角标轮询（低频 60s；仅已同步 token 时）
const API_BASE = "https://suveoo.com";
let token = "";
let timer = null;
let lastMaxId = null;

function setToken(t) {
  token = typeof t === "string" ? t : "";
  if (token) ensurePolling(); else stopPolling();
}

function ensurePolling() {
  if (timer) return;
  timer = setInterval(pollBadge, 60_000);
  setTimeout(pollBadge, 3_000);
}

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
  lastMaxId = null;
  if (typeof badgeSink === "function") badgeSink(0);
}

async function pollBadge() {
  if (!token) return;
  try {
    const { net } = require("electron");
    const res = await net.fetch(`${API_BASE}/api/notifications?cursor=0`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return;
    const j = await res.json();
    const arr = Array.isArray(j && j.notifications) ? j.notifications : [];
    if (!arr.length) { if (typeof badgeSink === "function") badgeSink(0); return; }
    const maxId = Math.max(...arr.map((x) => Number(x && x.id) || 0));
    if (lastMaxId === null) { lastMaxId = maxId; return; } // 首轮只建基线
    const fresh = arr.filter((x) => Number(x && x.id) > lastMaxId).length;
    lastMaxId = Math.max(lastMaxId, maxId);
    if (typeof badgeSink === "function") badgeSink(fresh);
  } catch { /* 网络异常静默——角标非关键路径 */ }
}

function overlayImage() { return null; } // M3：随 .ico 资产生成红点 overlay（当前角标走 tooltip）

module.exports = {
  schedule, cancel, createChannel, isSupported, getSyncState,
  setToken, setClickRouter: (fn) => { clickRouter = fn; },
  setBadgeSink: (fn) => { badgeSink = fn; },
  overlayImage,
};
