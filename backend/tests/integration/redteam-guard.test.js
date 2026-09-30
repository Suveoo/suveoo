import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { MCP_TOOLS } from "../../worker-main.js";

/** 第十三期红队测试（qwen3.7-flash 档全量矩阵）抓出问题的守卫固化。
 *  生产复现证据见 notes/redteam-qwen.md：
 *  - P0：裸姓名/裸收款人 id 转账——preValidate 曾免检放行（!account → return null），
 *    执行时无对手方账户只扣款不入账（¥12.34 / ¥600 两笔实测凭空消失）。
 *  - P1：birthday_flowers 缺 execute_at 建出永不执行的孤儿任务并白锁资金（next_run_at=null + summary 漏 undefined）。
 *  - P2："日限额调成无限"被模型折算成 0 出卡，确认即自锁。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  const r = await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
  return j(r);
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
async function realTarget(tag, name) {
  const email = `${tag}@test.dev`;
  const out = await registerUser(email, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, user_id: out.user_id, email, token: out.token };
}
/** AI/MCP 通道工具调用（与生产红队复现完全同路径） */
async function mcp(token, name, args, sid = "rt-test") {
  const r = await post(`/mcp?sid=${sid}`, { id: 1, method: "tools/call", params: { name, arguments: args } }, token);
  const body = await j(r);
  const text = body?.result?.content?.[0]?.text ?? "{}";
  return { isError: !!body?.result?.isError, ...(() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() };
}
const debitOf = async (userId) => {
  const cards = await doOp(`u:${userId}`, { op: "getCards" });
  return cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
};

describe("P0：裸收款人转账黑洞（归一或拒绝，绝不无对手方扣款）", () => {
  it("裸姓名且唯一匹配已验证收款人 → 服务端归一为 payee:<id>，执行后对方真实入账（资金守恒）", async () => {
    const out = await registerUser("rt-p0a@test.dev");
    const tgt = await realTarget("rt-p0a-payee", "李四");
    /* 添加收款人（两段式） */
    const add1 = await mcp(out.token, "payee_manage", { action: "add", payee: { name: "李四", account: tgt.account } });
    expect(add1.status).toBe("INPUT_REQUIRED");
    const add2 = await mcp(out.token, "payee_manage", { action: "add", payee: { name: "李四", account: tgt.account }, grant_hash: add1.grant.grant_hash });
    expect(add2.status).toBe("EXECUTED");

    const tgtBefore = await debitOf(tgt.user_id);
    /* 裸姓名转账：修复前免检出卡、执行只扣款不入账；修复后出卡即归一 */
    const g1 = await mcp(out.token, "transfer_execute", { recipient: "李四", amount: "12.34" });
    expect(g1.status).toBe("INPUT_REQUIRED");
    expect(g1.grant.snapshot.params.recipient).toMatch(/^payee:\d+$/);
    const g2 = await mcp(out.token, "transfer_execute", { ...g1.grant.snapshot.params, grant_hash: g1.grant.grant_hash });
    expect(g2.status).toBe("EXECUTED");
    /* 对方默认借记卡真实入账——修复前这里不成立（资金消失） */
    const tgtAfter = await debitOf(tgt.user_id);
    expect(BigInt(tgtAfter.balance_cents) - BigInt(tgtBefore.balance_cents)).toBe(1234n);
  });

  it("裸收款人 id（模型格式滑落如 \"607\"）→ 归一为对应 payee；未知姓名/未知 id → BIZ_REJECT 且不出卡", async () => {
    const out = await registerUser("rt-p0b@test.dev");
    const tgt = await realTarget("rt-p0b-payee", "王五");
    const add1 = await mcp(out.token, "payee_manage", { action: "add", payee: { name: "王五", account: tgt.account } });
    const add2 = await mcp(out.token, "payee_manage", { action: "add", payee: { name: "王五", account: tgt.account }, grant_hash: add1.grant.grant_hash });
    expect(add2.status).toBe("EXECUTED");
    const payeeId = add2.payee?.id ?? (await SELF.fetch(BASE + "/api/payees", { headers: { authorization: `Bearer ${out.token}` } }).then(j)).payees.find((p) => p.name === "王五").id;

    /* 裸数字 id：生产实测模型两次传 "607"（无 payee: 前缀）→ 归一 */
    const gId = await mcp(out.token, "transfer_execute", { recipient: String(payeeId), amount: "5.00" });
    expect(gId.status).toBe("INPUT_REQUIRED");
    expect(gId.grant.snapshot.params.recipient).toBe(`payee:${payeeId}`);

    /* 未知姓名：拒绝并引导（不得出卡） */
    const gUnknown = await mcp(out.token, "transfer_execute", { recipient: "赵六", amount: "5.00" });
    expect(gUnknown.isError).toBe(true);
    expect(gUnknown.status).toBe("BLOCKED");
    expect(gUnknown.reason).toBe("RECIPIENT_UNRESOLVED");
    expect(gUnknown.message).toContain("contacts_search");

    /* 未知数字：同样拒绝 */
    const gNum = await mcp(out.token, "transfer_execute", { recipient: "999999", amount: "5.00" });
    expect(gNum.reason).toBe("RECIPIENT_UNRESOLVED");
  });
});

describe("P1：birthday_flowers 缺 execute_at/item 前置拒绝", () => {
  it("缺 execute_at 与 item → BIZ_REJECT（不再产出 next_run_at=null 的孤儿锁定任务）", async () => {
    const out = await registerUser("rt-bd1@test.dev");
    const r = await mcp(out.token, "scheduled_task_create", { task_type: "birthday_flowers", amount: "48.00" });
    expect(r.isError).toBe(true);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("INVALID_ARGS");
    expect(r.message).toContain("item");
  });
  it("有 item 缺 execute_at → 同样拒绝并提示 +08:00 写法", async () => {
    const out = await registerUser("rt-bd2@test.dev");
    const r = await mcp(out.token, "scheduled_task_create", { task_type: "birthday_flowers", item: "一束鲜花", amount: "48.00" });
    expect(r.reason).toBe("INVALID_SCHEDULE_TIME");
    expect(r.message).toContain("+08:00");
  });
  it("要素齐 → 出卡 → 确认后任务带 next_run_at 且资金锁定", async () => {
    const out = await registerUser("rt-bd3@test.dev");
    const before = await debitOf(out.user_id);
    const when = new Date(Date.now() + 3 * 86400000).toISOString().replace("Z", "+08:00");
    const args = { task_type: "birthday_flowers", item: "一束鲜花", amount: "48.00", execute_at: when, repeat: "once" };
    const g1 = await mcp(out.token, "scheduled_task_create", args);
    expect(g1.status).toBe("INPUT_REQUIRED");
    const g2 = await mcp(out.token, "scheduled_task_create", { ...args, grant_hash: g1.grant.grant_hash });
    expect(g2.status).toBe("EXECUTED");
    expect(g2.summary).not.toContain("undefined");
    const tasks = (await doOp(`u:${out.user_id}`, { op: "tasks" })).tasks ?? [];
    const t = tasks.find((x) => x.type === "birthday_flowers");
    expect(t).toBeTruthy();
    expect(t.next_run_at).toBeTruthy();
    const after = await debitOf(out.user_id);
    expect(BigInt(after.held_cents) - BigInt(before.held_cents)).toBe(4800n);
  });
});

describe("P2：card_limit_adjust 拒绝非正数（\"无限\"→0 自锁）", () => {
  it("new_daily_limit=0 → BIZ_REJECT；\"无限\"等非数值 → BIZ_REJECT；合法值 → 出卡", async () => {
    const out = await registerUser("rt-lim@test.dev");
    const card = await debitOf(out.user_id);
    const zero = await mcp(out.token, "card_limit_adjust", { card_id: card.slug, new_daily_limit: "0" });
    expect(zero.isError).toBe(true);
    expect(zero.reason).toBe("INVALID_AMOUNT");
    const inf = await mcp(out.token, "card_limit_adjust", { card_id: card.slug, new_daily_limit: "无限" });
    expect(inf.reason).toBe("INVALID_AMOUNT");
    const ok1 = await mcp(out.token, "card_limit_adjust", { card_id: card.slug, new_daily_limit: "5000.00" });
    expect(ok1.status).toBe("INPUT_REQUIRED");
  });
});

describe("desc 修复锚点（第十三期话术/语义引导，预算 ≤5600 由 reminder-task.test 锁定）", () => {
  it("transfer_execute：卡号优先/勿静默改额/改口出新卡/未执行不得宣称已转账/仅本人资金", () => {
    const d = MCP_TOOLS.find((t) => t.name === "transfer_execute").desc;
    for (const phrase of ["禁丢弃卡号", "勿静默改额", "重新调用出新卡", "不得宣称已转账", "仅转出本人资金"]) {
      expect(d, phrase).toContain(phrase);
    }
  });
  it("goal_create/goal_adjust 暴露 auto_monthly（红队实测 desc 缺失致\"每月自动存\"落空）", () => {
    const gc = MCP_TOOLS.find((t) => t.name === "goal_create");
    expect(gc.desc).toContain("auto_monthly=true");
    expect(gc.args.auto_monthly).toEqual({ type: "boolean" });
    expect(MCP_TOOLS.find((t) => t.name === "goal_adjust").desc).toContain("auto_monthly");
  });
  it("scheduled_task_create 生日预订注明 execute_at 必传；transaction_history 注明 UTC→北京；site_guide 注明客服渠道防编造热线", () => {
    expect(MCP_TOOLS.find((t) => t.name === "scheduled_task_create").desc).toContain("三项缺一会被拒绝");
    expect(MCP_TOOLS.find((t) => t.name === "transaction_history").desc).toContain("北京时间");
    expect(MCP_TOOLS.find((t) => t.name === "site_guide").desc).toContain("955xx");
  });
});
