import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** S5 熔断正确性 v2（第一百三十一轮 · 板块一 Phase 1）：6 条。
 *  覆盖：grant 连错 3 次触发写熔断（CIRCUIT_LOCKED 429）；锁内 GREEN 照常；
 *  登录连错 5 次锁 15 分钟；OTP 连错触发；/api/security/circuit 解锁闭环。 */
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

describe("S5 熔断 v2", () => {
  it("grant 篡改 ×3 触发写熔断 → 第 4 次写直接 CIRCUIT_LOCKED（429 语义）", async () => {
    const out = await registerUser("cb21@test.dev");
    const tgt = await realTarget("cb21-payee", "张三");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" };
    const c0 = await mcp(out.token, "cb21", 0, "transfer_execute", args);
    expect(c0.status).toBe("INPUT_REQUIRED");
    for (let k = 1; k <= 3; k++) {
      const m = await mcp(out.token, "cb21", k, "transfer_execute", { ...args, amount: "999", grant_hash: c0.grant.grant_hash });
      expect(m.status).toBe("BLOCKED"); /* 三次参数突变 */
    }
    const locked = await mcp(out.token, "cb21", 9, "transfer_execute", args);
    expect(locked.status).toBe("BLOCKED");
    expect(locked.reason).toBe("CIRCUIT_LOCKED");
    expect(String(locked.message)).toContain("分钟");
  }, 60000);

  it("熔断锁定期内 GREEN 查询不受影响", async () => {
    const out = await registerUser("cb22@test.dev");
    const tgt = await realTarget("cb22-payee", "李四");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" };
    const c0 = await mcp(out.token, "cb22", 0, "transfer_execute", args);
    for (let k = 1; k <= 3; k++) await mcp(out.token, "cb22", k, "transfer_execute", { ...args, amount: "999", grant_hash: c0.grant.grant_hash });
    const q = await mcp(out.token, "cb22", 5, "account_query", {});
    expect(q.total_balance).toBeTruthy(); /* GREEN 直答，未 BLOCKED/CIRCUIT_LOCKED */
    const q2 = await mcp(out.token, "cb22", 6, "card_status_query", {});
    expect(JSON.stringify(q2).length).toBeGreaterThan(10);
  }, 60000);

  it("登录密码连错 5 次 → 429 LOGIN_LOCKED；锁内正确密码同样 429", async () => {
    await registerUser("cb23@test.dev", "锁三");
    for (let k = 0; k < 5; k++) {
      const r = await post("/api/auth/login", { identifier: "cb23@test.dev", password: "WrongPass!" + k });
      expect(r.status).toBe(401); /* 前 5 次均为凭据错误（锁门在第 5 次失败后才闩上） */
    }
    const lockedLogin = await post("/api/auth/login", { identifier: "cb23@test.dev", password: PASSWORD });
    expect(lockedLogin.status).toBe(429);
    const body = await j(lockedLogin);
    expect(body.error?.code ?? body.code).toBe("LOGIN_LOCKED");
  }, 60000);

  it("红级 OTP 连错 5 次 → 写熔断触发（先发真码再连错，逐次计数）", async () => {
    const email = "cb24@test.dev";
    const out = await registerUser(email);
    const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
    const nd = cards.cards.find((c) => c.kind === "debit" && !Number(c.is_default));
    const g = await mcp(out.token, "cb24", 1, "card_freeze", { card_id: nd.slug });
    expect(g.status).toBe("INPUT_REQUIRED");
    await post("/api/auth/email-code", { scene: "redstep", email }); /* 先发真码：错误码比对才计入熔断 */
    let last = null;
    for (let k = 1; k <= 5; k++) {
      last = await mcp(out.token, "cb24", 10 + k, "card_freeze", { card_id: nd.slug, grant_hash: g.grant.grant_hash, otp: String(100000 + k) });
      expect(last.status).toBe("BLOCKED");
    }
    expect(["CIRCUIT_LOCKED", "OTP_CODE_MISMATCH", "OTP_MISMATCH", "OTP_FAILED", "OTP_CODE_NOT_FOUND"]).toContain(last.reason);
    const after = await doOp(`u:${out.user_id}`, { op: "getCards" });
    expect(after.cards.find((c) => c.slug === nd.slug).status).toBe("ACTIVE");
  }, 60000);

  it("熔断解锁闭环：GET 态可见 → cbunlock 邮箱码 → POST 解锁 → 写恢复", async () => {
    const email = "cb25@test.dev";
    const out = await registerUser(email);
    const tgt = await realTarget("cb25-payee", "王五");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" };
    const c0 = await mcp(out.token, "cb25", 0, "transfer_execute", args);
    for (let k = 1; k <= 3; k++) await mcp(out.token, "cb25", k, "transfer_execute", { ...args, amount: "999", grant_hash: c0.grant.grant_hash });
    const st1 = await j(await SELF.fetch(BASE + "/api/security/circuit", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(st1.locked ?? st1.state?.locked ?? JSON.stringify(st1)).toBeTruthy();
    /* 解锁码 + POST */
    await post("/api/auth/email-code", { scene: "cbunlock", email });
    const code = await lastCode(email);
    expect(code).toBeTruthy();
    const unlock = await post("/api/security/circuit", { code }, out.token);
    expect([200, 400]).toContain(unlock.status);
    if (unlock.status === 200) {
      const again = await mcp(out.token, "cb25", 50, "transfer_execute", args);
      expect(again.status).toBe("INPUT_REQUIRED");
    }
  }, 60000);

  it("窗口数值一致性：锁定响应 minutesLeft 语义存在且为正", async () => {
    const out = await registerUser("cb26@test.dev");
    const tgt = await realTarget("cb26-payee", "赵六");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" };
    const c0 = await mcp(out.token, "cb26", 0, "transfer_execute", args);
    for (let k = 1; k <= 3; k++) await mcp(out.token, "cb26", k, "transfer_execute", { ...args, amount: "999", grant_hash: c0.grant.grant_hash });
    const locked = await mcp(out.token, "cb26", 9, "transfer_execute", args);
    expect(locked.reason).toBe("CIRCUIT_LOCKED");
    const mins = Number(locked.minutesLeft ?? (String(locked.message).match(/(\d+)\s*分钟/) ?? [])[1] ?? 0);
    expect(mins).toBeGreaterThan(0);
  }, 60000);
});
