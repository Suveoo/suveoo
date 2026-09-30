import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { accrualPrice } from "../../worker-main.js";
import goldJson from "../../../frontend/assets/data/funds/gold-index.json";
import asemiJson from "../../../frontend/assets/data/funds/ai-semi.json";
import moneyJson from "../../../frontend/assets/data/funds/global-money-1.json";

/** 第九期 NAV 实时化——集成：/api/wealth/funds-navs 三级降级（live → cache → static）+ 账务同源。
 *  测试池 NO_PRICE_FETCH=1（禁外呼）：预置 fund:prices:v1 / fx:live:v2(rates) 已知值驱动全部断言，零外呼。
 *  gold-index 底层 = GC=F 95.7% + ACC:USD:4.5 4.3%，静态 nav 2.2908 —— 校准恒等式 nav(t0) ≡ 2.2908。
 *  注意：j() 返回 Promise，必须 await j(await fetch(..))（少了外层 await 时 r 是 Promise，断言全 undefined——实测踩坑）。 */

const BASE = "https://suveoo.com";
const GOLD_PRICES = { "GC=F": { p: 2650.2, prev: 2641.8 } };
const RATES = { USD: 0.14, HKD: 1.1, EUR: 0.1284, JPY: 21.22, TWD: 4.52, KRW: 196.5 };

