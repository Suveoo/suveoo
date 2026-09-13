import { describe, expect, it } from "vitest";
import {
  generateCardPlan, buildCardsForRegistration, DEBIT_TOTAL_RANGE, CREDIT_LIMIT_CENTS,
  BIN_BY_NETWORK, CREDIT_BIN, isLuhnValid, toCents, publicCard,
} from "../../worker-main.js";

/** 确定性 rng（mulberry32）。 */
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("⑦.6 generateCardPlan 开户方案", () => {
  it("借记总余额落在既定区间；四卡余额守恒且为正", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plan = generateCardPlan({ rng: rngOf(seed) });
      expect(plan.totalCents >= DEBIT_TOTAL_RANGE.min).toBe(true);
      expect(plan.totalCents <= DEBIT_TOTAL_RANGE.max).toBe(true);
      expect(plan.floors.reduce((a, b) => a + b, 0n)).toBe(plan.totalCents);
      for (const f of plan.floors) expect(f > 0n).toBe(true);
    }
  });

  it("卡面 8 选 4 不重复；类别两 I 两 II；网络组合固定；默认卡唯一", () => {
    const plan = generateCardPlan({ rng: rngOf(42) });
    expect(new Set(plan.debitArts).size).toBe(4);
    for (const a of plan.debitArts) expect(a).toBeGreaterThanOrEqual(1), expect(a).toBeLessThanOrEqual(8);
    expect(plan.classes.sort()).toEqual(["I", "I", "II", "II"]);
    expect([...plan.networks].sort()).toEqual(["万事达", "全付通", "银联", "银联"]);
    expect(plan.defaultIdx).toBeGreaterThanOrEqual(0);
    expect(plan.defaultIdx).toBeLessThanOrEqual(3);
    expect(plan.creditArt).toBeGreaterThanOrEqual(1);
    expect(plan.creditArt).toBeLessThanOrEqual(4);
  });
});

describe("⑦.6 buildCardsForRegistration 组装", () => {
  const plan = generateCardPlan({ rng: rngOf(7) });
  // 假卡号按网络 BIN 推导（真实流程由 registry 按 BIN+Luhn 生成，此处只测组装映射）
  const NUMBERS = [...plan.networks.map((n) => `${BIN_BY_NETWORK[n]}000000123`), `${CREDIT_BIN}000000456`];
  const cards = buildCardsForRegistration(plan, NUMBERS);

  it("4 借记 + 1 信用卡；卡号按序；卡面路径与网络对应", () => {
    expect(cards).toHaveLength(5);
    expect(cards.filter((c) => c.kind === "debit")).toHaveLength(4);
    const credit = cards[4];
    expect(credit.slug).toBe("credit-card-1");
    expect(credit.limit_cents).toBe(String(CREDIT_LIMIT_CENTS));
    expect(credit.balance_cents).toBe("0");
    expect(credit.is_default).toBe(0);
    plan.floors.forEach((bal, i) => expect(cards[i].balance_cents).toBe(String(bal)));
    plan.networks.forEach((n, i) => {
      expect(cards[i].network).toBe(n);
      expect(cards[i].number.startsWith(BIN_BY_NETWORK[n])).toBe(true);
    });
    expect(cards[4].number.startsWith(CREDIT_BIN)).toBe(true);
  });

  it("恰好一张默认卡且为借记卡；信用卡额度折合 ¥320,000", () => {
    const defaults = cards.filter((c) => c.is_default === 1);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].kind).toBe("debit");
    expect(toCents(defaults[0] === cards[4] ? "0" : "320000") >= 0n).toBe(true);
    expect(toCents("320000.00")).toBe(CREDIT_LIMIT_CENTS);
  });

  it("publicCard 视图：卡号掩码、字符串金额、默认标记", () => {
    const view = publicCard({ ...cards[0], status: "ACTIVE" });
    expect(view.number).toBe(`**** ${cards[0].number.slice(-4)}`);
    expect(view.balance).toMatch(/^\d+\.\d{2}$/);
    expect(view.limit).toBeNull(); // 借记卡无额度
    const creditView = publicCard({ ...cards[4], status: "ACTIVE" });
    expect(creditView.limit).toBe("320000.00");
  });
});
