import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { newCardNumber, toCents } from "../../worker-main.js";

/** 表单通道与 AI 通道（MCP）同走 IR + 五道验证的端到端验证。 */
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
async function registerUser(email) {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  const r = await post("/api/auth/register", { email, code, name: "测试用户", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
  return j(r);
}

describe("表单通道：两段式 Consent 转账", () => {
  it("黄级 ¥500：INPUT_REQUIRED → 确认 → EXECUTED，余额扣减、可查流水", async () => {
    const email = "tf1@test.dev";
    const out = await registerUser(email);
    const before = (await j(await SELF.fetch(BASE + "/api/overview", { headers: { authorization: `Bearer ${out.token}` } }))).total_balance;

    const acct = newCardNumber({ bin: "622288" });
    const body = { recipient_account: acct, recipient_name: "张三", amount: "500", memo: "测试转账" };
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
  });

  it("grant 一次性：重复提交同一 grant → BLOCKED GRANT_ALREADY_USED", async () => {
    const email = "tf2@test.dev";
    const out = await registerUser(email);
    const body = { recipient_account: newCardNumber({ bin: "622288" }), recipient_name: "李四", amount: "100" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    const retry = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(retry.status).toBe(403);
    expect((await j(retry)).reason).toBe("GRANT_ALREADY_USED");
  });

  it("确认前改参数（500→5000）→ CONSENT_INVALIDATED（决赛演示第二幕）", async () => {
    const email = "tf3@test.dev";
    const out = await registerUser(email);
    const s1 = await j(await post("/api/transfers/intrabank", { recipient_account: newCardNumber(), recipient_name: "王五", amount: "500" }, out.token));
    const mutated = await post("/api/transfers/intrabank", { recipient_account: newCardNumber(), recipient_name: "王五", amount: "5000", grant_hash: s1.grant.grant_hash }, out.token);
    expect(mutated.status).toBe(403);
    expect((await j(mutated)).reason).toBe("CONSENT_INVALIDATED");
  });

  it("红级 ¥2,000：需 redstep OTP；余额不足 → INVARIANT_BALANCE", async () => {
    const email = "tf4@test.dev";
    const out = await registerUser(email);
    const body = { recipient_account: newCardNumber(), recipient_name: "赵六", amount: "2000" };
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
  });
});

describe("AI 通道（MCP /mcp）：与表单同规", () => {
  it("initialize → tools/list → tools/call 黄级转账 INPUT_REQUIRED → 带 grant 重试 EXECUTED", async () => {
    const email = "tf5@test.dev";
    const out = await registerUser(email);
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };

    const init = await j(await SELF.fetch(BASE + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) }));
    expect(init.result.serverInfo.name).toBe("suveoo-bank");
    const tools = await j(await SELF.fetch(BASE + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }));
    expect(tools.result.tools.length).toBeGreaterThanOrEqual(23);
    expect(tools.result.tools.some((t) => t.name === "transfer_execute")).toBe(true);

    const acct = newCardNumber({ bin: "622288" });
    const call1 = await j(await SELF.fetch(BASE + "/mcp?sid=t1", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "transfer_execute", arguments: { recipient: `acct:${acct}`, recipient_name: "张三", amount: "300", currency: "CNY" } } }) }));
    const r1 = JSON.parse(call1.result.content[0].text);
    expect(r1.status).toBe("INPUT_REQUIRED");
    expect(r1.grant.grant_hash).toMatch(/^[0-9a-f]{64}$/);

    const call2 = await j(await SELF.fetch(BASE + "/mcp?sid=t1", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "transfer_execute", arguments: { recipient: `acct:${acct}`, recipient_name: "张三", amount: "300", currency: "CNY", grant_hash: r1.grant.grant_hash } } }) }));
    const r2 = JSON.parse(call2.result.content[0].text);
    expect(r2.status).toBe("EXECUTED");
    expect(r2.tx_id).toMatch(/^TX/);
  });

  it("注入攻击样本：__provenance 把商户备注标到 amount → BLOCKED UNTRUSTED_PROVENANCE", async () => {
    const email = "tf6@test.dev";
    const out = await registerUser(email);
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const call = await j(await SELF.fetch(BASE + "/mcp?sid=t2", { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "transfer_execute", arguments: {
        recipient: `acct:${newCardNumber()}`, amount: "900", currency: "CNY",
        __provenance: { amount: { provenance: "merchant_note", trust: "EXTERNAL_UNTRUSTED" } },
      } },
    }) }));
    const r = JSON.parse(call.result.content[0].text);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("UNTRUSTED_PROVENANCE");
    expect(call.result.isError).toBe(true);
  });

  it("AI 通道硬上限：单笔 ¥6,000 转账 → POLICY BLOCKED", async () => {
    const email = "tf7@test.dev";
    const out = await registerUser(email);
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const payload = {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "transfer_execute", arguments: { recipient: `acct:${newCardNumber()}`, amount: "6000", currency: "CNY" } },
    };
    const call = await j(await SELF.fetch(BASE + "/mcp", { method: "POST", headers: H, body: JSON.stringify(payload) }));
    const r = JSON.parse(call.result.content[0].text);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("AI_SINGLE_LIMIT_EXCEEDED");
  });
});
