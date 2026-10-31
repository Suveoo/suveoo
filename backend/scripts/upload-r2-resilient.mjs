#!/usr/bin/env node
/**
 * upload-r2-resilient.mjs — R2 上传（网络抖动监控 + 自动重试 + 上传后校验）
 * ============================================================================
 * 背景：跨境链路（GFW/隧道）对 >30MB 上传常出现长时间停滞或 fetch failed；
 *       wrangler 自身的重试不可观测。本脚本把「网络指标 + 进程状态 + 上传后校验」
 *       合成一次判定：停滞/超时/校验失败 → 杀掉进程重试；3 次失败 → 输出人工上传指引。
 *
 * 用法：
 *   node scripts/upload-r2-resilient.mjs plan.json          # 按计划顺序上传（建议先大件后 manifest）
 *   node scripts/upload-r2-resilient.mjs --file <path> --key dl/x.ext [--content-type ...]
 *
 * plan.json 元素：
 *   { "file": "绝对或相对路径", "key": "dl/xxx.apk", "contentType": "application/vnd.android.package-archive", "publicUrl": "https://suveoo.com/dl/xxx.apk" }
 *
 * 判定口径：
 *   - 成功 = wrangler 退出码 0 且上传后校验通过（二进制比 ETag=MD5；JSON 比字节 sha256）
 *   - 停滞 = 连续 STALL_SECONDS 网卡发送量增长 < 128KB（默认 90s）
 *   - 超时 = 单次尝试超过 timeout（大文件默认 1800s）
 *   - 重试上限 3 次；仍失败则逐项打印「R2 桶 / 对象键 / 本地文件 / 大小 / MD5」供控制台拖拽上传
 *
 * 铁律：上传必须带 --remote（脚本已内置）。
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, appendFileSync, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const BACKEND = path.resolve(HERE, "..");
const BUCKET = "suveoo-bank-r2";
const MAX_ATTEMPTS = Number(process.env.UPLOAD_MAX_ATTEMPTS || 3);
const STALL_SECONDS = Number(process.env.UPLOAD_STALL_SECONDS || 90);
const SAMPLE_MS = 5000;
const LOG_DIR = path.join(BACKEND, "..", "for_developer", "upload-logs");
mkdirSync(LOG_DIR, { recursive: true });
const LOG = path.join(LOG_DIR, `upload-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); appendFileSync(LOG, line + "\n"); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const md5 = (f) => createHash("md5").update(readFileSync(f)).digest("hex");

function parsePlan() {
  const args = process.argv.slice(2);
  const fi = args.indexOf("--file");
  if (fi >= 0) {
    const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    return [{ file: get("--file"), key: get("--key"), contentType: get("--content-type") || null, publicUrl: get("--public-url") || null }];
  }
  const planPath = path.resolve(args.find((a) => !a.startsWith("--")) || "");
  return JSON.parse(readFileSync(planPath, "utf8"));
}

/** Windows 网卡累计字节（所有 Up 适配器求和）；失败返回 null */
function netCounters() {
  if (process.platform !== "win32") return null;
  const ps = "Get-NetAdapterStatistics | ForEach-Object { $_.SentBytes.ToString() + '|' + $_.ReceivedBytes.ToString() }";
  const r = spawnSyncPowerShell(ps);
  if (!r) return null;
  let sent = 0, recv = 0;
  for (const line of r.split(/\r?\n/)) {
    const m = /^(\d+)\|(\d+)$/.exec(line.trim());
    if (m) { sent += Number(m[1]); recv += Number(m[2]); }
  }
  return { sent, recv };
}
function spawnSyncPowerShell(cmd) {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", timeout: 15000 });
  return r.status === 0 ? r.stdout : null;
}
// ESM 下 require 不可用——用动态 import 缓存
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

function tcpLatency(host = "suveoo.com", port = 443, timeout = 3500) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    const done = (v) => { try { s.destroy(); } catch { /* noop */ } resolve(v); };
    s.setTimeout(timeout);
    s.once("connect", () => done(Date.now() - t0));
    s.once("timeout", () => done(null));
    s.once("error", () => done(null));
  });
}

function killTree(pid) {
  if (!pid) return;
  const { spawnSync } = require("node:child_process");
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* noop */ } } }
}

async function verify(item, localSha, localMd5) {
  if (!item.publicUrl) { log("  校验跳过（未提供 publicUrl）"); return true; }
  const url = item.publicUrl + (item.publicUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();
  if (/\.json($|\?)/.test(item.key)) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) { log(`  校验失败：GET ${url} → ${r.status}`); return false; }
    const buf = Buffer.from(await r.arrayBuffer());
    const got = createHash("sha256").update(buf).digest("hex");
    const ok = got === localSha;
    log(`  校验 JSON sha256 ${ok ? "OK" : "MISMATCH"}（local ${localSha.slice(0, 12)}… / remote ${got.slice(0, 12)}…）`);
    return ok;
  }
  const r = await fetch(url, { method: "HEAD", cache: "no-store" });
  if (!r.ok) { log(`  校验失败：HEAD ${url} → ${r.status}`); return false; }
  const etag = (r.headers.get("etag") || "").replace(/"/g, "").toLowerCase();
  const ct = r.headers.get("content-type") || "";
  const etagOk = etag === localMd5.toLowerCase();
  const ctOk = !item.contentType || ct.split(";")[0].trim() === item.contentType;
  log(`  校验 ETag ${etagOk ? "OK" : "MISMATCH"}（local md5 ${localMd5.slice(0, 12)}… / etag ${etag.slice(0, 12)}…）content-type ${ctOk ? "OK" : "MISMATCH"}（${ct || "空"}）`);
  return etagOk && ctOk;
}

