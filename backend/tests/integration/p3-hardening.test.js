import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P3 收口：版本接口不再暴露 demo_mode；改密"验证码先消费、后改密"。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;
/* 测试口令一律由环境注入的 TEST_PASSWORD 派生（不在源码里写可用凭据字面量） */
const NEW_PW = `${TEST_PASSWORD}-n1`;
const NEW_PW2 = `${TEST_PASSWORD}-n2`;
const WRONG_PW = `${TEST_PASSWORD}-w0`;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  }, 20000);
}
async function patch(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "PATCH",
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
async function registerUser(email, name = "收口测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("P3-14 版本接口最小化", () => {
  it("GET /api/version 不再返回 demo_mode", async () => {
    const r = await SELF.fetch(BASE + "/api/version");
    expect(r.status).toBe(200);
    const d = await j(r);
    expect(d.version).toBeTruthy();
    expect(d.demo_mode).toBeUndefined();
  }, 20000);
});

describe("P3-18 改密顺序：先消费验证码，再改密", () => {
  it("旧密码错时不烧码；成功后同码不可复用", async () => {
    const u = await registerUser("p318@test.dev");
    await post("/api/auth/email-code", { scene: "redstep", email: "p318@test.dev" }, u.token);
    const code = await lastCode("p318@test.dev");

    /* ① 旧密码错 → 401，验证码不被消费 */
    const wrong = await patch("/api/security/password", { current_password: WRONG_PW, otp: code, new_password: NEW_PW }, u.token);
    expect(wrong.status).toBe(401);
    expect((await j(wrong)).error.code).toBe("WRONG_OLD_PASSWORD");

    /* ② 同一个码 + 正确旧密码 → 成功（证明①没烧码） */
    const ok = await patch("/api/security/password", { current_password: PASSWORD, otp: code, new_password: NEW_PW }, u.token);
    expect(ok.status).toBe(200);
    const newToken = (await j(ok)).token;
    expect(newToken).toBeTruthy();

    /* ③ 同码再用（此时旧密码已是新密码）→ 401：码已消费 */
    const replay = await patch("/api/security/password", { current_password: NEW_PW, otp: code, new_password: NEW_PW2 }, newToken);
    expect(replay.status).toBe(401);
    expect((await j(replay)).error.code).toMatch(/^OTP_/);
  }, 60000);
});
