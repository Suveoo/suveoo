import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { randomHex } from "../../worker-main.js";

/** 同意篡改攻击：grant 签发后任意篡改授权字段 → CONSENT_INVALIDATED / GRANT_NOT_FOUND，绝不重算放行。
 *  任务一后收款方须为真实 Suveoo 账户（攻击载荷也用真实账户——现实中攻击者换成自己的账户更逼真），断言语义不变。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

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
async function registerUser(email, name = "攻击者") {
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

describe("同意篡改攻击", () => {
  it("收款人替换攻击：同金额换收款账号 → CONSENT_INVALIDATED", async () => {
    const out = await registerUser("cm1@test.dev");
    const victim = await realTarget("cm1-victim", "张三");
    const attacker = await realTarget("cm1-attacker", "张三"); // 攻击者的真实账户（同名不同卡）
    const body = { recipient_account: victim.account, recipient_name: "张三", amount: "300" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    // 攻击者把收款账号换成自己的，金额不变以绕过金额比对
    const attacked = await post("/api/transfers/intrabank", { ...body, recipient_account: attacker.account, grant_hash: s1.grant.grant_hash }, out.token);
    expect(attacked.status).toBe(403);
    expect((await j(attacked)).reason).toBe("CONSENT_INVALIDATED");
  });

  it("备注字段非授权字段：改 memo 不触发失效（设计如此——memo 不影响资金安全）", async () => {
    const out = await registerUser("cm2@test.dev");
    const tgt = await realTarget("cm2-payee", "李四");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "100", memo: "房租" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    const attacked = await post("/api/transfers/intrabank", { ...body, memo: "房租+再转500", grant_hash: s1.grant.grant_hash }, out.token);
    // grant 只绑定 authFields（recipient/amount/currency），memo 是展示性字段
    expect(attacked.status).toBe(200);
    expect((await j(attacked)).status).toBe("EXECUTED");
    // 对照：同请求改 amount → 立即失效
    const amountTamper = await post("/api/transfers/intrabank", { ...body, amount: "1000", grant_hash: (await j(await post("/api/transfers/intrabank", body, out.token))).grant.grant_hash }, out.token);
    expect((await j(amountTamper)).reason).toBe("CONSENT_INVALIDATED");
  });

  it("伪造 grant_hash（随机 64 hex）→ GRANT_NOT_FOUND，且不放行执行", async () => {
    const out = await registerUser("cm3@test.dev");
    const tgt = await realTarget("cm3-payee", "王五");
    const forged = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "300", grant_hash: randomHex(32) }, out.token);
    expect(forged.status).toBe(403);
    const r = await j(forged);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("GRANT_NOT_FOUND");
  });

  it("红级 OTP 途中改参数 → 篡改判定优先于 OTP 校验（CONSENT_INVALIDATED）", async () => {
    const email = "cm4@test.dev";
    const out = await registerUser(email);
    const tgt = await realTarget("cm4-payee", "赵六");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "2000" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    expect(s1.tier).toBe("RED");
    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    // 攻击者在拿到合法 OTP 后把金额改大，再携带正确 OTP 提交
    const attacked = await post("/api/transfers/intrabank", { ...body, amount: "4999", grant_hash: s1.grant.grant_hash, otp }, out.token);
    expect(attacked.status).toBe(403);
    expect((await j(attacked)).reason).toBe("CONSENT_INVALIDATED");
  });

  it("MCP 通道同样防篡改：AI 工具参数与 grant 快照不一致 → BLOCKED", async () => {
    const out = await registerUser("cm5@test.dev");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const tgt = await realTarget("cm5-payee", "张三");
    const call1 = await j(await SELF.fetch(BASE + "/mcp?sid=cm5", { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "transfer_execute", arguments: { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "300", currency: "CNY" } },
    }) }));
    const grant = JSON.parse(call1.result.content[0].text).grant.grant_hash;
    // 模型被注入后篡改金额重试
    const call2 = await j(await SELF.fetch(BASE + "/mcp?sid=cm5", { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "transfer_execute", arguments: { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "3000", currency: "CNY", grant_hash: grant } },
    }) }));
    const r = JSON.parse(call2.result.content[0].text);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("CONSENT_INVALIDATED");
    expect(call2.result.isError).toBe(true);
  });
});