async function uploadOnce(item, sizeBytes, attempt, timeoutMs) {
  log(`  尝试 ${attempt}/${MAX_ATTEMPTS}：${item.key}（${mb(sizeBytes)}）`);
  const base = netCounters();
  const t0 = Date.now();
  const args = ["wrangler", "r2", "object", "put", `${BUCKET}/${item.key}`, "--remote", "--file", item.file];
  if (item.contentType) args.push("--content-type", item.contentType);
  const child = spawn("npx", args, { cwd: BACKEND, shell: process.platform === "win32", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => { output += d.toString(); });
  child.stderr.on("data", (d) => { output += d.toString(); });
  let exited = null;
  child.on("exit", (code) => { exited = code; });

  let lastSent = base?.sent ?? null, lastGrowthAt = Date.now(), samples = 0, lastLog = 0;
  while (exited === null) {
    await sleep(SAMPLE_MS);
    if (exited !== null) break;
    const now = Date.now();
    const cur = netCounters();
    if (cur && lastSent != null) {
      const delta = cur.sent - lastSent;
      if (delta > 128 * 1024) lastGrowthAt = now;
      lastSent = cur.sent;
      samples++;
      if (now - lastLog >= 15000 || samples === 1) {
        lastLog = now;
        const lat = await tcpLatency();
        log(`    网络：发送 +${(delta / 1048576).toFixed(2)} MB/${(SAMPLE_MS / 1000).toFixed(0)}s，累计 ${((cur.sent - (base?.sent ?? cur.sent)) / 1048576).toFixed(1)} MB，延迟 ${lat == null ? "超时" : lat + "ms"}，已用 ${((now - t0) / 1000).toFixed(0)}s`);
      }
      if (now - lastGrowthAt > STALL_SECONDS * 1000) {
        log(`  判定停滞：${STALL_SECONDS}s 内网卡发送增长 < 128KB → kill 重试`);
        killTree(child.pid);
        await sleep(1500);
        return { ok: false, reason: "stalled", output };
      }
    }
    if (now - t0 > timeoutMs) {
      log(`  判定超时：单次尝试超过 ${Math.round(timeoutMs / 1000)}s → kill 重试`);
      killTree(child.pid);
      await sleep(1500);
      return { ok: false, reason: "timeout", output };
    }
  }
  if (exited !== 0) {
    log(`  wrangler 退出码 ${exited}`);
    log("  ---- wrangler 输出（末 12 行）----");
    output.trim().split(/\r?\n/).slice(-12).forEach((l) => log("  " + l));
    return { ok: false, reason: `exit ${exited}`, output };
  }
  return { ok: true, output };
}

async function main() {
  const plan = parsePlan();
  if (!plan.length || plan.some((i) => !i.file || !i.key)) throw new Error("计划为空或缺少 file/key");
  log(`R2 上传计划：${plan.length} 项 → ${BUCKET}/；日志 ${LOG}`);
  const failed = [];
  for (const item of plan) {
    const size = statSync(item.file).size;
    const itemSha = sha256(item.file);
    const itemMd5 = md5(item.file);
    log(`\n=== ${item.key} ===\n  本地 ${item.file}｜${mb(size)}｜md5 ${itemMd5}｜sha256 ${itemSha}`);
    let ok = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
      const timeoutMs = (size > 50 * 1048576 ? 1800 : 600) * 1000;
      const r = await uploadOnce(item, size, attempt, timeoutMs);
      if (!r.ok) { log(`  尝试 ${attempt} 失败：${r.reason}`); await sleep(3000); continue; }
      ok = await verify(item, itemSha, itemMd5);
      if (!ok) { log(`  上传后校验未通过（尝试 ${attempt}）`); await sleep(2000); }
    }
    if (!ok) failed.push({ ...item, size, md5: itemMd5, sha256: itemSha });
  }

  if (!failed.length) {
    log(`\n全部 ${plan.length} 项上传并通过校验`);
    process.exit(0);
  }
  log(`\n以下 ${failed.length} 项 3 次失败，请手动上传：`);
  for (const f of failed) {
    log(`- 本地文件：${f.file}`);
    log(`  R2 桶：${BUCKET}｜对象键：${f.key}｜${mb(f.size)}｜md5 ${f.md5}`);
    log(`  控制台：Cloudflare Dashboard → R2 → ${BUCKET} → ${path.posix.dirname(f.key)}/ → 上传对象（拖拽文件，文件名保持 ${path.basename(f.key)}）`);
    if (f.contentType) log(`  Content-Type 需设为：${f.contentType}`);
  }
  process.exit(1);
}

main().catch((e) => { log(`FATAL ${e.stack || e.message}`); process.exit(2); });
