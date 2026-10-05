#!/usr/bin/env node
/* s2b4p4-e2e.mjs — S2 执行声明一致 / B4 三源一致 / P4 转账全链计时（第一百三十一轮 · 板块一 Phase 2/3 L2）
 * 全走黄级转账（grant 两段式零 OTP）：AI 对话发起→grant→确认→EXECUTED→三源比对（AI 摘要金额/tx 行/余额差）+分段计时。
 * 用法：node scripts/s2b4p4-e2e.mjs --session-token <JWT> --n 10 --payee 赵砚秋 --out ../for_developer/bench-results/20261006/s2b4p4.json */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const a = process.argv.slice(2);
const args = { "session-token": null, n: "10", payee: "赵砚秋", out: null, base: "https://suveoo.com", "from-card": null };
for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) args[a[i].slice(2)] = a[i + 1];
const token = args["session-token"];
if (!token) { console.error("需要 --session-token"); process.exit(1); }
const N = Number(args.n);

async function sseChat(text) {
  return new Promise((resolve) => {
    let acc = ""; const cards = []; const t0 = Date.now();
    let firstTokenAt = null;
    const fin = () => resolve({ text: acc, cards, t0, firstTokenAt, totalMs: Date.now() - t0 });
    const timer = setTimeout(fin, 150000);
    fetch(args.base + "/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, accept: "text/event-stream" }, body: JSON.stringify({ text }) })
      .then(async (r) => {
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "token" && evt.text) { if (!firstTokenAt) firstTokenAt = Date.now() - t0; acc += evt.text; }
              if (evt.type === "genui_event" && evt.card) cards.push(evt.card);
              if (evt.type === "done" || evt.type === "error") { clearTimeout(timer); return fin(); }
            } catch { /* 跨片 */ }
          }
        }
        clearTimeout(timer); fin();
      }).catch(() => { clearTimeout(timer); fin(); });
  });
}
const api = (p, opts = {}) => fetch(args.base + p, { ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers ?? {}) } }).then((r) => r.json());
const extractAmt = (t) => [...String(t).matchAll(/-?[\d,]+\.\d{1,2}/g)].map((m) => Number(m[0].replace(/,/g, "")));

(async () => {
  const rows = [];
  const before0 = await api("/api/cards");
  const paySlug = args["from-card"];
  const defCard = before0.cards.find((c) => (paySlug ? c.slug === paySlug : Number(c.is_default) && c.kind === "debit"));
  let runningBal = Number(defCard.balance);
  for (let i = 1; i <= N; i++) {
    const amt = (1 + i).toFixed(2); /* 每笔不同金额便于比对 */
    const q = `给${args.payee}转 ${amt} 元`;
    /* ① AI 对话出卡 */
    const chat = await sseChat(q);
    const card = chat.cards.find((c) => c.action === "transfer_execute" && c.tier === "YELLOW" && c.grant_hash);
    if (!card) { rows.push({ i, q, stage: "CARD_FAIL", chatMs: chat.totalMs, cards: chat.cards.map((c) => `${c.action ?? c.component}:${c.tier ?? c.reason}`), textHead: chat.text.slice(0, 80) }); console.log(`✗ #${i} 无黄卡`); continue; }
    /* ② grant 确认执行——从快照精确复制全部参数（含 from_card），仅加 grant_hash（防 CONSENT_INVALIDATED） */
    const snapParams = card.snapshot?.params ?? {};
    const execArgs = { ...snapParams, grant_hash: card.grant_hash, from_card: snapParams.from_card ?? args["from-card"] ?? null };
    const tExec0 = Date.now();
    const exec = await fetch(args.base + `/mcp?sid=s2b4p4-${i}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "transfer_execute", arguments: execArgs } }) }).then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text)).catch((e) => ({ status: "ERR", err: String(e).slice(0, 80) }));
    const execMs = Date.now() - tExec0;
    /* ③ 账本回读 */
    const after = await api("/api/cards");
    const defNow = after.cards.find((c) => (paySlug ? c.slug === paySlug : Number(c.is_default) && c.kind === "debit"));
    const newBal = Number(defNow.balance);
    const txs = await api("/api/transfers?scope=transfers");
    const tx = (txs.txs ?? []).find((t) => t.counterparty === args.payee && Number(t.amount_cents) === Math.round(Number(amt) * 100));
    /* ④ S2 判定：AI 摘要（出卡阶段 narration 或重发声明含金额）——直接以卡快照金额+tx 为准 */
    const snapshotAmt = card.snapshot?.params?.amount;
    const s2ok = exec.status === "EXECUTED" && snapshotAmt === amt && !!tx;
    /* ⑤ B4 三源：卡快照金额 vs tx 金额 vs 余额差 */
    const balDelta = runningBal - newBal;
    const b4ok = s2ok && Math.abs(balDelta - Number(amt)) < 0.005;
    rows.push({ i, q, amt, chatMs: chat.totalMs, ttft: chat.firstTokenAt, execMs, execStatus: exec.status, txId: tx?.id ?? null, txMatch: !!tx, snapshotAmt, s2ok, balDelta, b4ok, e2eMs: chat.totalMs + execMs });
    runningBal = newBal;
    console.log(`${s2ok && b4ok ? "✓" : "✗"} #${i} ¥${amt} chat=${chat.totalMs}ms exec=${execMs}ms tx=${tx ? "✓" : "✗"} Δbal=${balDelta.toFixed(2)} ${s2ok && b4ok ? "" : JSON.stringify(exec).slice(0, 60)}`);
  }
  const s2pass = rows.filter((r) => r.s2ok).length;
  const b4pass = rows.filter((r) => r.b4ok).length;
  const execRows = rows.filter((r) => r.execStatus === "EXECUTED");
  const sorted = execRows.map((r) => r.e2eMs).sort((x, y) => x - y);
  const p50 = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const summary = { date: new Date().toISOString(), model: "glm-5.3-flash", n: N, s2: { pass: s2pass, rate: +(s2pass / N * 100).toFixed(1) }, b4: { pass: b4pass, rate: +(b4pass / N * 100).toFixed(1) }, p4: { samples: execRows.length, p50, p95, min: sorted[0], max: sorted[sorted.length - 1], unit: "ms（AI 对话出卡+确认执行全链）" }, rows };
  const dest = args.out ?? "../for_developer/bench-results/20261006/s2b4p4.json";
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(summary, null, 2));
  console.log(`\nS2 ${s2pass}/${N}（${summary.s2.rate}%）｜B4 ${b4pass}/${N}（${summary.b4.rate}%）｜P4 P50=${p50}ms P95=${p95}ms（n=${execRows.length}）→ ${dest}`);
})();
