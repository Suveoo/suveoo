import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { marketValueCents } from "../../worker-main.js";

/** 任务三：赎回按市值结算（回款 = floor(本金 × 当前净值 / 成本净值)，整数运算）。
 *  涨/平/跌三场景精确断言 + API 端到端（页面显示值 === 实际回款额）。 */
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
const get = (path, token) => SELF.fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });

/* 测试基金 JSON 写入测试 R2（fundMeta 直接读 R2，无缓存；覆盖 nav 即可驱动结算） */
const fundJson = (nav) => JSON.stringify({ slug: "test-fund", name: "测试市值基金", risk_level: 1, min_invest: "0.01", nav, returns: { "1y": 5 }, stats: {}, fee: { total: "0.5%" } });
const defCard = async (uid) => (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);

describe("赎回市值结算：涨 / 平 / 跌（DO op 精确断言）", () => {
  for (const [tag, nav, expectCents] of [["涨", 1.8, "120000"], ["平", 1.5, "100000"], ["跌", 1.2, "80000"]]) {
    it(`成本净值 1.5、当前 ${nav} → 本金 ¥1,000 回款 ${expectCents.slice(0, -2)}.${expectCents.slice(-2)}`, async () => {
      const out = await registerUser(`wr-${tag}@test.dev`);
      await doOp(`u:${out.user_id}`, { op: "wealthPurchase", fund: "test-fund", amount_cents: "100000", nav: "1.5" });
      const before = BigInt((await defCard(out.user_id)).balance_cents);
      const r = await doOp(`u:${out.user_id}`, { op: "wealthRedeem", fund: "test-fund", nav });
      expect(r.ok).toBe(true);
      expect(r.amount).toBe(`${expectCents.slice(0, -2)}.${expectCents.slice(-2)}`);
      expect(r.principal).toBe("1000.00");
      const after = await defCard(out.user_id);
      expect(BigInt(after.balance_cents)).toBe(before + BigInt(expectCents));
      /* 持仓清零 + IN 流水金额 = 回款额，memo 含结算口径 */
      const hold = await doOp(`u:${out.user_id}`, { op: "holdings" });
      expect(BigInt(hold.holdings.find((h) => h.fund === "test-fund")?.amount_cents ?? "0")).toBe(0n);
      const txs = await doOp(`u:${out.user_id}`, { op: "transfers", cursor: "0" });
      const row = txs.txs.find((t) => t.counterparty?.includes("test-fund") && t.direction === "IN");
      expect(row.amount_cents).toBe(expectCents);
      expect(row.memo).toContain("赎回结算");
    });
  }
});

describe("赎回市值结算：API 端到端（显示值 === 回款额）", () => {
  it("持仓成本 1.5、净值涨至 1.8 → 持仓页市值 === 赎回到账（¥1,200）", async () => {
    const email = "wr-api@test.dev";
    const out = await registerUser(email);
    /* 申购经 DO 直设（redstep 发码有 60s 冷却，本用例的 OTP 额度留给赎回环节） */
    await doOp(`u:${out.user_id}`, { op: "wealthPurchase", fund: "test-fund", amount_cents: "100000", nav: "1.5" });
    await env.ASSETS.put("assets/data/funds/test-fund.json", fundJson(1.8));
    const h = await j(await get("/api/wealth/holdings", out.token));
    const holding = h.holdings.find((x) => x.fund === "test-fund");
    expect(holding.value).toBe("1200.00");
    expect(Number(holding.nav)).toBe(1.8);
    /* 赎回（红级：OTP 两段式） */
    const before = BigInt((await defCard(out.user_id)).balance_cents);
    const r1 = await j(await post("/api/wealth/redeem", { product_id: "test-fund", amount: "ALL" }, out.token));
    expect(r1.tier).toBe("RED");
    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    const r2 = await j(await post("/api/wealth/redeem", { product_id: "test-fund", amount: "ALL", grant_hash: r1.grant.grant_hash, otp }, out.token));
    expect(r2.status).toBe("EXECUTED");
    expect(r2.result.amount).toBe("1200.00");
    const after = await defCard(out.user_id);
    /* 余额增量 === 持仓页显示市值（而非本金 1000） */
    expect(BigInt(after.balance_cents) - before).toBe(120000n);
  });
});

describe("marketValueCents 纯函数", () => {
  it("先乘后除整数运算：1,000,000 分 × 1.8 / 1.5 = 1,200,000 分", () => {
    expect(marketValueCents(1000000n, "1.5", "1.8")).toBe(1200000n);
    expect(marketValueCents(100000n, "1.0500", 2.1)).toBe(200000n);
  });
  it("向下取整：除不尽时 floor", () => {
    expect(marketValueCents(10001n, "1.5", "1.8")).toBe(12001n); // 10001*1.2 = 12001.2 → 12001
    expect(marketValueCents(101n, "3", "1")).toBe(33n); // 101/3 = 33.67 → 33
  });
});
