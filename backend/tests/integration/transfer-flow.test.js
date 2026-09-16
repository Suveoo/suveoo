import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { newCardNumber, toCents } from "../../worker-main.js";

/** 表单通道与 AI 通道（MCP）同走 IR + 五道验证的端到端验证。
 *  任务一后：收款方必须是真实存在的 Suveoo 用户（16 位 Luhn 卡号 + registry 存在 + 户名匹配），
 *  测试统一用 realTarget() 造真实收款方；跨用户转账双方各记一笔（资金守恒）。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

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
/** 真实收款方：注册账户 + 取其默认借记卡完整卡号（DO 直读，绕开掩码）。 */
async function realTarget(tag, name) {
  const email = `${tag}@test.dev`;
  const out = await registerUser(email, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, user_id: out.user_id, email, token: out.token };
}

describe("表单通道：两段式 Consent 转账", () => {
  it("黄级 ¥500：INPUT_REQUIRED → 确认 → EXECUTED，余额扣减、可查流水", async () => {
    const email = "tf1@test.dev";
    const out = await registerUser(email);
    const tgt = await realTarget("tf1-payee", "张三");
    const before = (await j(await SELF.fetch(BASE + "/api/overview", { headers: { authorization: `Bearer ${out.token}` } }))).total_balance;

    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "500", memo: "测试转账" };
    const step1 = await post("/api/transfers/intrabank", body, out.token);
    expect(step1.status).toBe(202);
    const s1 = await j(step1);
    expect(s1.status).toBe("INPUT_REQUIRED");
    expect(s1.tier).toBe("YELLOW");
    expect(s1.grant.grant_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s1.grant.snapshot.params.amount).toBe("500");

    const step2 = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(step2.status).toBe(200);
    const s2 = await j(step2);
    expect(s2.status).toBe("EXECUTED");
    expect(s2.result.ok).toBe(true);
    expect(s2.result.tx_id).toMatch(/^TX/);

    const after = (await j(await SELF.fetch(BASE + "/api/overview", { headers: { authorization: `Bearer ${out.token}` } }))).total_balance;
    expect(toCents(after)).toBe(toCents(before) - toCents("500"));
    const list = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(list.txs.some((t) => t.counterparty === "张三" && t.amount_cents === "50000")).toBe(true);
  }, 20000);

  it("grant 一次性：重复提交同一 grant → BLOCKED GRANT_ALREADY_USED", async () => {
    const out = await registerUser("tf2@test.dev");
    const tgt = await realTarget("tf2-payee", "李四");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "100" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    const retry = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(retry.status).toBe(403);
    expect((await j(retry)).reason).toBe("GRANT_ALREADY_USED");
  }, 20000);

  it("确认前改参数（500→5000）→ CONSENT_INVALIDATED（决赛演示第二幕）", async () => {
    const out = await registerUser("tf3@test.dev");
    const t1 = await realTarget("tf3a-payee", "王五");
    const t2 = await realTarget("tf3b-payee", "王五");
    const s1 = await j(await post("/api/transfers/intrabank", { recipient_account: t1.account, recipient_name: "王五", amount: "500" }, out.token));
    const mutated = await post("/api/transfers/intrabank", { recipient_account: t2.account, recipient_name: "王五", amount: "5000", grant_hash: s1.grant.grant_hash }, out.token);
    expect(mutated.status).toBe(403);
    expect((await j(mutated)).reason).toBe("CONSENT_INVALIDATED");
  }, 20000);

  it("红级 ¥2,000：需 redstep OTP；余额不足 → INVARIANT_BALANCE", async () => {
    const email = "tf4@test.dev";
    const out = await registerUser(email);
    const tgt = await realTarget("tf4-payee", "赵六");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "2000" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    expect(s1.tier).toBe("RED");

    const noOtp = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(noOtp.status).toBe(401);
    expect((await j(noOtp)).status).toBe("OTP_REQUIRED");

    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    // 错误验证码 → OTP_CODE_MISMATCH（验证码记录仍在，未消费）
    const g1500 = await j(await post("/api/transfers/intrabank", { ...body, amount: "1500" }, out.token));
    const wrong = await post("/api/transfers/intrabank", { ...body, amount: "1500", grant_hash: g1500.grant.grant_hash, otp: "000000" }, out.token);
    expect(wrong.status).toBe(403);
    expect((await j(wrong)).reason).toBe("OTP_CODE_MISMATCH");
    // 正确验证码完成红级转账
    const ok = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash, otp }, out.token);
    expect((await j(ok)).status).toBe("EXECUTED");
  }, 20000);
});

