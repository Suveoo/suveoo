import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P2-11：注册发码不再用 409 暴露邮箱是否已注册——同形 200，已注册者改收提醒邮件。 */
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
async function codes(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return mails.map((m) => String(m.text ?? ""));
}
async function registerUser(email, name = "枚举测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const mails = await codes(email);
  const hit = mails.at(-1)?.match(/\b[0-9]{6}\b/);
  return j(await post("/api/auth/register", { email, code: hit ? hit[0] : "", name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("P2-11 注册邮箱枚举", () => {
  it("已注册邮箱发码返回 200（同形），不再 409；用该邮箱注册只能得到 CODE_NOT_FOUND", async () => {
    await registerUser("en1@test.dev");

    const dup = await post("/api/auth/email-code", { scene: "register", email: "en1@test.dev" });
    expect(dup.status).toBe(200);
    const dupBody = await j(dup);
    expect(dupBody.ok).toBe(true);
    expect(String(dupBody.masked)).toContain("*"); /* 与真实发送同形（掩码邮箱） */
    expect(dupBody.expires_in).toBeGreaterThan(0);
    expect(dupBody.error).toBeUndefined();

    /* 已注册邮箱不会签发注册码：用它去注册（任意码）只会得到 CODE_NOT_FOUND */
    const reg = await post("/api/auth/register", {
      email: "en1@test.dev", code: "123456", name: "冒名", password: PASSWORD,
      risk_answers: [3, 3, 4, 3, 4], aml_consented: true,
    });
    expect(reg.status).toBe(401);
    expect((await j(reg)).error.code).toBe("CODE_NOT_FOUND");

    /* 已注册方收到的是"已注册"提醒邮件（而不是验证码） */
    const mails = await codes("en1@test.dev");
    expect(mails.some((t) => t.includes("已注册"))).toBe(true);
  }, 40000);

  it("新邮箱流程不受影响：发码 200 → 用码注册成功", async () => {
    const out = await registerUser("en2@test.dev", "新人");
    expect(out.token).toBeTruthy();
    expect(out.user_id).toBeTruthy();
  }, 40000);
});
