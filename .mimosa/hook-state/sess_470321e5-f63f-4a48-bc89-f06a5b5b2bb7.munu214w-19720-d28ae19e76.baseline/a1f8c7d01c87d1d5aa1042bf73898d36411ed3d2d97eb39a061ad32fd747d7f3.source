import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { signJwt } from "../../worker-main.js";

/** 越权攻击：伪造/过期令牌、跨用户资源访问（grant、卡、账本）。
 *  任务一后收款方须为真实 Suveoo 账户（realTarget 造真实收款人），断言语义不变。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

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
async function realTarget(tag, name) {
  const email = `${tag}@test.dev`;
  const out = await registerUser(email, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, token: out.token };
}
const get = (path, token) => SELF.fetch(BASE + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("认证绕过", () => {
  it("无令牌 / 垃圾令牌访问受保护 API 与 /mcp → 401", async () => {
    for (const path of ["/api/overview", "/api/transfers"]) {
      expect((await get(path, null)).status).toBe(401);
      expect((await get(path, "garbage.token.here")).status).toBe(401);
    }
    for (const token of [null, "garbage.token.here"]) {
      const r = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, token);
      expect(r.status).toBe(401);
    }
  });

  it("用错误密钥伪造 session JWT → 签名校验失败 401", async () => {
    const forged = await signJwt("attacker-known-secret", { sub: "u:1", email: "x@test.dev", typ: "session" }, { ttlSeconds: 3600 });
    expect((await get("/api/overview", forged)).status).toBe(401);
  });

  it("过期 session JWT → 401", async () => {
    const expired = await signJwt(env.JWT_SECRET, { sub: "u:1", email: "x@test.dev", typ: "session" }, { ttlSeconds: -60 });
    expect((await get("/api/overview", expired)).status).toBe(401);
  });

  it("MFA 中间令牌冒充 session 令牌 → typ 校验拒绝 401", async () => {
    const mfa = await signJwt(env.JWT_SECRET, { sub: "u:1", email: "x@test.dev", typ: "mfa" }, { ttlSeconds: 300 });
    expect((await get("/api/overview", mfa)).status).toBe(401);
  });
});

describe("跨用户越权", () => {
  it("用户 B 盗用用户 A 的 grant_hash → KV 按用户绑定 → GRANT_NOT_FOUND", async () => {
    const a = await registerUser("ab-a@test.dev");
    const b = await registerUser("ab-b@test.dev");
    const tgt = await realTarget("ab-payee", "张三");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "300" };
    const s1 = await j(await post("/api/transfers/intrabank", body, a.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const stolen = await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, b.token);
    expect(stolen.status).toBe(403);
    expect((await j(stolen)).reason).toBe("GRANT_NOT_FOUND");
  });

  it("卡 slug 每用户局部：B 访问同名 slug 只见自己的卡，A 的卡号/别名不受影响", async () => {
    const a = await registerUser("ab-c@test.dev");
    const b = await registerUser("ab-d@test.dev");
    const aCards = (await j(await get("/api/cards", a.token))).cards;
    const bCards = (await j(await get("/api/cards", b.token))).cards;
    const slug = aCards[0].slug; // 两人 slug 同名（debit-card-N），卡号全局唯一
    const bMatch = bCards.find((c) => c.slug === slug);
    const r = await j(await get(`/api/cards/${slug}`, b.token));
    expect(r.card.number).toBe(bMatch.number); // B 拿到的是自己的卡
    expect(r.card.number).not.toBe(aCards[0].number); // 不泄露 A 的卡号
    const patch = await SELF.fetch(`${BASE}/api/cards/${slug}`, {
      method: "PATCH", headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json" },
      body: JSON.stringify({ alias: "盗改" }),
    });
    expect([200, 202].includes(patch.status)).toBe(true);
    // A 的卡别名未被改动
    const after = await j(await get(`/api/cards/${slug}`, a.token));
    expect(after.card.alias ?? "").not.toBe("盗改");
  });

  it("用户 B 查 A 的转账流水 → 只见自己的账本", async () => {
    const a = await registerUser("ab-e@test.dev");
    const b = await registerUser("ab-f@test.dev");
    const tgt = await realTarget("ab-e-payee", "张三");
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "300" };
    const s1 = await j(await post("/api/transfers/intrabank", body, a.token));
    const done = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, a.token));
    expect(done.status).toBe("EXECUTED");
    const aList = await j(await get("/api/transfers", a.token));
    const bList = await j(await get("/api/transfers", b.token));
    expect(aList.txs.length).toBeGreaterThan(0);
    expect(bList.txs.length).toBe(0);
  });
});
