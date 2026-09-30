/* contact-mail.test.js — 第十轮补：联系表单掩码邮箱解析（登录态以 JWT 真实邮箱为准；掩码绝不入邮件） */
import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return mails.at(-1).text.match(/\b(\d{6})\b/)[1];
}
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return r.json();
}

describe("POST /api/contact masked-email resolution", () => {
  it("signed-in masked email resolves to the JWT real address in the delivered mail", async () => {
    const me = await registerUser("contact1@test.dev", "掩码核验");
    const r = await post("/api/contact", { name: "掩码核验", email: "de**@suveoo.com", category: "账户", message: "第一行\n第二行 特殊字符 ¥ < & >" }, me.token);
    expect(r.status).toBe(200);
    const outbox = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:support@suveoo.com`)) ?? "[]");
    const mail = outbox.at(-1);
    expect(mail.subject).toContain("账户");
    expect(mail.text).toContain("contact1@test.dev"); /* JWT 真实邮箱，非掩码 */
    expect(mail.text).not.toContain("**@");
    expect(mail.html).toContain("mailto:contact1@test.dev");
    expect(mail.html).toContain("¥ &lt; &amp; &gt;"); /* 留言转义后仍完整可见 */
  });

  it("rejects an unauthenticated masked email instead of mailing it", async () => {
    const r = await post("/api/contact", { name: "X", email: "de**@suveoo.com", category: "账户", message: "hi" });
    expect(r.status).toBe(400);
  });
});
