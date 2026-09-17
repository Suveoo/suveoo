// ai-bench.mjs — /api/ai/chat 性能基准脚本（第二十轮：六场景 ≥18 条指令）
// 用法：node scripts/ai-bench.mjs [--out 结果.json]
// 每条指令独立 session（不携带历史），记录：首 token 延迟 / 总耗时 / token 事件数 /
// 工具调用数（trust PROPOSED）/ 最终状态 / 回答全文（供定性评估）。
const BASE = "https://suveoo.com";
const EMAIL = "demo@suveoo.com";
const PASSWORD = "jinrongkeji2026";

const SCENARIOS = [
  ["智能转账", [
    "给赵砚秋转 88 元，备注晚饭AA",
    "转 1200 给赵砚秋买相机",
    "下周三上午 9 点给赵砚秋预约转账 300 元",
  ]],
  ["账单分析", [
    "我这个月花最多的是什么",
    "分析我的订阅，哪些可以退",
    "我的消费有什么异常",
  ]],
  ["理财操作", [
    "帮我对比黄金基金和货币基金",
    "我想申购 5000 元环球货币基金",
    "赎回我全部黄金持仓",
  ]],
  ["卡片管理", [
    "我信用卡还能刷多少",
    "把我的默认卡额度调低到 5000",
    "冻结 debit-card-2",
  ]],
  ["订阅代扣", [
    "列出我所有订阅和年化成本",
    "Netflix 下个月续费提醒我",
    "帮我把爱奇艺订阅退订了",
  ]],
  ["跨场景联动", [
    "我爱人生日快到了，安排一下",
    "我下周要交房租和信用卡，帮我看看账单和卡里的钱够不够",
    "帮我看看订阅花销占比，再给我做个月度预算分配",
  ]],
];

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  const d = await r.json();
  if (!d.token) throw new Error(`login failed: ${JSON.stringify(d)}`);
  return d.token;
}

async function runInstruction(token, text, idx) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, session_id: `bench_r20_${idx}_${Date.now().toString(36)}` }),
    signal: AbortSignal.timeout(150_000),
  });
  const m = {
    firstTokenMs: null, totalMs: null, tokenEvents: 0, chars: 0,
    proposed: 0, resultEvents: 0, cards: [], errors: [], doneAt: null,
    firstTrustMs: null, answer: "", httpStatus: res.status,
  };
  if (!res.ok || !res.body) {
    m.errors.push(`HTTP ${res.status}`);
    m.totalMs = Date.now() - t0;
    return m;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      const t = Date.now() - t0;
      if (ev.type === "token") {
        m.tokenEvents++; m.chars += (ev.text ?? "").length; m.answer += ev.text ?? "";
        if (m.firstTokenMs == null) m.firstTokenMs = t;
      } else if (ev.type === "trust_event") {
        const k = ev.event?.kind;
        if (k === "PROPOSED") { m.proposed++; if (m.firstTrustMs == null) m.firstTrustMs = t; }
        if (k === "RESULT") m.resultEvents++;
      } else if (ev.type === "genui_event") {
        m.cards.push({ component: ev.card?.component, tier: ev.card?.tier, action: ev.card?.action, reason: ev.card?.reason ?? null });
      } else if (ev.type === "error") {
        m.errors.push(`${ev.code ?? ""}:${ev.message ?? ""}`);
      } else if (ev.type === "done") {
        m.doneAt = t; m.totalMs = t; break outer;
      }
    }
  }
  if (m.totalMs == null) m.totalMs = Date.now() - t0;
  return m;
}

function classify(m) {
  if (m.httpStatus !== 200) return `HTTP${m.httpStatus}`;
  if (m.errors.length) return "ERROR";
  const confirm = m.cards.find((c) => c.component === "transfer_confirmation");
  if (confirm) return `INPUT_REQUIRED(${confirm.tier})`;
  const blocked = m.cards.find((c) => c.component === "blocked_notice");
  if (blocked) return `BLOCKED(${blocked.reason ?? "?"})`;
  if (m.proposed > 0) return "文本+工具";
  return "纯文本";
}

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : "ai-bench-result.json";
/* --only 1,2,8 —— 只跑指定序号（定向复测用；序号对应 SCENARIOS 展开后的全局编号） */
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",").map(Number)) : null;
const token = await login();
console.error("login ok");
const out = [];
let idx = 0;
for (const [scenario, texts] of SCENARIOS) {
  for (const text of texts) {
    idx++;
    if (only && !only.has(idx)) continue;
    process.stderr.write(`[${idx}/18] ${text} ... `);
    const m = await runInstruction(token, text, idx);
    const row = { n: idx, scenario, text, ...m, status: classify(m) };
    out.push(row);
    console.error(`${m.totalMs}ms 首token=${m.firstTokenMs}ms tok=${m.tokenEvents} 工具=${m.proposed} → ${row.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const outIdx2 = args.indexOf("--out");
const outPath2 = outIdx2 >= 0 ? args[outIdx2 + 1] : "ai-bench-result.json";
const { writeFileSync } = await import("node:fs");
writeFileSync(outPath2, JSON.stringify(out, null, 2), "utf-8");

// markdown 汇总
const lines = ["| # | 场景 | 指令 | 首token(ms) | 总耗时(ms) | token事件 | 工具调用 | 最终状态 |",
  "|---|------|------|------------:|----------:|--------:|--------:|---------|"];
for (const r of out) {
  lines.push(`| ${r.n} | ${r.scenario} | ${r.text} | ${r.firstTokenMs ?? "—"} | ${r.totalMs} | ${r.tokenEvents} | ${r.proposed} | ${r.status} |`);
}
console.log(lines.join("\n"));
console.error(`\n结果已写入 ${outPath}`);