async function seedFx() {
  await env.SESSION_KV.put("fx:live:v2", JSON.stringify({
    ts: new Date().toISOString(),
    payload: { base: "CNY", source: "live", provider: "test", updated_at: new Date().toISOString(), quotes: [], rates: RATES, note: "test" },
  }));
}
async function seedPrices(prices, ageSeconds = 0) {
  await env.SESSION_KV.put("fund:prices:v1", JSON.stringify({
    ts: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    prices,
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
async function registerUser(email) {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return await j(await post("/api/auth/register", { email, code, name: "净值测试", password: "jinrongkeji2026", risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
/* 测试 R2 无生产基金 JSON：静态兜底臂需真实文件（断言用到的 3 只） */
async function seedFundJsons() {
  await Promise.all([
    env.ASSETS.put("assets/data/funds/gold-index.json", JSON.stringify(goldJson)),
    env.ASSETS.put("assets/data/funds/ai-semi.json", JSON.stringify(asemiJson)),
    env.ASSETS.put("assets/data/funds/global-money-1.json", JSON.stringify(moneyJson)),
  ]);
}
const goldRaw = (nowMs) => 0.957 * GOLD_PRICES["GC=F"].p * (1 / RATES.USD) + 0.043 * accrualPrice("4.5", nowMs);
const goldRawPrev = (nowMs) => 0.957 * GOLD_PRICES["GC=F"].prev * (1 / RATES.USD) + 0.043 * accrualPrice("4.5", nowMs - 86_400_000);

describe("理财 NAV 实时化（funds-navs 三级降级 + 账务同源）", () => {
  it("无会话 401；登录后 cache 臂：KV 旧值照常出价、as_of 如实标注（stale-while-revalidate）", async () => {
    const anon = await SELF.fetch(BASE + "/api/wealth/funds-navs");
    expect(anon.status).toBe(401);
    await anon.text();
    const out = await registerUser("nav1@test.dev");
    await seedFundJsons();
    await seedFx();
    await seedPrices(GOLD_PRICES, 600); /* 10 分钟前：已过 120s TTL → cache 臂 */
    const r = await j(await SELF.fetch(BASE + "/api/wealth/funds-navs", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(r.ok).toBe(true);
    expect(r.source).toBe("cache");
    expect(r.as_of).toBeTruthy();
    expect(r.age_seconds).toBeGreaterThanOrEqual(500);
    const gold = r.funds["gold-index"];
    expect(gold.live).toBe(true);
    expect(gold.nav).toBe(2.2908); /* 校准恒等：k×raw(t0) ≡ 静态 nav */
    const dc = +(((goldRaw(Date.now()) / goldRawPrev(Date.now())) - 1) * 100).toFixed(2);
    expect(Math.abs(gold.day_change - dc)).toBeLessThanOrEqual(0.02); /* 应计项随时间微移，容差 2bp */
  });

  it("live 臂：KV 新鲜 + refresh=1 旁路记忆 → source=live；缺价基金逐只回退静态（ai-semi），应计基金照常实时", async () => {
    const out = await registerUser("nav2@test.dev");
    await seedFundJsons();
    await seedFx();
    await seedPrices(GOLD_PRICES, 0); /* 新鲜 */
    const r = await j(await SELF.fetch(BASE + "/api/wealth/funds-navs?refresh=1", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(r.source).toBe("live");
    expect(r.as_of).toBeTruthy();
    expect(r.age_seconds).toBeLessThan(60);
    expect(r.funds["gold-index"].live).toBe(true);
    expect(r.funds["gold-index"].nav).toBe(2.2908);
    expect(typeof r.funds["gold-index"].market_open).toBe("boolean");
    /* 只喂了 GC=F 价：ai-semi 底层缺价 → 整只静态（无半实时）；global-money-1 纯应计 → 无需外价也实时 */
    expect(r.funds["ai-semi"].live).toBe(false);
    expect(r.funds["ai-semi"].nav).toBe(5.1069);
    expect(r.funds["global-money-1"].live).toBe(true);
    expect(r.funds["global-money-1"].nav).toBe(1.4206);
    expect(r.live_count).toBeGreaterThanOrEqual(2);
  });

  it("static 臂：价格 KV 清空 → 价格型基金全量回退静态（应计型照常实时），页面永不空白", async () => {
    const out = await registerUser("nav3@test.dev");
    await seedFundJsons();
    await seedFx();
    await env.SESSION_KV.delete("fund:prices:v1");
    const r = await j(await SELF.fetch(BASE + "/api/wealth/funds-navs?refresh=1", { headers: { authorization: `Bearer ${out.token}` } }));
    for (const slug of ["gold-index", "ai-semi", "cn-dividend"]) {
      expect(r.funds[slug].live, slug).toBe(false);
    }
    expect(r.funds["gold-index"].nav).toBe(2.2908); /* 静态兜底 = R2 JSON 里的既有净值（降级链终点不空白） */
    expect(r.funds["ai-semi"].nav).toBe(5.1069);
    expect(r.funds["global-money-1"].live).toBe(true); /* 纯应计资产无需外价：确定性应计照常实时 */
    expect(r.funds["global-money-1"].nav).toBe(1.4206);
  });

  it("账务同源：/api/wealth/holdings 的 nav/市值与 funds-navs 同值同源（申购计价 = 页面显示 = 赎回结算）", async () => {
    const out = await registerUser("nav4@test.dev");
    await seedFundJsons();
    await seedFx();
    await seedPrices(GOLD_PRICES, 0);
    await env.LEDGER.get(env.LEDGER.idFromName(`u:${out.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "wealthPurchase", fund: "gold-index", amount_cents: "100000", nav: "1.0" }),
    });
    const navs = await j(await SELF.fetch(BASE + "/api/wealth/funds-navs?refresh=1", { headers: { authorization: `Bearer ${out.token}` } }));
    const holdings = await j(await SELF.fetch(BASE + "/api/wealth/holdings", { headers: { authorization: `Bearer ${out.token}` } }));
    const h = holdings.holdings.find((x) => x.fund === "gold-index");
    expect(h).toBeTruthy();
    expect(Number(h.nav)).toBe(navs.funds["gold-index"].nav); /* 同一真相源：fundMeta 叠加 = funds-navs */
    /* 市值 = floor(¥1000 × nav / 成本 nav 1.0)——与赎回结算共用 marketValueCents（整数先乘后除） */
    expect(Number(h.value)).toBe(Math.floor(100000 * Number(h.nav)) / 100);
    expect(h.day_change).toBe(navs.funds["gold-index"].day_change);
  });
});
