import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { toCents } from "../../worker-main.js";

/** 跨场景联动第二轮：scheduled_task_create 的 task_type="scheduled_purchase"（定时代付/订购）。
 *  birthday_flower* 保留为兼容别名，与 scheduled_purchase 共用同一条执行分支：
 *  建单锁钱 → 到期扣款给模拟商户（购物类流水）→ 取消/失败解锁。
 *  覆盖：卡片字段化 / 建单锁钱 / 到期扣款 + 流水 + 邮件 + 通知 / 生日别名回归 /
 *        preValidate 拒绝与截断 / 类型归一 / 取消解锁 / yearly 重锁夹持 / 组合卡。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;
/* 运行级唯一后缀：单文件重复跑（迭代）与全量两遍跑都不撞已注册账户 */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const mailOf = (tag) => `${tag}-${RUN}@test.dev`;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  const hit = String(mails.at(-1)?.text ?? "").match(/\b[0-9]{6}\b/);
  return hit ? hit[0] : null;
}
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await j(await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true }));
  return { ...r, email };
}
const doOp = (uid, input) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify(input),
}).then((r) => r.json());
async function mcpCall(sid, token, id, params) {
  return j(await SELF.fetch(`${BASE}/mcp?sid=${sid}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params }),
  }, 30000));
}
async function mcp(sid, token, name, args) {
  const c = await mcpCall(sid, token, 1, { name, arguments: args });
  return JSON.parse(c.result.content[0].text);
}
/** MCP 两段式建任务；返回 { inner1, inner2 } */
async function createTask(sid, token, args) {
  const inner1 = await mcp(sid, token, "scheduled_task_create", args);
  expect(inner1.status).toBe("INPUT_REQUIRED");
  const inner2 = await mcp(sid, token, "scheduled_task_create", { ...args, grant_hash: inner1.grant.grant_hash });
  return { inner1, inner2 };
}
const defDebit = async (uid) => (await doOp(uid, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
const tasksOf = async (uid) => (await doOp(uid, { op: "tasks" })).tasks ?? [];
const mailList = async (email) => JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
const futureAt = (ms) => new Date(Date.now() + ms).toISOString();

describe("定时代付/订购 scheduled_purchase（跨场景联动）", () => {
  it("MCP 出卡（内容/场景/送给谁/商户/备注全字段化）→ 建单锁钱 → 到期扣款记购物流水 + 定时代付文案", async () => {
    const u = await registerUser(mailOf("sp1"), "代付甲");
    const before = await defDebit(u.user_id);
    const args = {
      task_type: "scheduled_purchase",
      item: "8 寸水果蛋糕",
      amount: "300.00",
      execute_at: futureAt(3600_000),
      repeat: "once",
      occasion: "生日",
      recipient_name: "妈妈",
      merchant: "演示烘焙坊",
      note: "少糖，11 月 3 日上午送到家",
    };
    const inner1 = await mcp("sp1", u.token, "scheduled_task_create", args);
    expect(inner1.status).toBe("INPUT_REQUIRED");
    /* 确认卡：仍走 transfer_confirmation，但 action/字段带 task_type 与结构化的"订购"信息 */
    expect(inner1.card.component).toBe("transfer_confirmation");
    expect(inner1.card.action).toBe("scheduled_task_create");
    expect(inner1.card.params.task_type).toBe("scheduled_purchase");
    expect(inner1.card.params.item).toBe("8 寸水果蛋糕");
    expect(inner1.card.params.occasion).toBe("生日");
    expect(inner1.card.params.recipient_name).toBe("妈妈");
    expect(inner1.card.params.merchant).toBe("演示烘焙坊");
    expect(inner1.card.params.note).toBe("少糖，11 月 3 日上午送到家");

    const inner2 = await mcp("sp1", u.token, "scheduled_task_create", { ...args, grant_hash: inner1.grant.grant_hash });
    expect(inner2.status).toBe("EXECUTED");
    /* §5.1 确定性 summary：按类型切换文案，模型照实复述 */
    expect(inner2.summary).toContain("定时代付");
    expect(inner2.summary).toContain("300.00");
    expect(inner2.summary).not.toContain("undefined");

    const task = (await tasksOf(u.user_id)).find((t) => t.type === "scheduled_purchase");
    expect(task).toBeTruthy();
    expect(task.status).toBe("PENDING");
    expect(task.payload.locked).toBe(true);
    expect(task.next_run_at).toBeTruthy();
    /* 标题由服务端拼装（模型不给也结构化落地）：给妈妈 · 生日 · 8 寸水果蛋糕 */
    expect(task.title).toBe("给妈妈 · 生日 · 8 寸水果蛋糕");

    /* 建单即锁定（赛题"当月锁定"语义） */
    const held = await defDebit(u.user_id);
    expect(BigInt(held.held_cents) - BigInt(before.held_cents)).toBe(toCents("300.00"));

    /* 建单邮件：按类型写"定时代付" */
    const mails1 = await mailList(u.email);
    expect(mails1.at(-1).subject).toContain("定时代付已建立");
    expect(mails1.at(-1).text).toContain("8 寸水果蛋糕");

    /* 到期履约（直接驱动 DO taskDue，绕开闹钟时序） */
    const due = await doOp(u.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("DONE");
    expect(due.tx_id).toBeTruthy();

    const after = await defDebit(u.user_id);
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents) - toCents("300.00"));
    expect(BigInt(after.held_cents)).toBe(BigInt(before.held_cents));

    /* 流水：购物类、对手方=模拟商户·内容、备注含送给谁/场景 */
    const txs = (await doOp(u.user_id, { op: "transfers", scope: "all" })).txs ?? [];
    const tx = txs.find((x) => x.id === due.tx_id);
    expect(tx).toBeTruthy();
    expect(tx.category).toBe("购物");
    expect(tx.counterparty).toBe("演示烘焙坊·8 寸水果蛋糕");
    expect(tx.memo).toContain("给 妈妈");
    expect(tx.memo).toContain("生日");

    /* 履约邮件/站内通知：定时代付口径（不是生日预订） */
    const mails2 = await mailList(u.email);
    expect(mails2.at(-1).subject).toContain("定时代付已履约");
    const notifs = (await doOp(u.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => (n.title ?? "") === "定时代付已履约")).toBe(true);
  }, 60000);

  it("生日别名回归：birthday_flowers 与 scheduled_purchase 同分支，文案仍为「生日预订」", async () => {
    const u = await registerUser(mailOf("sp2"), "生日乙");
    const before = await defDebit(u.user_id);
    const args = { task_type: "birthday_flowers", title: "爱人生日 · 鲜花预订", item: "鲜花礼盒", amount: "66.60", execute_at: futureAt(3600_000), repeat: "once" };
    const { inner2 } = await createTask("sp2", u.token, args);
    expect(inner2.status).toBe("EXECUTED");
    expect(inner2.summary).toContain("生日预订");
    const task = (await tasksOf(u.user_id)).find((t) => String(t.type).startsWith("birthday_flower"));
    expect(task).toBeTruthy();

    const due = await doOp(u.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("DONE");
    const after = await defDebit(u.user_id);
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents) - toCents("66.60"));
    const txs = (await doOp(u.user_id, { op: "transfers", scope: "all" })).txs ?? [];
    expect(txs.find((x) => x.id === due.tx_id).counterparty).toBe("演示商户·鲜花礼盒");
    const mails = await mailList(u.email);
    expect(mails.at(-1).subject).toContain("生日预订已履约");
    const notifs = (await doOp(u.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => (n.title ?? "") === "生日订花已履约")).toBe(true);
  }, 60000);

  it("preValidate：缺内容/缺时间/过去时间/缺金额/非正金额 → 结构化拒绝（不建单不锁钱）", async () => {
    const u = await registerUser(mailOf("sp3"), "校验丙");
    const sid = "sp3";
    const base = { task_type: "scheduled_purchase", item: "双人晚餐", amount: "800.00", execute_at: futureAt(86400_000) };

    const noItem = await mcp(sid, u.token, "scheduled_task_create", { ...base, item: undefined });
    expect(noItem.status).toBe("BLOCKED");
    expect(noItem.reason).toBe("INVALID_ARGS");
    expect(noItem.message).toContain("item");

    const noTime = await mcp(sid, u.token, "scheduled_task_create", { ...base, execute_at: undefined });
    expect(noTime.reason).toBe("INVALID_SCHEDULE_TIME");

    const past = await mcp(sid, u.token, "scheduled_task_create", { ...base, execute_at: new Date(Date.now() - 3600_000).toISOString() });
    expect(past.reason).toBe("INVALID_SCHEDULE_TIME");

    const noAmt = await mcp(sid, u.token, "scheduled_task_create", { ...base, amount: undefined });
    expect(noAmt.reason).toBe("INVALID_AMOUNT");

    const negAmt = await mcp(sid, u.token, "scheduled_task_create", { ...base, amount: "-5.00" });
    expect(negAmt.reason).toBe("INVALID_AMOUNT");

    /* 以上全部死在预检：没有任务、没有锁定 */
    expect((await tasksOf(u.user_id)).length).toBe(0);
    const card = await defDebit(u.user_id);
    expect(BigInt(card.held_cents)).toBe(0n);
  }, 60000);

  it("字段卫生与类型归一：note 截 200 / item 截 40 / 大小写与分隔符漂移回落 canonical 值", async () => {
    const u = await registerUser(mailOf("sp4"), "归一丁");
    const longItem = "超长内容".repeat(20); /* 80 字 → 截 40 */
    const longNote = "备注".repeat(200);    /* 400 字 → 截 200 */
    const args = {
      task_type: "Scheduled-Purchase",
      item: longItem,
      amount: "12.00",
      execute_at: futureAt(3600_000),
      note: longNote,
    };
    const inner1 = await mcp("sp4", u.token, "scheduled_task_create", args);
    expect(inner1.status).toBe("INPUT_REQUIRED");
    /* 类型归一后执行语义=定时代付（否则会当普通任务的裸类型放行、不锁钱） */
    expect(inner1.card.params.task_type).toBe("scheduled_purchase");
    expect(Array.from(inner1.card.params.item).length).toBe(40);
    expect(Array.from(inner1.card.params.note).length).toBe(200);

    /* 含空格写法同样归一 */
    const spaced = await mcp("sp4", u.token, "scheduled_task_create", { ...args, task_type: "scheduled purchase" });
    expect(spaced.card.params.task_type).toBe("scheduled_purchase");
  }, 60000);

  it("取消：PENDING 可取消并解锁一次；重复取消 409（不再二次解锁/二次通知）", async () => {
    const u = await registerUser(mailOf("sp5"), "取消戊");
    const before = await defDebit(u.user_id);
    const args = { task_type: "scheduled_purchase", item: "结婚纪念日晚餐", occasion: "结婚纪念日", amount: "520.00", execute_at: futureAt(86400_000) };
    const { inner2 } = await createTask("sp5", u.token, args);
    expect(inner2.status).toBe("EXECUTED");
    const task = (await tasksOf(u.user_id)).find((t) => t.type === "scheduled_purchase");
    expect(BigInt((await defDebit(u.user_id)).held_cents) - BigInt(before.held_cents)).toBe(toCents("520.00"));

    const c1 = await j(await post(`/api/tasks/${task.id}/cancel`, {}, u.token));
    expect(c1.ok).toBe(true);
    const mid = await defDebit(u.user_id);
    expect(BigInt(mid.held_cents)).toBe(BigInt(before.held_cents));
    expect((await tasksOf(u.user_id)).find((t) => t.id === task.id).status).toBe("CANCELLED");

    const c2 = await post(`/api/tasks/${task.id}/cancel`, {}, u.token);
    expect(c2.status).toBe(409);
    const again = await j(c2);
    expect(again.error).toBe("TASK_NOT_PENDING");
    expect(BigInt((await defDebit(u.user_id)).held_cents)).toBe(BigInt(before.held_cents));
  }, 60000);

  it("yearly：履约后按同额重锁（夹持到扣款后余额），任务回到 PENDING 并给出下一次执行", async () => {
    const u = await registerUser(mailOf("sp6"), "每年己");
    const before = await defDebit(u.user_id);
    const args = { task_type: "scheduled_purchase", item: "周年纪念花束", occasion: "结婚纪念日", amount: "188.00", execute_at: futureAt(3600_000), repeat: "yearly" };
    const { inner2 } = await createTask("sp6", u.token, args);
    expect(inner2.status).toBe("EXECUTED");
    const task = (await tasksOf(u.user_id)).find((t) => t.type === "scheduled_purchase");
    const due = await doOp(u.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("RESCHEDULED");
    expect(due.next_run_at).toBeTruthy();

    const after = await defDebit(u.user_id);
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents) - toCents("188.00"));
    /* 本期扣款后立即为明年重锁同额（held 回到建单时水位） */
    expect(BigInt(after.held_cents)).toBe(BigInt(before.held_cents) + toCents("188.00"));
    const t2 = (await tasksOf(u.user_id)).find((t) => t.id === task.id);
    expect(t2.status).toBe("PENDING");
    expect(t2.next_run_at).toBeTruthy();
    const notifs = (await doOp(u.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => (n.body ?? "").includes("明年同期"))).toBe(true);
  }, 60000);

  it("组合卡：plan_preview → batch_execute（定时代付 + 提前提醒）→ 一张卡两项，字段按类型分型", async () => {
    const u = await registerUser(mailOf("sp7"), "组合庚");
    const purchaseAt = futureAt(86400_000);
    const remindAt = futureAt(82800_000); /* 提前一小时提醒（仅测试时序合理性） */
    const planRes = await mcp("sp7", u.token, "plan_preview", { items: [
      { intent: "scheduled_task_create", args: { task_type: "scheduled_purchase", item: "生日蛋糕", amount: "268.00", execute_at: purchaseAt, occasion: "生日", recipient_name: "爸爸", merchant: "演示烘焙坊" } },
      { intent: "scheduled_task_create", args: { task_type: "reminder", title: "明天爸爸生日 · 记得取蛋糕", execute_at: remindAt } },
    ] });
    expect(planRes.ok).toBe(true);
    expect(planRes.plan).toHaveLength(2);
    expect(planRes.plan[0].summary).toContain("定时代付");
    expect(planRes.plan[0].summary).toContain("给 爸爸");
    expect(planRes.plan[1].summary).toContain("提醒");

    const inner1 = await mcp("sp7", u.token, "batch_execute", { items: planRes.plan });
    expect(inner1.status).toBe("INPUT_REQUIRED");
    expect(inner1.card.component).toBe("operations_package");
    const items = inner1.card.params.items;
    expect(items).toHaveLength(2);
    /* 项 1（代付）：不套"收款人/付款卡"，展示内容/场景/送给谁/商户 */
    const f1 = Object.fromEntries(items[0].fields);
    expect(f1.item).toBe("生日蛋糕");
    expect(f1.amount).toBe("¥ 268.00");
    expect(f1.occasion).toBe("生日");
    expect(f1.toPerson).toBe("爸爸");
    expect(f1.merchant).toBe("演示烘焙坊");
    expect(f1.payee).toBeUndefined();
    /* 项 2（提醒）：只展示提醒名与执行时间 */
    const f2 = Object.fromEntries(items[1].fields);
    expect(f2.name).toContain("记得取蛋糕");
    expect(f2.executeAt).toBeTruthy();

    const inner2 = await mcp("sp7", u.token, "batch_execute", { items: planRes.plan, grant_hash: inner1.grant.grant_hash });
    expect(inner2.status).toBe("EXECUTED");
    const tasks = await tasksOf(u.user_id);
    expect(tasks.some((t) => t.type === "scheduled_purchase" && t.payload.locked)).toBe(true);
    expect(tasks.some((t) => t.type === "reminder")).toBe(true);
  }, 60000);
});

describe("scheduled_purchase 月度循环（每月定期采购）", () => {
  it("monthly：履约后按同额重锁、排到下月；通知与邮件用「下月同期/每月模式」", async () => {
    const u = await registerUser(mailOf("sp8"), "每月辛");
    const before = await defDebit(u.user_id);
    const args = { task_type: "scheduled_purchase", item: "猫粮 5kg", occasion: "宠物月购", merchant: "演示宠物店", amount: "129.00", execute_at: futureAt(3600_000), repeat: "monthly" };
    const { inner2 } = await createTask("sp8", u.token, args);
    expect(inner2.status).toBe("EXECUTED");
    const task = (await tasksOf(u.user_id)).find((t) => t.type === "scheduled_purchase");
    const due = await doOp(u.user_id, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("RESCHEDULED");
    expect(Date.parse(due.next_run_at)).toBeGreaterThan(Date.now() + 29 * 86400000);

    const after = await defDebit(u.user_id);
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents) - toCents("129.00"));
    expect(BigInt(after.held_cents)).toBe(BigInt(before.held_cents) + toCents("129.00"));
    const t2 = (await tasksOf(u.user_id)).find((t) => t.id === task.id);
    expect(t2.status).toBe("PENDING");
    const notifs = (await doOp(u.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => (n.body ?? "").includes("下月同期"))).toBe(true);
    const mails = await mailList(u.email);
    expect(mails.at(-1).text).toContain("每月模式");
    expect(mails.at(-1).subject).toContain("定时代付已履约");
  }, 60000);
});
