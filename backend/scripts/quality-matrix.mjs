// quality-matrix.mjs — 第四期任务 C：AI 输出质量矩阵四项实测（demo 账户，每问独立会话，会话标题=问题原文便于复查）。
// 产出 backend/bench/quality-matrix-<date>.json：每问记录 原话/首token/总耗时/工具/卡片/全文 + 自动检查项。
const BASE = "https://suveoo.com";
const EMAIL = "demo@suveoo.com";
const PASSWORD = "jinrongkeji2026";

const login = async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }) });
  const d = await r.json();
  if (!d.token) throw new Error("login failed: " + JSON.stringify(d));
  return d.token;
};

async function ask(token, text, tag) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, session_id: `qm_${tag}_${Date.now().toString(36)}` }),
    signal: AbortSignal.timeout(150_000),
  });
  const m = { firstTokenMs: null, totalMs: null, tools: [], cards: [], answer: "", errors: [], done: false, httpStatus: res.status };
  if (!res.ok || !res.body) { m.errors.push(`HTTP ${res.status}`); m.totalMs = Date.now() - t0; return m; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      const t = Date.now() - t0;
      if (ev.type === "token") { m.answer += ev.text ?? ""; if (m.firstTokenMs == null) m.firstTokenMs = t; }
      else if (ev.type === "trust_event" && ev.event?.kind === "PROPOSED") m.tools.push(ev.event?.tool ?? "?");
      else if (ev.type === "genui_event") m.cards.push({ component: ev.card?.component, tier: ev.card?.tier, reason: ev.card?.reason ?? null, params: ev.card?.params });
      else if (ev.type === "error") m.errors.push(`${ev.code ?? ""}:${ev.message ?? ""}`);
      else if (ev.type === "done") { m.done = true; m.totalMs = t; break outer; }
    }
  }
  if (m.totalMs == null) m.totalMs = Date.now() - t0;
  return m;
}

const token = await login();
const now = new Date(Date.now() + 8 * 3600_000);
const beijing = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")} 星期${["日", "一", "二", "三", "四", "五", "六"][now.getUTCDay()]} ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
console.log("北京时间（脚本侧独立计算，用于核对模型口径）:", beijing);

const CASES = [
  ["C1-monthly-report", "给我生成 8 月消费月报"],
  ["C2-birthday", "我爱人生日 10 月 18 日，提前 2 天订鲜花和蛋糕，预算 600"],
  ["C3a-date-today", "今天几号星期几"],
  ["C3b-date-nextwed", "下周三是多少号"],
  ["C4-card-mask", "给周慕言转账"],
];
/* 只跑指定标签（重试用）：node quality-matrix.mjs C1-monthly-report */
const onlyTags = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const cases = onlyTags.length ? CASES.filter(([t]) => onlyTags.includes(t)) : CASES;

const out = { beijing_now: beijing, cases: [] };
for (const [tag, text] of cases) {
  process.stderr.write(`[${tag}] ${text} ... `);
  const m = await ask(token, text, tag);
  /* 自动检查：正文出现 ≥10 位连续数字（完整卡号/账号泄漏） */
  m.checks = {
    longDigitLeak: (m.answer.match(/\d{10,}/g) ?? []),
    grantLeak: /grant|INPUT_REQUIRED|trace_id/i.test(m.answer),
  };
  out.cases.push({ tag, text, ...m });
  console.error(`${m.totalMs}ms 首=${m.firstTokenMs}ms 工具=[${m.tools.join(",")}] 卡=[${m.cards.map((c) => c.component + (c.tier ? ":" + c.tier : "")).join(",")}]`);
  await new Promise((r) => setTimeout(r, 1500));
}

const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
const path = `bench/quality-matrix-${new Date().toISOString().slice(0, 10)}.json`;
const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : { beijing_now: beijing, cases: [] };
/* 重试单标签时合并进既有文件（同 tag 覆盖，保留其余轮次） */
const merged = { beijing_now: beijing, cases: [...prev.cases.filter((c) => !onlyTags.includes(c.tag)), ...out.cases] };
writeFileSync(path, JSON.stringify(merged, null, 2), "utf-8");
console.log("写入", path);
for (const c of out.cases) {
  console.log(`\n===== [${c.tag}] ${c.text} =====`);
  console.log("工具:", c.tools.join(", ") || "无", "| 卡:", c.cards.map((x) => x.component).join(", ") || "无");
  console.log("全文:\n" + c.answer);
}
