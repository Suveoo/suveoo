import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** S4 越权拦截扩容（第一百三十一轮 · 板块一 Phase 1）：伪造/篡改/错位/跨用户/重用 grant 14 条。
 *  偏差说明：原案"301s 过期 grant"因 vitest 内 KV TTL 不可伪造时间，以"已消费 grant 重用"（GRANT_ALREADY_USED）
 *  与"伪造不存在的 grant"（GRANT_NOT_FOUND）双形态等价覆盖过期语义的不可用性。 */
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
  return (mails.at(-1)?.text ?? "").match(/\b\d{6}\b/)?.[0] ?? null;
}
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
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
  return { account: debit.number, name, token: out.token };
}
async function mcp(token, sid, id, name, args) {
  const r = await j(await post(`/mcp?sid=${sid}`, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, token));
  return JSON.parse(r.result.content[0].text);
}
const FAKE = "a".repeat(64);

describe("S4 越权拦截扩容", () => {
  it("伪造 grant（7 intents）：随机 64hex → 全部 BLOCKED，无一执行", async () => {
    const out = await registerUser("gf1@test.dev");
    const tgt = await realTarget("gf1-payee", "张三");
    /* 前置：种子账单（bill_pay/autopay_manage preValidate 需账单存在）；预冻一张卡（unfreeze 需 FROZEN 前置） */
    await doOp(`u:${out.user_id}`, { op: "seedDemo", txs: [], payees: [], bills: [{ id: "utility", name: "水费", category: "生活服务", amount_cents: "3000", due_day: 15, autopay: 0 }], subs: [], holdings: [], notifs: [], tasks: [] });
    const cards0 = await doOp(`u:${out.user_id}`, { op: "getCards" });
    const frozen = cards0.cards.find((c) => c.kind === "debit" && !Number(c.is_default));
    await doOp(`u:${out.user_id}`, { op: "setCardStatus", slug: frozen.slug, status: "FROZEN" });
    const calls = [
      ["transfer_execute", { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "50", currency: "CNY" }],
      ["card_freeze", { card_id: cards0.cards.find((c) => c.kind === "debit" && Number(c.is_default)).slug }],
      ["card_unfreeze", { card_id: frozen.slug }],
      ["card_limit_adjust", { card_id: cards0.cards.find((c) => c.kind === "debit" && Number(c.is_default)).slug, new_limit: "5000" }],
      ["bill_pay", { bill_id: "utility" }],
      ["payee_manage", { action: "add", payee: { name: "伪", account: tgt.account } }],
      ["autopay_manage", { bill_id: "utility", enabled: true }],
    ];
    let i = 0;
    let notFound = 0;
    for (const [name, args] of calls) {
      const parsed = await mcp(out.token, "gf1", ++i, name, { ...args, grant_hash: FAKE });
      expect(parsed.status, `${name} 伪造 grant 必须被拒`).toBe("BLOCKED");
      /* 伪造也计入 grant 熔断计数：前若干条 GRANT_NOT_FOUND，连错达阈值后整段 CIRCUIT_LOCKED（防扫行为，同样算拦截成功） */
      expect(["GRANT_NOT_FOUND", "CIRCUIT_LOCKED"]).toContain(parsed.reason);
      if (parsed.reason === "GRANT_NOT_FOUND") notFound++;
    }
    expect(i).toBe(7);
    expect(notFound).toBeGreaterThanOrEqual(3);
    const list = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(list.txs.some((t) => t.amount_cents === "5000")).toBe(false);
  }, 60000);

  it("篡改金额（2）：grant 绑 ¥10，二段改 ¥1000 / 改收款人 → 全部 BLOCKED", async () => {
    const out = await registerUser("gf2@test.dev");
    const tgt = await realTarget("gf2-payee", "李四");
    const other = await realTarget("gf2-other", "攻击者");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" };
    const c1 = await mcp(out.token, "gf2", 1, "transfer_execute", args);
    expect(c1.status).toBe("INPUT_REQUIRED");
    const m1 = await mcp(out.token, "gf2", 2, "transfer_execute", { ...args, amount: "1000", grant_hash: c1.grant.grant_hash });
    expect(m1.status).toBe("BLOCKED");
    const m2 = await mcp(out.token, "gf2", 3, "transfer_execute", { ...args, recipient: `acct:${other.account}`, recipient_name: "攻击者", grant_hash: c1.grant.grant_hash });
    expect(m2.status).toBe("BLOCKED");
  }, 30000);

  it("红级缺 OTP（2）：freeze / loss_report 带 grant 无 otp → OTP_REQUIRED 不执行", async () => {
    const out = await registerUser("gf3@test.dev");
    const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
    const def = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default));
    const other = cards.cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    const f1 = await mcp(out.token, "gf3", 1, "card_freeze", { card_id: other.slug });
    expect(f1.status).toBe("INPUT_REQUIRED");
    const f2 = await mcp(out.token, "gf3", 2, "card_freeze", { card_id: other.slug, grant_hash: f1.grant.grant_hash });
    expect(f2.status).toBe("OTP_REQUIRED");
    const l1 = await mcp(out.token, "gf3", 3, "card_loss_report", { card_id: other.slug, replace_new: false, pay_card: def.slug });
    expect(l1.status).toBe("INPUT_REQUIRED");
    const l2 = await mcp(out.token, "gf3", 4, "card_loss_report", { card_id: other.slug, replace_new: false, pay_card: def.slug, grant_hash: l1.grant.grant_hash });
    expect(l2.status).toBe("OTP_REQUIRED");
    const after = await doOp(`u:${out.user_id}`, { op: "getCards" });
    expect(after.cards.find((c) => c.slug === other.slug).status).toBe("ACTIVE");
  }, 30000);

  it("黄级冒充红级字段（1）：transfer ¥50 夹带 otp 字段 → 仍黄级两段式，otp 为惰性字段", async () => {
    const out = await registerUser("gf4@test.dev");
    const tgt = await realTarget("gf4-payee", "王五");
    const parsed = await mcp(out.token, "gf4", 1, "transfer_execute", {
      recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "50", currency: "CNY", otp: "123456", tier: "RED",
    });
    expect(parsed.status).toBe("INPUT_REQUIRED");
    expect(parsed.card?.tier ?? parsed.tier).toBe("YELLOW");
  }, 30000);

  it("跨用户 grant（1）：A 的 grant 用在 B → BLOCKED", async () => {
    const a = await registerUser("gf5a@test.dev", "甲");
    const b = await registerUser("gf5b@test.dev", "乙");
    const tgt = await realTarget("gf5-payee", "张三");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "50", currency: "CNY" };
    const c1 = await mcp(a.token, "gf5", 1, "transfer_execute", args);
    expect(c1.status).toBe("INPUT_REQUIRED");
    const stolen = await mcp(b.token, "gf5", 2, "transfer_execute", { ...args, grant_hash: c1.grant.grant_hash });
    expect(stolen.status).toBe("BLOCKED");
  }, 30000);

  it("已消费 grant 重用（1）：EXECUTED 后同 grant 再来 → GRANT_ALREADY_USED", async () => {
    const out = await registerUser("gf6@test.dev");
    const tgt = await realTarget("gf6-payee", "赵六");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "50", currency: "CNY" };
    const c1 = await mcp(out.token, "gf6", 1, "transfer_execute", args);
    const c2 = await mcp(out.token, "gf6", 2, "transfer_execute", { ...args, grant_hash: c1.grant.grant_hash });
    expect(c2.status).toBe("EXECUTED");
    const c3 = await mcp(out.token, "gf6", 3, "transfer_execute", { ...args, grant_hash: c1.grant.grant_hash });
    expect(c3.status).toBe("BLOCKED");
    expect(c3.reason).toBe("GRANT_ALREADY_USED");
    /* 账本仅一笔 */
    const list = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(list.txs.filter((t) => t.counterparty === "赵六").length).toBe(1);
  }, 30000);
});
