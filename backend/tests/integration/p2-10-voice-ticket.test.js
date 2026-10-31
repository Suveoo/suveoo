import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P2-10：语音 WS 改用一次性票据——JWT 不再允许出现在浏览器 URL；
 *  旧壳（Electron / Capacitor WebView）的 ?t=JWT 兼容保留，但浏览器 UA 一律拒绝。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;
const UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const UA_SHELL = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Electron/33.0.0";

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
async function registerUser(email, name = "语音测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
/** 只走到鉴权/开关分支（不带 Upgrade 头，命中 400/403 即证明鉴权已通过） */
const hitStream = (query, ua) => SELF.fetch(`${BASE}/api/voice/stream${query}`, { headers: { "user-agent": ua } });

describe("P2-10 语音票据", () => {
  it("ticket 端点需登录；票据单次使用；JWT 走 URL 仅旧壳可用", async () => {
    const u = await registerUser("vt1@test.dev");

    /* ① 未登录换票 → 401 */
    expect((await post("/api/voice/ticket", {}, null)).status).toBe(401);

    /* ② 登录换票 → 90 秒一次性票据 */
    const tr = await j(await post("/api/voice/ticket", {}, u.token));
    expect(tr.ok).toBe(true);
    expect(String(tr.ticket)).toMatch(/^[0-9a-f]{48}$/);
    expect(tr.expires_in).toBe(90);

    /* ③ 带票访问 WS：鉴权通过 → 测试环境未开 ali（403 NOT_ENABLED），而不是 401 */
    const withTicket = await hitStream(`?ticket=${tr.ticket}`, UA_BROWSER);
    expect(withTicket.status).toBe(403);
    expect((await j(withTicket)).error.code).toBe("NOT_ENABLED");

    /* ④ 同一票据再来一次 → 401（已被消费） */
    const reused = await hitStream(`?ticket=${tr.ticket}`, UA_BROWSER);
    expect(reused.status).toBe(401);

    /* ⑤ 浏览器 UA + ?t=JWT → 401（不再接受 URL 里的长期令牌） */
    const browserJwt = await hitStream(`?t=${encodeURIComponent(u.token)}`, UA_BROWSER);
    expect(browserJwt.status).toBe(401);

    /* ⑥ 旧壳 UA（Electron）+ ?t=JWT → 鉴权通过（403 证明兼容分支仍在） */
    const shellJwt = await hitStream(`?t=${encodeURIComponent(u.token)}`, UA_SHELL);
    expect(shellJwt.status).toBe(403);
    expect((await j(shellJwt)).error.code).toBe("NOT_ENABLED");

    /* ⑦ 伪造票据 → 401 */
    expect((await hitStream(`?ticket=${"0".repeat(48)}`, UA_BROWSER)).status).toBe(401);
  }, 40000);
});
