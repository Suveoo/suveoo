import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { toCents } from "../../worker-main.js";

/** 第八期：生日订花链六修复 —— 单复数兼容 / 建单锁资金 / MCP 响应 trace_id+summary /
 *  COMPILED 事件 / demo-run 端点 / yearly 轮转。均走真实 MCP 两段式（AI 确认卡路径）。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await j(await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true }));
  return { ...r, email }; /* 注册响应不含 email（仅 user_id/token）——测试侧回填 */
}
const doOp = (uid, input) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify(input),
}).then((r) => r.json());
const defCard = async (uid) => (await doOp(uid, { op: "getCards" })).cards.find((c) => Number(c.is_default) === 1 && c.kind === "debit");
/* 运行级唯一邮箱：单文件反复重跑（开发迭代）与全量两遍跑都不撞已注册账户 */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const mailOf = (tag) => `${tag}-${RUN}@test.dev`;

async function mcpCall(sid, token, id, params) {
  return j(await SELF.fetch(`${BASE}/mcp?sid=${sid}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params }),
  }));
}
/** MCP 两段式建 birthday 任务（修复后建单即锁资金）；返回 { inner1, inner2, task } */
async function createBirthday(uid, token, sid, { taskType = "birthday_flowers", amount = "48.00", item = "鲜花礼盒", title = "爱人生日 · 鲜花预订", repeat = "once" }) {
  const args = {
    task_type: taskType, title, item, amount,
    execute_at: new Date(Date.now() + 3600_000).toISOString(), repeat,
  };
  const c1 = await mcpCall(sid, token, 1, { name: "scheduled_task_create", arguments: args });
  const inner1 = JSON.parse(c1.result.content[0].text);
  const c2 = await mcpCall(sid, token, 2, { name: "scheduled_task_create", arguments: { ...args, grant_hash: inner1.grant.grant_hash } });
  const inner2 = JSON.parse(c2.result.content[0].text);
  const tasks = await doOp(uid, { op: "tasks" });
  const task = tasks.tasks.find((t) => String(t.type) === taskType && t.status === "PENDING");
  return { inner1, inner2, task };
}

describe("生日订花链（第八期六修复）", () => {
  it("修复1+2+3：单数 birthday_flower 建单（MCP 两段式）→ 建单即锁 ¥48 → 到点履约四断言；确认响应含 trace_id/task_id/summary", async () => {
    const out = await registerUser(mailOf("bd1"), "生日甲");
    const { inner1, inner2, task } = await createBirthday(out.user_id, out.token, "bd1", { taskType: "birthday_flower" });
    /* 确认卡分型数据（前端分型依据）：task_type 原样透传 */
    expect(inner1.status).toBe("INPUT_REQUIRED");
    expect(inner1.card.params.task_type).toBe("birthday_flower");
    expect(inner1.card.params.item).toBe("鲜花礼盒");
    /* 修复 3 + §5.1：EXECUTED 响应携带顶层 trace_id / task_id / 确定性 summary */
    expect(inner2.status).toBe("EXECUTED");
    expect(inner2.trace_id).toMatch(/^bai_/);
    expect(inner2.task_id).toBe(task.id);
    expect(inner2.summary).toContain("锁定");
    expect(inner2.summary).toContain("48.00");
    /* 修复 2：建单即锁定（赛题"当月锁定"） */
    expect(task).toBeTruthy();
    const card1 = await defCard(out.user_id);
    expect(BigInt(card1.held_cents)).toBe(toCents("48.00"));

    /* 修复 1：单数任务到点走履约分支（此前只标 DONE 无履约）——held/余额/流水/通知四断言 */
    const due = await doOp(out.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("DONE");
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(0n);
    expect(BigInt(card2.balance_cents)).toBe(BigInt(card1.balance_cents) - toCents("48.00"));
    const txs = await doOp(out.user_id, { op: "transfers", cursor: "0", days: 7, category: null });
    const tx = (txs.transfers ?? txs.txs ?? []).find((t) => (t.memo ?? "").includes("鲜花已预订"));
    expect(tx).toBeTruthy();
    expect(tx.amount_cents).toBe("4800");
    const notifs = await j(await SELF.fetch(BASE + "/api/notifications", { headers: { authorization: `Bearer ${out.token}` } }));
    expect((notifs.notifications ?? []).some((n) => (n.title ?? "").includes("生日订花已履约"))).toBe(true);
    /* 履约触点邮件（三渠道之邮件） */
    const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${out.email}`)) ?? "[]");
    expect(mails.some((m) => (m.subject ?? "").includes("生日预订已履约"))).toBe(true);
  }, 30000);

  it("修复1：复数 birthday_flowers 同链路（新 desc 口径）→ 履约四断言", async () => {
    const out = await registerUser(mailOf("bd2"), "生日乙");
    const { inner2, task } = await createBirthday(out.user_id, out.token, "bd2", { taskType: "birthday_flowers", amount: "66.60" });
    expect(inner2.status).toBe("EXECUTED");
    const card1 = await defCard(out.user_id);
    expect(BigInt(card1.held_cents)).toBe(toCents("66.60"));
    const due = await doOp(out.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("DONE");
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(0n);
    expect(BigInt(card2.balance_cents)).toBe(BigInt(card1.balance_cents) - toCents("66.60"));
    const txs = await doOp(out.user_id, { op: "transfers", cursor: "0", days: 7, category: null });
    expect((txs.transfers ?? txs.txs ?? []).some((t) => (t.memo ?? "").includes("鲜花已预订"))).toBe(true);
  }, 30000);

  it("修复2：取消 → 按本任务金额精确解锁，其他任务的锁定不动（此前无条件清零 held）", async () => {
    const out = await registerUser(mailOf("bd3"), "生日丙");
    /* 预先存在另一笔锁定 ¥50（其他任务/预留） */
    await doOp(out.user_id, { op: "fundsLock", amount_cents: String(toCents("50.00")), reason: "other_reservation" });
    const { task } = await createBirthday(out.user_id, out.token, "bd3", { amount: "30.00" });
    const card1 = await defCard(out.user_id);
    expect(BigInt(card1.held_cents)).toBe(toCents("80.00"));
    const r = await doOp(out.user_id, { op: "taskCancel", id: task.id });
    expect(r.ok).toBe(true);
    expect(r.compensated).toBe(true);
    expect(r.unlocked).toBe("30.00");
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(toCents("50.00")); /* 其他锁定原封不动 */
    expect(BigInt(card2.balance_cents)).toBe(BigInt(card1.balance_cents)); /* 取消不动余额 */
  }, 30000);

  it("修复2：可用额度不足 → 整个建单失败（不建任务、不残留锁定）", async () => {
    const out = await registerUser(mailOf("bd4"), "生日丁");
    const card = await defCard(out.user_id);
    /* 锁到只剩 ¥1.00 可用 */
    await doOp(out.user_id, { op: "fundsLock", amount_cents: String(BigInt(card.balance_cents) - 100n), reason: "drain" });
    const { inner2 } = await createBirthday(out.user_id, out.token, "bd4", { amount: "50.00" });
    expect(inner2.status).toBe("BLOCKED");
    expect(inner2.reason).toBe("INSUFFICIENT_BALANCE");
    const tasks = await doOp(out.user_id, { op: "tasks" });
    expect(tasks.tasks.some((t) => String(t.type ?? "").startsWith("birthday_flower"))).toBe(false);
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(BigInt(card.balance_cents) - 100n); /* 原有锁定不受影响 */
  }, 30000);

  it("修复6：MCP 工具执行推 COMPILED trust_event（airing 环内携真实 IR trace/nonce/intent/facts）", async () => {
    const out = await registerUser(mailOf("bd5"), "生日戊");
    await createBirthday(out.user_id, out.token, "bd5", {});
    const airing = JSON.parse((await env.SESSION_KV.get("airing:bd5")) ?? "[]");
    const compiled = airing.find((e) => e.event?.kind === "COMPILED");
    expect(compiled).toBeTruthy();
    expect(compiled.event.ir.trace_id).toMatch(/^bai_/);
    expect(compiled.event.ir.intent).toBe("scheduled_task_create");
    expect(compiled.event.ir.nonce).toBeTruthy();
    expect(Array.isArray(compiled.event.ir.facts)).toBe(true);
    expect(compiled.event.ir.facts.some((f) => f.field === "amount")).toBe(true);
    /* 五道验证与 RESULT 事件仍在（事件序完整） */
    expect(airing.some((e) => e.event?.kind === "PROPOSED")).toBe(true);
    expect(airing.some((e) => e.event?.kind === "RESULT")).toBe(true);
  }, 30000);

  it("§5.3：demo-run 端点 → DONE（复用 taskDue 原语义）→ 幂等再跑 409；注入故障后 demo-run → COMPENSATED + 解锁 + 通知", async () => {
    const out = await registerUser(mailOf("bd6"), "生日己");
    const { task } = await createBirthday(out.user_id, out.token, "bd6", { amount: "66.60" });
    const card1 = await defCard(out.user_id);
    const r1 = await j(await post(`/api/tasks/${task.id}/demo-run`, {}, out.token));
    expect(r1.ok).toBe(true);
    expect(r1.outcome).toBe("DONE");
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(0n);
    expect(BigInt(card2.balance_cents)).toBe(BigInt(card1.balance_cents) - toCents("66.60"));
    /* 已 DONE 再跑：状态机拒绝（409 NOT_PENDING） */
    const r2 = await post(`/api/tasks/${task.id}/demo-run`, {}, out.token);
    expect(r2.status).toBe(409);
    /* 注入 + demo-run = 30 秒讲完 T2✗→C1 补偿 */
    const { task: t2 } = await createBirthday(out.user_id, out.token, "bd6b", { amount: "20.00", title: "爱人生日 · 蛋糕预订", item: "生日蛋糕" });
    await j(await post("/api/demo/inject-failure", { task_id: t2.id }, out.token));
    const r3 = await j(await post(`/api/tasks/${t2.id}/demo-run`, {}, out.token));
    expect(r3.outcome).toBe("COMPENSATED");
    const card3 = await defCard(out.user_id);
    expect(BigInt(card3.held_cents)).toBe(0n);
    expect(BigInt(card3.balance_cents)).toBe(BigInt(card2.balance_cents)); /* 余额未受失败影响 */
    const notifs = await j(await SELF.fetch(BASE + "/api/notifications", { headers: { authorization: `Bearer ${out.token}` } }));
    expect((notifs.notifications ?? []).some((n) => (n.title ?? "").includes("任务失败已自动补偿") && (n.body ?? "").includes("20.00"))).toBe(true);
  }, 30000);

  it("§5.2：repeat=yearly → 履约后 RESCHEDULED（明年同期）且重新锁定同等金额", async () => {
    const out = await registerUser(mailOf("bd7"), "生日庚");
    const { task } = await createBirthday(out.user_id, out.token, "bd7", { amount: "99.00", repeat: "yearly" });
    const card1 = await defCard(out.user_id);
    const r = await j(await post(`/api/tasks/${task.id}/demo-run`, {}, out.token));
    expect(r.outcome).toBe("RESCHEDULED");
    const after = (await doOp(out.user_id, { op: "tasks" })).tasks.find((t) => t.id === task.id);
    expect(after.status).toBe("PENDING");
    expect(Date.parse(after.next_run_at)).toBeGreaterThan(Date.now() + 360 * 86400000);
    const card2 = await defCard(out.user_id);
    expect(BigInt(card2.held_cents)).toBe(toCents("99.00")); /* 明年预算已再锁定 */
    expect(BigInt(card2.balance_cents)).toBe(BigInt(card1.balance_cents) - toCents("99.00"));
    const txs = await doOp(out.user_id, { op: "transfers", cursor: "0", days: 7, category: null });
    expect((txs.transfers ?? txs.txs ?? []).some((t) => (t.memo ?? "").includes("鲜花已预订"))).toBe(true);
  }, 30000);
});
