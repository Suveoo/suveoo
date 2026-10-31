import { describe, expect, it } from "vitest";
import { TEST_PASSWORD, TEST_NEW_PASSWORD, TEST_WRONG_PASSWORD, makePassword } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/**
 * 注册开户 → 会话 → 登录 2FA → 找回密码 全链路（真实 workerd + KV + DO + R2 模拟环境）。
 * isolatedStorage=true：每个 it() 存储互相隔离，因此每个用例注册自己的邮箱。
 */

const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;
const RISK = [3, 3, 4, 3, 4]; // → PR3

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const j = (r) => r.json();

/** 从测试收件箱取最新验证码。 */
async function lastCode(email) {
  const raw = await env.MAIL_OUTBOX.get(`outbox:${email}`);
  const mails = JSON.parse(raw ?? "[]");
  const m = /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "");
  return m?.[1] ?? null;
}

async function registerUser(email) {
  const r1 = await post("/api/auth/email-code", { scene: "register", email });
  expect(r1.status).toBe(200);
  const code = await lastCode(email);
  expect(code).toMatch(/^\d{6}$/);
  const r2 = await post("/api/auth/register", { email, code, name: "演示用户", password: PASSWORD, risk_answers: RISK, aml_consented: true });
  expect(r2.status).toBe(201);
  return j(r2);
}

