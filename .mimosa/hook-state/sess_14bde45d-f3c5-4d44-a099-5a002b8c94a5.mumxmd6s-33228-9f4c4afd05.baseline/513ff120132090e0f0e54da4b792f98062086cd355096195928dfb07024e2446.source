import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

/** 任务二：完整卡号 reveal 端点（requireSession；属主隔离 = 每 DO 局部卡表）。 */
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
const get = (path, token) => SELF.fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });

describe("卡片完整卡号 reveal", () => {
  it("本人卡 → 返回完整 16 位（非掩码，与 DO 卡表一致）", async () => {
    const out = await registerUser("cr1@test.dev");
    const slug = "debit-card-1";
    const r = await j(await get(`/api/cards/${slug}/reveal`, out.token));
    expect(r.number).toMatch(/^\d{16}$/);
    expect(r.number).not.toContain("*");
    const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
    expect(cards.cards.find((c) => c.slug === slug).number).toBe(r.number);
  });

  it("属主隔离：B 用同名 slug 只能拿到自己的卡号，不泄露 A 的", async () => {
    const a = await registerUser("cr2-a@test.dev");
    const b = await registerUser("cr2-b@test.dev");
    const slug = "debit-card-1";
    const ra = await j(await get(`/api/cards/${slug}/reveal`, a.token));
    const rb = await j(await get(`/api/cards/${slug}/reveal`, b.token));
    expect(rb.number).toMatch(/^\d{16}$/);
    expect(rb.number).not.toBe(ra.number);
  });

  it("未登录 401；不存在的 slug 404", async () => {
    expect((await get("/api/cards/debit-card-1/reveal", null)).status).toBe(401);
    const out = await registerUser("cr3@test.dev");
    expect((await get("/api/cards/no-such-card/reveal", out.token)).status).toBe(404);
  });
});
