import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { checkAdminToken } from "../../worker-main.js";

/** P1-6：self-seed 在 DEMO_MODE 之上再叠管理员令牌（双门），且门在会话之前——
 *  未带令牌者（即便是登录用户）拿不到任何名单数据。 */
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
async function registerUser(email, name = "种子门测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("self-seed 双门：DEMO_MODE + 管理员令牌", () => {
  it("登录用户不带/带错 x-admin-token → 403 ADMIN_FORBIDDEN，且不返回任何名单", async () => {
    const u = await registerUser("ss1@test.dev");
    const hdr = { authorization: `Bearer ${u.token}` };

    const noTok = await SELF.fetch(BASE + "/api/demo/self-seed", { headers: hdr });
    expect(noTok.status).toBe(403);
    const noTokBody = await j(noTok);
    expect(noTokBody.error.code).toBe("ADMIN_FORBIDDEN");
    expect(noTokBody.payee_source).toBeUndefined();

    const wrongTok = await SELF.fetch(BASE + "/api/demo/self-seed", { headers: { ...hdr, "x-admin-token": "not-the-admin-token" } });
    expect(wrongTok.status).toBe(403);

    const postNoTok = await post("/api/demo/self-seed", {}, u.token);
    expect(postNoTok.status).toBe(403);
    expect((await j(postNoTok)).error.code).toBe("ADMIN_FORBIDDEN");
  }, 30000);

  it("令牌门先于登录门：匿名请求同样 403（不泄露登录态差异）", async () => {
    const anon = await SELF.fetch(BASE + "/api/demo/self-seed");
    expect(anon.status).toBe(403);
    expect((await j(anon)).error.code).toBe("ADMIN_FORBIDDEN");
  }, 20000);

  it("checkAdminToken：未配置 fail-closed；匹配放行；不匹配拒绝", () => {
    const mk = (tok) => new Request("https://suveoo.com/api/demo/self-seed", { headers: tok ? { "x-admin-token": tok } : {} });
    expect(checkAdminToken(mk("anything"), {})).toBe(false);
    expect(checkAdminToken(mk(""), { ADMIN_TOKEN: "s3cret-value-123456" })).toBe(false);
    expect(checkAdminToken(mk("wrong"), { ADMIN_TOKEN: "s3cret-value-123456" })).toBe(false);
    expect(checkAdminToken(mk("s3cret-value-123456"), { ADMIN_TOKEN: "s3cret-value-123456" })).toBe(true);
  });
});
