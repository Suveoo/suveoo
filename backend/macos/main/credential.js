/**
 * Suveoo for macOS — 凭据与 Touch ID
 * ------------------------------------
 * 映射 Android BiometricPlugin 四场景（前端 biometric-shell.js 零改动）：
 *   isAvailable → { strong, hasStored }   strong = Touch ID 可用（systemPreferences）
 *   storeCredentials → Touch ID 验证通过后 safeStorage(Keychain) 加密落盘
 *   quickLogin → Touch ID 验证通过后解密返回凭据（取消 = reject "AUTH_CANCEL"）
 *   verify → 黄卡在场校验 { ok }（取消 = { ok:false }；Touch ID 异常 = reject → 前端放行）
 * 与 Windows 版差异：PowerShell WinRT UserConsentVerifier 全部换成 Electron 原生
 * systemPreferences.canPromptTouchID()/promptTouchID()（无子进程、无注入面）；
 * safeStorage 在 mac 自动走 Keychain。VM 无 Touch ID 传感器 → strong=false →
 * 前端自动回落密码/OTP（语义正确，与无 Hello 的 Windows 同口径）；真实 Mac 原生可用。
 */
"use strict";

const path = require("path");
const fs = require("fs");

let touchIdAvailable = null; // 缓存：true/false/null=未查

async function isTouchIdAvailable() {
  if (touchIdAvailable !== null) return touchIdAvailable;
  try {
    const { systemPreferences } = require("electron");
    touchIdAvailable = systemPreferences.canPromptTouchID();
  } catch { touchIdAvailable = false; }
  return touchIdAvailable;
}

/** 弹 Touch ID 系统验证；通过 true / 取消或异常 false */
async function promptTouchId(msg) {
  try {
    const { systemPreferences } = require("electron");
    await systemPreferences.promptTouchID(String(msg || "Suveoo").slice(0, 60));
    return true;
  } catch { return false; }
}

function credFile() {
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "credential.bin");
}

function readStored() {
  const { safeStorage } = require("electron");
  const f = credFile();
  if (!fs.existsSync(f)) return null;
  try {
    const buf = fs.readFileSync(f);
    const plain = safeStorage.decryptString(buf);
    const obj = JSON.parse(plain);
    if (!obj || !obj.email || !obj.password) return null;
    return obj;
  } catch { return null; }
}

function writeStored(creds) {
  const { safeStorage } = require("electron");
  const f = credFile();
  if (!creds) { try { fs.unlinkSync(f); } catch {} return; }
  const buf = safeStorage.encryptString(JSON.stringify({ email: String(creds.email || ""), password: String(creds.password || "") }));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
}

// ---------------------------------------------------------------- 插件语义（对齐 Android BiometricPlugin）
async function isAvailable() {
  const { safeStorage } = require("electron");
  const strong = (await isTouchIdAvailable()) && safeStorage.isEncryptionAvailable();
  return { strong: !!strong, hasStored: !!readStored() };
}

async function storeCredentials(creds) {
  if (!creds || !creds.email || !creds.password) throw new Error("BAD_CREDENTIALS");
  const ok = await promptTouchId("启用 Suveoo 快捷登录");
  if (!ok) throw new Error("AUTH_CANCEL");
  writeStored(creds);
  return {};
}

async function quickLogin() {
  const stored = readStored();
  if (!stored) return null;
  const ok = await promptTouchId("验证身份以快捷登录 Suveoo");
  if (!ok) throw new Error("AUTH_CANCEL");
  return stored;
}

async function verify() {
  if (process.env.SVEOO_E2E_BIO_OK === "1") return { ok: true }; // E2E 自动化旁路（仅测试运行器设置此环境变量）
  const ok = await isTouchIdAvailable();
  if (!ok) throw new Error("TOUCHID_NOT_AVAILABLE"); // 前端 catch → 放行（增强不是门槛）
  const r = await promptTouchId("确认执行本次操作");
  return { ok: r };
}

async function clearCredentials() {
  writeStored(null);
  return {};
}

module.exports = { isAvailable, storeCredentials, quickLogin, verify, clearCredentials };
