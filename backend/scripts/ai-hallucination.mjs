#!/usr/bin/env node
/* ai-hallucination.mjs — S1/S2 幻觉防护执行器 v2（第一百三十一轮 · 板块一 Phase 2 L1）
 * SSE 聚合 type:"token"；truthJs 求值器（收到该 truthApi 的 JSON，返回真值字符串/数字）；
 * comparator: exact | pm1（±1 分）| count | text-in | manual（记录不判）
 * 用法：node scripts/ai-hallucination.mjs --session-token <JWT> --out ../for_developer/bench-results/20261006/s1-halluc.json [--only S1-01,S1-02] */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const a = process.argv.slice(2);
const args = { ["session-token"]: null, out: null, only: null, base: "https://suveoo.com", delay: "0" };
for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) args[a[i].slice(2)] = a[i + 1];
const DELAY_MS = Number(args.delay) || 0; /* kimi 等有速率限制的模型加间隔 */
const token = args["session-token"];
if (!token) { console.error("需要 --session-token"); process.exit(1); }
const BASE = args.base;
const ALL = JSON.parse(readFileSync(new URL("../tests/bench/hallucination-cases.json", import.meta.url), "utf8"));
const only = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;
const CASES = only ? ALL.filter((c) => only.has(c.id)) : ALL;

const MONTH = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7);
const helpers = { month: MONTH, sum: (xs) => xs.reduce((x, y) => x + Number(y), 0) };

async function ask(q) {
  return new Promise((resolve) => {
    let acc = "";
    const fin = () => resolve(acc);
    const timer = setTimeout(fin, 90000);
    fetch(BASE + "/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, accept: "text/event-stream" }, body: JSON.stringify({ text: q }) })
      .then(async (r) => {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "token" && evt.text) acc += evt.text;
              if (evt.type === "done" || evt.type === "error") { clearTimeout(timer); return fin(); }
            } catch { /* 跨片忽略 */ }
          }
        }
        clearTimeout(timer); fin();
      })
      .catch(() => { clearTimeout(timer); fin(); });
  });
}

const norm = (s) => String(s).replace(/[¥￥,，\s]/g, "");
const extractNums = (t) => [...String(t).matchAll(/-?\d[\d,]*(?:\.\d{1,2})?/g)].map((m) => norm(m[0])).filter((n) => n.length > 0 && !/^\d{6,}$/.test(n.replace(".", "").length > 9 ? "x" : n)); /* 排除流水号类超长数字串 */

function judge(answer, truth, cmp) {
  const nums = extractNums(answer);
  if (cmp === "exact") return { pass: nums.map(String).includes(String(truth)), nums };
  if (cmp === "pm1") { const ti = Math.round(Number(truth) * 100); const pass = nums.some((n) => { const ni = Math.round(Number(n) * 100); return Math.abs(ni - ti) <= 1; }); return { pass, nums }; }
  if (cmp === "pm1-yuan") { const ti = Math.round(Number(truth) * 100); const pass = nums.some((n) => { const ni = Math.round(Number(n) * 100); return Math.abs(ni - ti) <= 100; }); return { pass, nums }; }
  if (cmp === "dual-pm1") { /* truth 形如 "a | b"：a=存款合计（±1 分严格）；b=持仓市值（±¥10——两次查询间真实净值漂移口径，非 AI 误差） */
    const parts = String(truth).split("|").map((s) => s.trim());
    const ok = parts.map((p, idx) => { const tol = idx === 0 ? 1 : 1000; const ti = Math.round(Number(p) * 100); return nums.some((n) => Math.abs(Math.round(Number(n) * 100) - ti) <= tol); });
    return { pass: ok.every(Boolean), nums }; }
  if (cmp === "sub-next") { /* truth=订阅对象：商户名文本命中 且 该金额 ±1 分 */
    const amt = String(Number(truth.amount_cents) / 100);
    const nameHit = String(answer).includes(String(truth.merchant));
    const ti = Math.round(Number(amt) * 100);
    const amtHit = nums.some((n) => Math.abs(Math.round(Number(n) * 100) - ti) <= 1);
    return { pass: nameHit && amtHit, nums }; }
  if (cmp === "count") { const t = String(Number(truth)); const pass = nums.map((n) => String(Math.round(Number(n)))).includes(t) || nums.map(String).includes(t); return { pass, nums }; }
  if (cmp === "text-in") { return { pass: String(answer).includes(String(truth)), nums }; }
  return { pass: null, nums, manual: true };
}

(async () => {
  const out = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const answer = await ask(c.q);
    let truth = null, verdict = { pass: null, manual: true };
    try {
      if (c.truthApi && c.truthApi !== "/none") {
        const tr = await fetch(BASE + c.truthApi, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
        truth = c.truthJs ? new Function("j", "h", "return (" + c.truthJs + ")")(tr, helpers) : c.truthPath.split(".").reduce((o, k) => (o == null ? undefined : o[Array.isArray(o) ? Number(k) : k]), tr);
      }
      if (truth != null) verdict = judge(answer, truth, c.cmp);
    } catch (e) { truth = "TRUTH_ERR:" + String(e).slice(0, 100); }
    out.push({ id: c.id, q: c.q, cmp: c.cmp, truth: String(truth), pass: verdict.pass, nums: (verdict.nums ?? []).slice(0, 8), ms: Date.now() - t0, answer: String(answer) });
    console.log(`${verdict.pass === true ? "✓" : verdict.pass === false ? "✗" : "•"} #${c.id} truth=${String(truth).slice(0, 40)} nums=[${(verdict.nums ?? []).slice(0, 5)}] ${Date.now() - t0}ms`);
    if (DELAY_MS) await new Promise((r2) => setTimeout(r2, DELAY_MS));
  }
  const judged = out.filter((o) => o.pass !== null);
  const passed = judged.filter((o) => o.pass).length;
  const summary = { date: new Date().toISOString(), model: "glm-5.3-flash", total: out.length, judged: judged.length, passed, rate: judged.length ? +(passed / judged.length * 100).toFixed(1) : null, manual_review: out.filter((o) => o.pass === null).map((o) => o.id), byId: out };
  const dest = args.out ?? "../for_developer/bench-results/20261006/s1-halluc.json";
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(summary, null, 2));
  console.log(`\n判定 ${passed}/${judged.length}（${summary.rate ?? "-"}%）｜人工复核 ${summary.manual_review.length} 条 → ${dest}`);
})();
