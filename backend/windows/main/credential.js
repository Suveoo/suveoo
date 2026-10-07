/**
 * Suveoo for Windows — 凭据与 Windows Hello
 * ------------------------------------------
 * 映射 Android BiometricPlugin 四场景（前端 biometric-shell.js 零改动）：
 *   isAvailable → { strong, hasStored }   strong = Hello 可用（UserConsentVerifier）
 *   storeCredentials → Hello 验证通过后 safeStorage(DPAPI) 加密落盘
 *   quickLogin → Hello 验证通过后解密返回凭据（取消 = reject "AUTH_CANCEL"）
 *   verify → 黄卡在场校验 { ok }（取消 = { ok:false }；Hello 异常 = reject → 前端放行）
 * Hello 调用经 PowerShell WinRT 投影（UserConsentVerifier），消息经环境变量传递；
 * 结果枚举可用性：Available/DeviceNotPresent/NotConfigured/DisabledByPolicy
 *            验证：Verified/Denied/NotConfigured/DeviceNotPresent/Busy/…
 */
"use strict";

const path = require("path");
const fs = require("fs");

const PS_TEMPLATE = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
if (-not $asTaskGeneric) { Write-Output 'ERR_NO_ASTASK'; exit 1 }
if ($env:SVEOO_HELLO_MODE -eq 'check') {
  $op = [Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()
} else {
  $op = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($env:SVEOO_HELLO_MSG)
}
$task = $asTaskGeneric.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerificationResult]).Invoke($null, @($op))
$task.Wait(-1) | Out-Null
Write-Output $task.Result.ToString()
`;

let helloAvailable = null; // 缓存：true/false/null=未查

function runHello(mode, msg) {
  const { execFile } = require("child_process");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_TEMPLATE],
      { env: { ...process.env, SVEOO_HELLO_MODE: mode, SVEOO_HELLO_MSG: (msg || "Suveoo").slice(0, 60) }, timeout: 180_000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve("ERR");
        resolve(String(stdout || "").trim().split(/\r?\n/).pop());
      },
    );
  });
}

async function isHelloAvailable() {
  if (helloAvailable !== null) return helloAvailable;
  const r = await runHello("check", "");
  helloAvailable = r === "Available";
  return helloAvailable;
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
  const strong = (await isHelloAvailable()) && safeStorage.isEncryptionAvailable();
  return { strong: !!strong, hasStored: !!readStored() };
}

async function storeCredentials(creds) {
  if (!creds || !creds.email || !creds.password) throw new Error("BAD_CREDENTIALS");
  const r = await runHello("prompt", "启用 Suveoo 快捷登录");
  if (r !== "Verified") throw new Error("AUTH_CANCEL");
  writeStored(creds);
  return {};
}

async function quickLogin() {
  const stored = readStored();
  if (!stored) return null;
  const r = await runHello("prompt", "验证身份以快捷登录 Suveoo");
  if (r !== "Verified") throw new Error("AUTH_CANCEL");
  return stored;
}

async function verify() {
  if (process.env.SVEOO_E2E_BIO_OK === "1") return { ok: true }; // E2E 自动化旁路（仅测试运行器设置此环境变量）
  const ok = await isHelloAvailable();
  if (!ok) throw new Error("HELLO_NOT_AVAILABLE"); // 前端 catch → 放行（增强不是门槛）
  const r = await runHello("prompt", "确认执行本次操作");
  if (r === "Verified") return { ok: true };
  return { ok: false };
}

async function clearCredentials() {
  writeStored(null);
  return {};
}

module.exports = { isAvailable, storeCredentials, quickLogin, verify, clearCredentials, _ps: PS_TEMPLATE };
