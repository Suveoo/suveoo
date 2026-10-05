#!/usr/bin/env node
/* tool-latency.mjs — P3 单次工具调用延迟（第一百三十一轮 · 板块一 Phase 3）
 * 并发 10 次 GET /api/cards + /api/home/bundle，记 P50/P95。
 * 用法：node scripts/tool-latency.mjs --session-token <JWT> --out ../for_developer/bench-results/20261006/p3-tool-latency.json */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const a = process.argv.slice(2);
const args = { "session-token": null, out: null, base: "https://suveoo.com", rounds: "3" };
for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) args[a[i].slice(2)] = a[i + 1];
const token = args["session-token"];
if (!token) { console.error("需要 --session-token"); process.exit(1); }

(async () => {
  const results = [];
  for (let r = 0; r < Number(args.rounds); r++) {
    const batch = await Promise.all(Array.from({ length: 10 }, () =>
      fetch(args.base + "/api/cards", { headers: { authorization: `Bearer ${token}` } })
        .then(async (res) => ({ ok: res.ok, ms: Date.now() }))
        .catch(() => ({ ok: false, ms: Date.now() }))
    ));
    results.push(...batch.map(b => b.ms));
    /* home/bundle 单发 */
    const t0 = Date.now();
    await fetch(args.base + "/api/home/bundle", { headers: { authorization: `Bearer ${token}` } });
    results.push(Date.now() - t0 === 0 ? 1 : Date.now()); /* 简化——主要测 cards */
    await new Promise(r2 => setTimeout(r2, 500));
  }
  /* 重算正确延迟 */
  const lat = [];
  for (let r = 0; r < Number(args.rounds); r++) {
    const batch = await Promise.all(Array.from({ length: 10 }, async () => {
      const t = Date.now();
      await fetch(args.base + "/api/cards", { headers: { authorization: `Bearer ${token}` } });
      return Date.now() - t;
    }));
    lat.push(...batch);
    const t2 = Date.now();
    await fetch(args.base + "/api/home/bundle", { headers: { authorization: `Bearer ${token}` } });
    lat.push(Date.now() - t2);
    await new Promise(r3 => setTimeout(r3, 500));
  }
  const sorted = lat.sort((x, y) => x - y);
  const summary = { date: new Date().toISOString(), n: sorted.length, p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], min: sorted[0], max: sorted[sorted.length - 1], unit: "ms", note: "并发 10× /api/cards + 单发 /api/home/bundle，3 轮" };
  const dest = args.out ?? "../for_developer/bench-results/20261006/p3-tool-latency.json";
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(summary, null, 2));
  console.log(`P3：n=${sorted.length} P50=${summary.p50}ms P95=${summary.p95}ms min=${summary.min} max=${summary.max} → ${dest}`);
})();
