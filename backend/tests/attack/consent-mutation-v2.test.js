import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 同意篡改攻击（第二批）：覆盖组员实测路径与"判级升红复用"。
 *  断言口径：确认卡签发后，任何授权字段被改写都必须 403 CONSENT_INVALIDATED；
 *  参数未变但判级已升红时，必须 CONSENT_TIER_ESCALATED（不拿黄卡的授权执行红级动作）。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  const hit = String(mails.at(-1)?.text ?? "").match(/\b[0-9]{6}\b/);
  return hit ? hit[0] : null;
}
async function registerUser(email, name = "攻击者") {
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
async function realTarget(tag, name) {
  const out = await registerUser(`${tag}@test.dev`, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name };
}
async function myCards(token) {
  return (await j(await SELF.fetch(BASE + "/api/cards", { headers: { authorization: `Bearer ${token}` } }))).cards;
}

describe("同意篡改攻击：限额与付款卡", () => {
  it("限额确认后把日累计 1000 改成 9000 → CONSENT_INVALIDATED（组合卡同源缺口）", async () => {
    const out = await registerUser("cmv1@test.dev");
    const card = (await myCards(out.token)).find((c) => c.kind === "debit");
    const before = card.limit_daily;
    const body = { limit_single: "100.00", limit_daily: "1000.00" };
    const s1 = await j(await post(`/api/cards/${card.slug}/limits`, body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");

    const attacked = await post(`/api/cards/${card.slug}/limits`, { limit_single: "100.00", limit_daily: "9000.00", grant_hash: s1.grant.grant_hash }, out.token);
    expect(attacked.status).toBe(403);
    const ab = await j(attacked);
    expect(ab.reason).toBe("CONSENT_INVALIDATED");

    /* 库里的日累计必须保持原值（9000 没有被写进去） */
    const after = (await myCards(out.token)).find((c) => c.slug === card.slug);
    expect(after.limit_daily).toBe(before);
  }, 20000);

  it("转账确认后把付款卡换成另一张 → CONSENT_INVALIDATED", async () => {
    const out = await registerUser("cmv2@test.dev");
    const tgt = await realTarget("cmv2-payee", "张三");
    const cards = await myCards(out.token);
    const from = cards.find((c) => c.kind === "debit");
    const other = cards.find((c) => c.slug !== from.slug);
    expect(other).toBeTruthy();

    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "100", from_card: from.slug };
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");

    const attacked = await post("/api/transfers/intrabank", { ...body, from_card: other.slug, grant_hash: s1.grant.grant_hash }, out.token);
    expect(attacked.status).toBe(403);
    expect((await j(attacked)).reason).toBe("CONSENT_INVALIDATED");
  }, 20000);

  it("黄卡确认后当日累计升红再重放 → CONSENT_TIER_ESCALATED（不是 CONSENT_INVALIDATED）", async () => {
    const out = await registerUser("cmv3@test.dev");
    const tgt = await realTarget("cmv3-payee", "李四");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "900" };

    /* 第一张卡：¥900 黄级（当日累计 0） */
    const s1 = await j(await post("/api/transfers/intrabank", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    expect(s1.tier).toBe("YELLOW");

    /* 期间再执行一笔 ¥500（当日累计 500，仍未越 ¥1,000 阈值） */
    const body2 = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "500" };
    const t2 = await j(await post("/api/transfers/intrabank", body2, out.token));
    expect(t2.status).toBe("INPUT_REQUIRED");
    const done2 = await j(await post("/api/transfers/intrabank", { ...body2, grant_hash: t2.grant.grant_hash }, out.token));
    expect(done2.status).toBe("EXECUTED");

    /* 重放第一张卡：500 + 900 > 1000 → 现判级为红，而授权是黄 → 升红拒绝 */
    const replay = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    expect(replay.status).toBe(403);
    expect((await j(replay)).reason).toBe("CONSENT_TIER_ESCALATED");
  }, 30000);
});
