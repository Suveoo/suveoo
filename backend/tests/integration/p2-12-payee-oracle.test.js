import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P2-12：收款人查询不再回显姓名（只回 found），核验失败累计 10 次/小时即锁。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function registerUser(email, name = "探测测试") {
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

describe("P2-12 收款人查询隐私", () => {
  it("lookup 只回 found：不回姓名/掩码；未知联系方式 found=false", async () => {
    const a = await registerUser("po-a@test.dev");
    await registerUser("po-b@test.dev", "被查询者");

    const hit = await j(await SELF.fetch(BASE + "/api/payees/lookup?contact=" + encodeURIComponent("po-b@test.dev"), { headers: { authorization: `Bearer ${a.token}` } }));
    expect(hit.found).toBe(true);
    expect(hit.name).toBeUndefined();
    expect(hit.masked).toBeUndefined();
    expect(Object.keys(hit).sort()).toEqual(["found"]);

    await sleep(1100); /* 1 次/秒节流 */
    const miss = await j(await SELF.fetch(BASE + "/api/payees/lookup?contact=" + encodeURIComponent("nobody@test.dev"), { headers: { authorization: `Bearer ${a.token}` } }));
    expect(miss.found).toBe(false);
  }, 40000);

  it("verify-contact：连续失败 10 次后锁定（第 11 次 429）", async () => {
    const a = await registerUser("po-c@test.dev");
    const b = await registerUser("po-d@test.dev", "真实姓名");
    const cards = await doOp(`u:${b.user_id}`, { op: "getCards" });
    const acct = cards.cards.find((c) => c.kind === "debit").number;

    let last = null;
    for (let i = 0; i < 10; i++) {
      last = await j(await post("/api/payees/verify-contact", { name: "错误姓名" + i, account: acct }, a.token));
      expect(last.identity).toBe(false);
      await sleep(1050); /* 1 次/秒节流 */
    }
    const blocked = await post("/api/payees/verify-contact", { name: "错误姓名X", account: acct }, a.token);
    expect(blocked.status).toBe(429);
    expect((await j(blocked)).error.code).toBe("RATE_LIMITED");
  }, 60000);
});
