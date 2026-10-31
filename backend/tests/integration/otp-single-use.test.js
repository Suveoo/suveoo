import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P1-7：登录 2FA 与找回密码的一次性验证码必须真一次性——同码第二次使用必须失败。
 *  （此前 consume:false，同一码在 10 分钟 TTL 内可反复换 session / 反复改密。） */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

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
async function registerUser(email, name = "验证码测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("一次性验证码：登录 2FA / 找回密码", () => {
  it("2FA 验证码用过即失效（第二次换 session 被拒）", async () => {
    const u = await registerUser("otp1@test.dev");
    /* 开启 2FA（红级，需一次 redstep 码） */
    await post("/api/auth/email-code", { scene: "redstep", email: "otp1@test.dev" }, u.token);
    const redCode = await lastCode("otp1@test.dev");
    const on = await post("/api/security/2fa", { enabled: true, otp: redCode }, u.token);
    expect(on.status).toBe(200);

    /* 第一步：密码登录 → mfa_token */
    const login = await j(await post("/api/auth/login", { identifier: "otp1@test.dev", password: PASSWORD }));
    expect(login.mfa_required).toBe(true);
    expect(login.mfa_token).toBeTruthy();

    /* 第二步：取 login2fa 码并完成登录 */
    await post("/api/auth/email-code", { scene: "login2fa", mfa_token: login.mfa_token });
    const code = await lastCode("otp1@test.dev");
    const ok = await post("/api/auth/mfa", { mfa_token: login.mfa_token, code });
    expect(ok.status).toBe(200);
    expect((await j(ok)).token).toBeTruthy();

    /* 同一码再来一次：必须 401（码已被消费） */
    const replay = await post("/api/auth/mfa", { mfa_token: login.mfa_token, code });
    expect(replay.status).toBe(401);
    expect((await j(replay)).error.code).toBe("CODE_NOT_FOUND");
  }, 40000);

  it("找回密码验证码用过即失效（第二次改密被拒）", async () => {
    await registerUser("otp2@test.dev");
    await post("/api/auth/email-code", { scene: "recovery", email: "otp2@test.dev" });
    const code = await lastCode("otp2@test.dev");

    const first = await post("/api/auth/recover", { email: "otp2@test.dev", code, new_password: "NewPassw0rd" });
    expect(first.status).toBe(200);

    const replay = await post("/api/auth/recover", { email: "otp2@test.dev", code, new_password: "AnotherPass1" });
    expect(replay.status).toBe(401);
    expect((await j(replay)).error.code).toBe("CODE_NOT_FOUND");
  }, 40000);
});
