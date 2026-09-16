import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

/** 任务四：换汇按服务端实时牌价结算（购汇 sell / 结汇 buy，JPY 每 100 口径）、可选结算卡、外币余额可见。
 *  测试用已知牌价预置 KV 缓存（fx:live:v2），hFxLive 直接命中缓存 → 无外呼、数字确定。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

/* USD buy 7.1024 / sell 7.1782；JPY buy 4.9000 / sell 5.1000（每 100 日元） */
const QUOTES = [
  { code: "USD", name: "美元", flag: "/flags/us.svg", buy: "7.1024", sell: "7.1782", mid: "7.1403", spark: [7.1, 7.1, 7.1, 7.1, 7.1, 7.1, 7.1] },
  { code: "JPY", name: "日元（100）", flag: "/flags/jp.svg", buy: "4.9000", sell: "5.1000", mid: "5.0000", spark: [5, 5, 5, 5, 5, 5, 5] },
];
async function seedQuotes() {
  await env.SESSION_KV.put("fx:live:v2", JSON.stringify({
    ts: new Date().toISOString(),
    payload: { base: "CNY", source: "live", provider: "test", updated_at: new Date().toISOString(), quotes: QUOTES, note: "test" },
  }));
}

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
const cardsOf = async (uid) => (await doOp(`u:${uid}`, { op: "getCards" })).cards;
const defCard = async (uid) => (await cardsOf(uid)).find((c) => c.kind === "debit" && Number(c.is_default) === 1);

/** 两段式换汇（黄级 ¥<1000 无需 OTP） */
async function exchange(token, body) {
  const s1 = await j(await post("/api/fx/exchange", body, token));
  if (s1.status === "INPUT_REQUIRED") return j(await post("/api/fx/exchange", { ...body, grant_hash: s1.grant.grant_hash }, token));
  return s1;
}

