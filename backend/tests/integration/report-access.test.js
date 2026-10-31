import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P0-1：月报对象私有化——静态通道一律 404，只允许经 /api/reports/:month 按本人作用域下发。
 *  这里不走 PDF 生成（pdf-lib 在 workers 测试池里不可用），直接把对象与 meta 摆好验证访问控制。 */
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
async function registerUser(email, name = "月报测试") {
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
const PDF_STUB = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]); /* %PDF-1.7 */

describe("月报访问控制", () => {
  it("静态前缀一律 404；本人 API 200；他人 404；旧命名仍可经 API 兜底", async () => {
    const a = await registerUser("rp-a@test.dev");
    const b = await registerUser("rp-b@test.dev");
    const c = await registerUser("rp-c@test.dev");

    /* ① 静态路径：无论是否登录、对象是否存在，私有前缀一律 404 */
    for (const p of [`/reports/${a.user_id}/2026-10.pdf`, `/reports/${a.user_id}/2026-10-abc12345.pdf`, "/reports/x/y.pdf"]) {
      expect((await SELF.fetch(BASE + p)).status).toBe(404);
      expect((await SELF.fetch(BASE + p, { headers: { authorization: `Bearer ${a.token}` } })).status).toBe(404);
    }

    /* ② 本人月报：随机对象名 + meta 指向 → API 200（PDF） */
    const key = `reports/${a.user_id}/2026-10-deadbeef.pdf`;
    await env.ASSETS.put(key, PDF_STUB, { httpMetadata: { contentType: "application/pdf" } });
    await doOp(`u:${a.user_id}`, { op: "meta_set", k: "report:2026-10", v: key });
    const own = await SELF.fetch(BASE + "/api/reports/2026-10", { headers: { authorization: `Bearer ${a.token}` } });
    expect(own.status).toBe(200);
    expect(String(own.headers.get("content-type"))).toContain("pdf");

    /* ③ 另一个用户同一月份：404（key 由 ctxInfo.userId 拼，不可能读到 a 的对象） */
    const other = await SELF.fetch(BASE + "/api/reports/2026-10", { headers: { authorization: `Bearer ${b.token}` } });
    expect(other.status).toBe(404);

    /* ④ 未生成月份 404 */
    const missing = await SELF.fetch(BASE + "/api/reports/2020-01", { headers: { authorization: `Bearer ${a.token}` } });
    expect(missing.status).toBe(404);

    /* ⑤ 旧命名（无 meta）由 API 兜底，保证历史月报仍可下载；静态仍 404 */
    const legacy = `reports/${c.user_id}/2026-09.pdf`;
    await env.ASSETS.put(legacy, PDF_STUB, { httpMetadata: { contentType: "application/pdf" } });
    const legacyGet = await SELF.fetch(BASE + "/api/reports/2026-09", { headers: { authorization: `Bearer ${c.token}` } });
    expect(legacyGet.status).toBe(200);
    expect((await SELF.fetch(BASE + `/reports/${c.user_id}/2026-09.pdf`)).status).toBe(404);
  }, 60000);
});