describe("注册与开户（发卡）", () => {
  it("全流程：验证码邮件 → 开户发 4 借记 + 1 信用 → 返回会话", async () => {
    const email = "reg1@test.dev";
    const out = await registerUser(email);

    expect(out.user_id).toMatch(/^U\d+$/);
    expect(out.token).toBeTruthy();
    expect(out.pr_level).toBe(3);
    expect(out.cards).toHaveLength(5);
    expect(out.cards.filter((c) => c.kind === "debit")).toHaveLength(5 - 1);

    // 借记总余额 ∈ [999328.24, 1124549.38]，且每张卡号 16 位（视图为掩码，校验结构）
    const total = out.cards.filter((c) => c.kind === "debit").reduce((a, c) => a + Number(c.balance), 0);
    expect(total).toBeGreaterThanOrEqual(999328.24);
    expect(total).toBeLessThanOrEqual(1124549.38);
    for (const c of out.cards) expect(c.number).toMatch(/^\*\*\*\* \d{4}$/);

    // 恰一张默认卡且为借记卡；信用卡额度 320,000
    const defaults = out.cards.filter((c) => c.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].kind).toBe("debit");
    expect(out.cards.find((c) => c.kind === "credit").limit).toBe("320000.00");

    // 卡面互不重复（借记 4 张不同 art）
    const debitArts = out.cards.filter((c) => c.kind === "debit").map((c) => c.art);
    expect(new Set(debitArts).size).toBe(4);
  });

  it("验证码错误拒绝；风险问卷非法拒绝；未勾 AML 拒绝", async () => {
    const email = "reg2@test.dev";
    await post("/api/auth/email-code", { scene: "register", email });
    const bad = await post("/api/auth/register", { email, code: "000000", name: "x", password: PASSWORD, risk_answers: RISK, aml_consented: true });
    expect(bad.status).toBe(401);
    const noAml = await post("/api/auth/register", { email, code: "123456", name: "x", password: PASSWORD, risk_answers: RISK, aml_consented: false });
    expect([400, 401]).toContain(noAml.status);
    const badQuiz = await post("/api/auth/register", { email, code: "123456", name: "x", password: PASSWORD, risk_answers: [9, 1, 1, 1, 1], aml_consented: true });
    expect(badQuiz.status).toBe(400);
  });

  it("重复注册：发码同形 200（防枚举），且不会签发注册码", async () => {
    const email = "dup@test.dev";
    await registerUser(email);
    const r = await post("/api/auth/email-code", { scene: "register", email });
    expect(r.status).toBe(200); /* P2-11：不再 409，避免"邮箱是否已注册"的判定器 */
    const body = await j(r);
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
    /* 未签发注册码：拿任意码去注册只得到 CODE_NOT_FOUND（该路径仅邮箱主人可达） */
    const reg = await post("/api/auth/register", { email, code: "123456", name: "冒名", password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
    expect(reg.status).toBe(401);
    expect((await j(reg)).error.code).toBe("CODE_NOT_FOUND");
  });
});

describe("会话", () => {
  it("GET /api/session：Bearer 有效返回用户摘要（邮箱掩码 + 模拟声明）；无 token 401", async () => {
    const email = "sess@test.dev";
    const out = await registerUser(email);

    const ok = await SELF.fetch(BASE + "/api/session", { headers: { authorization: `Bearer ${out.token}` } });
    expect(ok.status).toBe(200);
    const body = await j(ok);
    expect(body.user_id).toBe(out.user_id);
    expect(body.email).toBe("se**@test.dev");
    expect(body.notice).toContain("模拟银行系统");

    const anon = await SELF.fetch(BASE + "/api/session");
    expect(anon.status).toBe(401);
  });

  it("logout 后会话立即失效（jti 黑名单）", async () => {
    const email = "logout@test.dev";
    const out = await registerUser(email);
    expect((await post("/api/auth/logout", {}, out.token)).status).toBe(200);
    const after = await SELF.fetch(BASE + "/api/session", { headers: { authorization: `Bearer ${out.token}` } });
    expect(after.status).toBe(401);
  });
});

describe("登录与 2FA", () => {
  it("邮箱 + 密码 → mfa_required → 邮件验证码 → 会话", async () => {
    const email = "login1@test.dev";
    await registerUser(email);

    const l1 = await post("/api/auth/login", { identifier: email, password: PASSWORD });
    expect(l1.status).toBe(200);
    const step1 = await j(l1);
    expect(step1.mfa_required).toBe(true);
    expect(step1.mfa_token).toBeTruthy();

    const code = await lastCode(email);
    const l2 = await post("/api/auth/mfa", { mfa_token: step1.mfa_token, code });
    expect(l2.status).toBe(200);
    const session = await j(l2);
    expect(session.token).toBeTruthy();

    const me = await SELF.fetch(BASE + "/api/session", { headers: { authorization: `Bearer ${session.token}` } });
    expect(me.status).toBe(200);
  });

  it("卡号也可作为登录标识", async () => {
    // 经 DO 直接取完整卡号（视图掩码不可逆）
    const email = "login2@test.dev";
    await registerUser(email);
    const reg = await env.LEDGER.get(env.LEDGER.idFromName("registry")).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "findUser", email }),
    }).then((r) => r.json());
    const cards = await env.LEDGER.get(env.LEDGER.idFromName(`u:${reg.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "getCards" }),
    }).then((r) => r.json());
    const fullNumber = cards.cards[0].number;
    expect(fullNumber).toMatch(/^\d{16}$/);

    const l = await post("/api/auth/login", { identifier: fullNumber, password: PASSWORD });
    expect(l.status).toBe(200);
    expect((await j(l)).mfa_required).toBe(true);
  });

  it("错误密码 401；连续 6 次失败锁定 429", async () => {
    const email = "lock@test.dev";
    await registerUser(email);
    for (let i = 0; i < 5; i++) {
      const r = await post("/api/auth/login", { identifier: email, password: TEST_WRONG_PASSWORD });
      expect(r.status).toBe(401);
    }
    const locked = await post("/api/auth/login", { identifier: email, password: TEST_WRONG_PASSWORD });
    expect(locked.status).toBe(429);
    expect((await j(locked)).error.code).toBe("LOGIN_LOCKED");
  });
});

describe("找回密码", () => {
  it("recovery 验证码 → 新密码可登录", async () => {
    const email = "recover@test.dev";
    await registerUser(email);

    const r1 = await post("/api/auth/email-code", { scene: "recovery", email });
    expect(r1.status).toBe(200);
    const code = await lastCode(email);
    const r2 = await post("/api/auth/recover", { email, code, new_password: TEST_NEW_PASSWORD });
    expect(r2.status).toBe(200);

    const oldLogin = await post("/api/auth/login", { identifier: email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await post("/api/auth/login", { identifier: email, password: TEST_NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it("未注册邮箱请求 recovery：响应 200 但不泄露存在性（无邮件、验证必失败）", async () => {
    const email = "ghost@nowhere.dev";
    const r = await post("/api/auth/email-code", { scene: "recovery", email });
    expect(r.status).toBe(200);
    expect(await env.MAIL_OUTBOX.get(`outbox:${email}`)).toBeNull();
    const bad = await post("/api/auth/recover", { email, code: "123456", new_password: TEST_WRONG_PASSWORD });
    expect(bad.status).toBe(401);
  });
});

describe("验证码限流", () => {
  it("60 秒冷却生效", async () => {
    const email = "cooldown@test.dev";
    const r1 = await post("/api/auth/email-code", { scene: "register", email });
    expect(r1.status).toBe(200);
    const r2 = await post("/api/auth/email-code", { scene: "register", email });
    expect(r2.status).toBe(429);
    expect((await j(r2)).error.code).toBe("RATE_LIMITED");
  });
});