describe("换汇实时结算（任务四）", () => {
  it("购汇 USD ¥690 → 按卖出价 7.1782 得 96.12 美元，默认卡扣 ¥690，外币余额可查", async () => {
    await seedQuotes();
    const out = await registerUser("fx1@test.dev");
    const before = BigInt((await defCard(out.user_id)).balance_cents);
    const r = await exchange(out.token, { direction: "buy", currency: "USD", amount_cny: "690" });
    expect(r.status).toBe("EXECUTED");
    expect(r.result.ok).toBe(true);
    expect(r.result.foreign_amount).toBe("96.12"); // floor(69000×10000/71782) = 9612 分
    expect(r.result.cny_amount).toBe("690.00");
    const after = await defCard(out.user_id);
    expect(BigInt(after.balance_cents)).toBe(before - 69000n);
    const bal = await j(await SELF.fetch(BASE + "/api/fx/balances", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(bal.balances.length).toBe(1);
    expect(bal.balances[0]).toMatchObject({ currency: "USD", amount: "96.12" });
    expect(Number(bal.balances[0].cny_estimate)).toBeCloseTo(96.12 * 7.1024, 2); // 按买入价折算
  });

  it("JPY 专项（每 100 口径）：购汇 ¥500 → 9803.92 日元（50000×10⁴×100/51000）", async () => {
    await seedQuotes();
    const out = await registerUser("fx2@test.dev");
    const r = await exchange(out.token, { direction: "buy", currency: "JPY", amount_cny: "500" });
    expect(r.status).toBe("EXECUTED");
    expect(r.result.foreign_amount).toBe("9803.92"); // ¥500 ÷ 5.10（每 100 日元）× 100
    const bal = await j(await SELF.fetch(BASE + "/api/fx/balances", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(bal.balances[0]).toMatchObject({ currency: "JPY", amount: "9803.92" });
  });

  it("指定 from_card：扣该卡而非默认卡", async () => {
    await seedQuotes();
    const out = await registerUser("fx3@test.dev");
    const cards = await cardsOf(out.user_id);
    const def = cards.find((c) => Number(c.is_default) === 1 && c.kind === "debit");
    const other = cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    const before = {
      def: BigInt(def.balance_cents),
      other: BigInt(other.balance_cents),
    };
    const r = await exchange(out.token, { direction: "buy", currency: "USD", amount_cny: "100", from_card: other.slug });
    expect(r.status).toBe("EXECUTED");
    const after = await cardsOf(out.user_id);
    const afterDef = after.find((c) => c.slug === def.slug);
    const afterOther = after.find((c) => c.slug === other.slug);
    expect(BigInt(afterDef.balance_cents)).toBe(before.def); // 默认卡不动
    expect(BigInt(afterOther.balance_cents)).toBe(before.other - 10000n); // 指定卡扣款
  });

  it("结汇：55.72 USD 按买入价 7.1024 → ¥395.74；超出余额被拦（INSUFFICIENT_FX）", async () => {
    await seedQuotes();
    const out = await registerUser("fx4@test.dev");
    await exchange(out.token, { direction: "buy", currency: "USD", amount_cny: "400" }); // → 55.72 USD（控制在黄级日累计内）
    const before = BigInt((await defCard(out.user_id)).balance_cents);
    const sell = await exchange(out.token, { direction: "sell", currency: "USD", amount_foreign: "55.72" });
    expect(sell.status).toBe("EXECUTED");
    expect(sell.result.cny_amount).toBe("395.74"); // floor(5572×71024/10000) = 39574 分
    expect(sell.result.foreign_amount).toBe("55.72");
    const after = await defCard(out.user_id);
    expect(BigInt(after.balance_cents)).toBe(before + 39574n);
    const bal = await j(await SELF.fetch(BASE + "/api/fx/balances", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(bal.balances.length).toBe(0);
    /* 余额不足：BLOCKED INSUFFICIENT_FX（业务失败不再误报 EXECUTED） */
    const bad = await exchange(out.token, { direction: "sell", currency: "USD", amount_foreign: "1" });
    expect(bad.status).toBe("BLOCKED");
    expect(bad.reason).toBe("INSUFFICIENT_FX");
  });

  it("客户端 rate 不参与结算：伪造 rate=1 → 仍按服务端牌价成交", async () => {
    await seedQuotes();
    const out = await registerUser("fx5@test.dev");
    const r = await exchange(out.token, { direction: "buy", currency: "USD", amount_cny: "690", rate: "1" });
    expect(r.status).toBe("EXECUTED");
    expect(r.result.foreign_amount).toBe("96.12"); // 与无 rate 时一致
  });

  it("MCP 通道同数学：fx_exchange 购汇 → 与 REST 成交数字一致", async () => {
    await seedQuotes();
    const out = await registerUser("fx6@test.dev");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const call = (args) => SELF.fetch(`${BASE}/mcp?sid=fx6`, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fx_exchange", arguments: args } }) });
    const c1 = JSON.parse((await j(await call({ direction: "buy", currency: "USD", amount_cny: "690" }))).result.content[0].text);
    expect(c1.status).toBe("INPUT_REQUIRED");
    const c2 = JSON.parse((await j(await call({ direction: "buy", currency: "USD", amount_cny: "690", grant_hash: c1.grant.grant_hash }))).result.content[0].text);
    expect(c2.status).toBe("EXECUTED");
    expect(c2.foreign_amount).toBe("96.12");
    /* fx_balance_query（GREEN）可查 */
    const b = JSON.parse((await j(await SELF.fetch(`${BASE}/mcp?sid=fx6`, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "fx_balance_query", arguments: {} } }) }))).result.content[0].text);
    expect(b.balances[0]).toMatchObject({ currency: "USD", amount: "96.12" });
    expect(b.balances[0].cny_estimate).toBe("682.68"); // floor(9612×71024/10000) = 68268 分
  });
});