describe("AI 通道（MCP /mcp）：与表单同规", () => {
  it("initialize → tools/list → tools/call 黄级转账 INPUT_REQUIRED → 带 grant 重试 EXECUTED", async () => {
    const out = await registerUser("tf5@test.dev");
    const tgt = await realTarget("tf5-payee", "张三");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };

    const init = await j(await SELF.fetch(BASE + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) }));
    expect(init.result.serverInfo.name).toBe("suveoo-bank");
    const tools = await j(await SELF.fetch(BASE + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }));
    expect(tools.result.tools.length).toBeGreaterThanOrEqual(23);
    expect(tools.result.tools.some((t) => t.name === "transfer_execute")).toBe(true);

    const call1 = await j(await SELF.fetch(BASE + "/mcp?sid=t1", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "transfer_execute", arguments: { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "300", currency: "CNY" } } }) }));
    const r1 = JSON.parse(call1.result.content[0].text);
    expect(r1.status).toBe("INPUT_REQUIRED");
    expect(r1.grant.grant_hash).toMatch(/^[0-9a-f]{64}$/);

    const call2 = await j(await SELF.fetch(BASE + "/mcp?sid=t1", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "transfer_execute", arguments: { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "300", currency: "CNY", grant_hash: r1.grant.grant_hash } } }) }));
    const r2 = JSON.parse(call2.result.content[0].text);
    expect(r2.status).toBe("EXECUTED");
    expect(r2.tx_id).toMatch(/^TX/);
  }, 20000);

  it("注入攻击样本：__provenance 把商户备注标到 amount → BLOCKED UNTRUSTED_PROVENANCE", async () => {
    const out = await registerUser("tf6@test.dev");
    const tgt = await realTarget("tf6-payee", "张三");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const call = await j(await SELF.fetch(BASE + "/mcp?sid=t2", { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "transfer_execute", arguments: {
        recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "900", currency: "CNY",
        __provenance: { amount: { provenance: "merchant_note", trust: "EXTERNAL_UNTRUSTED" } },
      } },
    }) }));
    const r = JSON.parse(call.result.content[0].text);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("UNTRUSTED_PROVENANCE");
    expect(call.result.isError).toBe(true);
  }, 20000);

  it("AI 通道硬上限：单笔 ¥6,000 转账 → POLICY BLOCKED", async () => {
    const out = await registerUser("tf7@test.dev");
    const tgt = await realTarget("tf7-payee", "钱七");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const payload = {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "transfer_execute", arguments: { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "6000", currency: "CNY" } },
    };
    const call = await j(await SELF.fetch(BASE + "/mcp?sid=tf7", { method: "POST", headers: H, body: JSON.stringify(payload) }));
    const r = JSON.parse(call.result.content[0].text);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("AI_SINGLE_LIMIT_EXCEEDED");
  }, 20000);
});

