import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { newCardNumber } from "../../worker-main.js";

/** 重放攻击：grant 一次性消费、OTP 一次性消费、验证码跨场景/跨用户不可复用。 */
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
  return j(await post("/api/auth/register", { email, code, name: "测试用户", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
const get = (path, token) => SELF.fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });

describe("重放攻击", () => {
  it("表单通道：EXECUTED 后原样重放同一请求（含 grant）→ GRANT_ALREADY_USED，不二次扣款", async () => {
    const out = await registerUser("rp1@test.dev");
    const body = { recipient_account: newCardNumber({ bin: "622288" }), recipient_name: "张三", amount: "200" };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    const ok = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token));
    expect(ok.status).toBe("EXECUTED");
    const before = (await j(await get("/api/overview", out.token))).total_balance;
    const replay = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(replay.status).toBe(403);
    expect((await j(replay)).reason).toBe("GRANT_ALREADY_USED");
    const after = (await j(await get("/api/overview", out.token))).total_balance;
    expect(after).toBe(before); // 重放未造成二次扣款
  });

  it("MCP 通道：grant 重放 → BLOCKED GRANT_ALREADY_USED", async () => {
    const out = await registerUser("rp2@test.dev");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const acct = newCardNumber({ bin: "622288" });
    const args = { recipient: `acct:${acct}`, recipient_name: "李四", amount: "150", currency: "CNY" };
    const mk = (id, extra = {}) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "transfer_execute", arguments: { ...args, ...extra } } });
    const c1 = JSON.parse((await j(await SELF.fetch(BASE + "/mcp?sid=rp2", { method: "POST", headers: H, body: mk(1) }))).result.content[0].text);
    expect(c1.status).toBe("INPUT_REQUIRED");
    const c2 = JSON.parse((await j(await SELF.fetch(BASE + "/mcp?sid=rp2", { method: "POST", headers: H, body: mk(2, { grant_hash: c1.grant.grant_hash }) }))).result.content[0].text);
    expect(c2.status).toBe("EXECUTED");
    const c3 = await j(await SELF.fetch(BASE + "/mcp?sid=rp2", { method: "POST", headers: H, body: mk(3, { grant_hash: c1.grant.grant_hash }) }));
    const r3 = JSON.parse(c3.result.content[0].text);
    expect(r3.status).toBe("BLOCKED");
    expect(r3.reason).toBe("GRANT_ALREADY_USED");
    expect(c3.result.isError).toBe(true);
  });

  it("红级 OTP 一次性：同一验证码用于第二笔转账 → OTP_CODE_NOT_FOUND", async () => {
    const email = "rp3@test.dev";
    const out = await registerUser(email);
    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    const run = async () => {
      const body = { recipient_account: newCardNumber(), recipient_name: "王五", amount: "2000" };
      const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
      return post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash, otp }, out.token);
    };
    expect((await j(await run())).status).toBe("EXECUTED");
    const replay = await run();
    expect(replay.status).toBe(403);
    expect((await j(replay)).reason).toBe("OTP_CODE_NOT_FOUND");
  });

  it("邮箱验证码跨用户不可复用：B 提交 A 收到的验证码 → 拒绝", async () => {
    const emailA = "rp4-a@test.dev", emailB = "rp4-b@test.dev";
    await registerUser(emailA); // A 的注册码
    const codeA = await lastCode(emailA);
    // B 注册时尝试复用 A 的验证码
    await post("/api/auth/email-code", { scene: "register", email: emailB });
    const r = await post("/api/auth/register", { email: emailB, code: codeA, name: "冒名", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await j(r)).token ?? null).toBeNull();
  });

  it("注册验证码一次性：成功注册后同码再注册 → 拒绝", async () => {
    const email = "rp5@test.dev";
    await post("/api/auth/email-code", { scene: "register", email });
    const code = await lastCode(email);
    const first = await post("/api/auth/register", { email, code, name: "甲", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
    expect([200, 201].includes(first.status)).toBe(true);
    const replay = await post("/api/auth/register", { email, code, name: "乙", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });
});