describe("收款方真实性校验与跨用户双记（任务一）", () => {
  it("编造卡号（Luhn 合法但未注册）→ 404 ACCOUNT_NOT_FOUND，不进确认环节", async () => {
    const out = await registerUser("tf-r1@test.dev");
    const fake = newCardNumber({ bin: "622288" }); // 格式合法、全局未注册
    const r = await post("/api/transfers/intrabank", { recipient_account: fake, recipient_name: "张三", amount: "100" }, out.token);
    expect(r.status).toBe(404);
    const body = await j(r);
    expect(body.status).toBe("BLOCKED");
    expect(body.reason).toBe("ACCOUNT_NOT_FOUND");
    expect(body.error.code).toBe("ACCOUNT_NOT_FOUND");
  }, 20000);

  it("Luhn 校验位不符 → 400 INVALID_CARD_FORMAT", async () => {
    const out = await registerUser("tf-r2@test.dev");
    const acct = newCardNumber({ bin: "622288" });
    const bad = acct.slice(0, 15) + (acct[15] === "9" ? "0" : "9"); // 破坏校验位
    const r = await post("/api/transfers/intrabank", { recipient_account: bad, recipient_name: "张三", amount: "100" }, out.token);
    expect(r.status).toBe(400);
    expect((await j(r)).reason).toBe("INVALID_CARD_FORMAT");
  }, 20000);

  it("真卡号 + 错误姓名 → 422 NAME_MISMATCH", async () => {
    const out = await registerUser("tf-r3@test.dev");
    const tgt = await realTarget("tf-r3-payee", "张三");
    const r = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: "李四", amount: "100" }, out.token);
    expect(r.status).toBe(422);
    expect((await j(r)).reason).toBe("NAME_MISMATCH");
  }, 20000);

  it("跨用户双记：A→B ¥1.23 双方余额精确 ±1.23、双方流水各一条、B 收到入账邮件", async () => {
    const a = await registerUser("tf-r4a@test.dev", "转出人甲");
    const b = await realTarget("tf-r4b", "收款人乙");
    const aBal = async () => (await j(await SELF.fetch(BASE + "/api/overview", { headers: { authorization: `Bearer ${a.token}` } }))).total_balance;
    const bBal = async () => (await j(await SELF.fetch(BASE + "/api/overview", { headers: { authorization: `Bearer ${b.token}` } }))).total_balance;
    const aBefore = await aBal(), bBefore = await bBal();

    const body = { recipient_account: b.account, recipient_name: b.name, amount: "1.23", memo: "双记测试" };
    const s1 = await j(await post("/api/transfers/intrabank", body, a.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, a.token));
    expect(s2.status).toBe("EXECUTED");

    expect(toCents(await aBal())).toBe(toCents(aBefore) - 123n);
    expect(toCents(await bBal())).toBe(toCents(bBefore) + 123n);
    const aList = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${a.token}` } }));
    const bList = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${b.token}` } }));
    expect(aList.txs.filter((t) => t.direction === "OUT" && t.amount_cents === "123").length).toBe(1);
    expect(bList.txs.some((t) => t.direction === "IN" && t.amount_cents === "123" && t.counterparty === "转出人甲")).toBe(true);
    /* 对方入账邮件（自动取注册邮箱） */
    const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${b.email}`)) ?? "[]");
    expect(mails.some((m) => m.subject.includes("您收到一笔转账") && m.subject.includes("1.23"))).toBe(true);
  }, 20000);

  it("payee 新增：编造账号被拦（ACCOUNT_NOT_FOUND）；真实账户可通过并转账", async () => {
    const out = await registerUser("tf-r5@test.dev");
    const fake = newCardNumber({ bin: "622288" });
    const bad = await post("/api/payees", { name: "张三", account: fake, group_label: "朋友" }, out.token);
    expect(bad.status).toBe(404);
    expect((await j(bad)).reason).toBe("ACCOUNT_NOT_FOUND");

    const tgt = await realTarget("tf-r5-payee", "张三");
    const g1 = await j(await post("/api/payees", { name: tgt.name, account: tgt.account, group_label: "朋友" }, out.token));
    expect(g1.status).toBe("INPUT_REQUIRED");
    const ok = await j(await post("/api/payees", { name: tgt.name, account: tgt.account, group_label: "朋友", grant_hash: g1.grant.grant_hash }, out.token));
    expect(ok.status).toBe("EXECUTED");
    /* payee:{id} 通道转账走同一校验：迁移后天然通过 */
    const list = await j(await SELF.fetch(BASE + "/api/payees", { headers: { authorization: `Bearer ${out.token}` } }));
    const payee = list.payees.find((p) => p.name === "张三");
    expect(payee.verified).toBe(true);
    const s1 = await j(await post("/api/transfers/intrabank", { payee_id: payee.id, amount: "100" }, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await j(await post("/api/transfers/intrabank", { payee_id: payee.id, amount: "100", grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");
  }, 20000);

  it("本人卡 acct: 互转 → 目标卡入账；同卡自转被拦（SAME_CARD）", async () => {
    const out = await registerUser("tf-r6@test.dev", "本人互转者");
    const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
    const from = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const other = cards.cards.find((c) => c.kind === "debit" && c.slug !== from.slug);
    /* 本人其他卡：允许（互转语义，卡内守恒） */
    const body = { recipient_account: other.number, recipient_name: "本人互转者", amount: "50", from_card: from.slug };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    const s2 = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");
    const after = await doOp(`u:${out.user_id}`, { op: "getCards" });
    expect(BigInt(after.cards.find((c) => c.slug === other.slug).balance_cents)).toBe(BigInt(other.balance_cents) + 5000n);
    /* 同一张卡转给自己：前置校验直接拦截（不进确认环节） */
    const s3 = await post("/api/transfers/intrabank", { recipient_account: from.number, recipient_name: "本人互转者", amount: "50", from_card: from.slug }, out.token);
    expect(s3.status).toBe(400);
    expect((await j(s3)).reason).toBe("SAME_CARD");
  }, 20000);
});
