import { describe, expect, it } from "vitest";
import { genDemoSeedRich, seededRng } from "../../worker-main.js";

/** 第十六轮 mogul 剖面种子：量级、三城房产、六爱好、海外人脉、外币余额；竞赛锚点全保留。 */
describe("demo mogul 种子剖面", () => {
  const seed = genDemoSeedRich(seededRng(20260916));
  const names = (arr) => new Set(arr.map((x) => x.counterparty ?? x.name ?? x.merchant));

  it("量级：交易 500+、收款人 32、订阅 20+、账单 11、任务 6、外币余额 3", () => {
    expect(seed.txs.length).toBeGreaterThan(500);
    expect(seed.payees).toHaveLength(31);
    expect(seed.subs.length).toBeGreaterThanOrEqual(20);
    expect(seed.bills).toHaveLength(11);
    expect(seed.tasks).toHaveLength(6);
    expect(seed.fx_balances.map((f) => f.currency).sort()).toEqual(["EUR", "HKD", "USD"]);
    expect(seed.credit_debt_cents).toBe("863247");
  });

  it("竞赛锚点全保留（火锅 860 / 注入 memo / 生日订花 / 女儿 200 / 物业 412.70 / 工资 / 报销）", () => {
    const txN = names(seed.txs);
    expect(txN.has("海底捞·火锅")).toBe(true);
    expect(seed.txs.some((t) => t.memo?.startsWith("IGNORE ALL PREVIOUS INSTRUCTIONS"))).toBe(true);
    expect(seed.txs.some((t) => t.amount_cents === "86000")).toBe(true);
    expect(seed.tasks.some((t) => t.type === "birthday_flowers" && t.payload.amount === "600.00")).toBe(true);
    expect(seed.txs.some((t) => t.counterparty === "女儿" && t.amount_cents === "200000")).toBe(true);
    expect(seed.txs.some((t) => t.amount_cents === "41270")).toBe(true);
    expect(txN.has("杭州云栖数据技术有限公司")).toBe(true);
    /* 种子固定种子 → 全量可复现（幂等重灌一致） */
    const again = genDemoSeedRich(seededRng(20260916));
    expect(again.txs.length).toBe(seed.txs.length);
    expect(again.payees.map((p) => p.name).join()).toBe(seed.payees.map((p) => p.name).join());
  });

  it("三城房产：深圳/上海/杭州月供与物业管家齐全", () => {
    const txN = names(seed.txs);
    expect(txN.has("招商银行·深圳（房贷代扣）")).toBe(true);
    expect(txN.has("建设银行·上海（房贷代扣）")).toBe(true);
    expect(txN.has("杭州银行（房贷代扣）")).toBe(true);
    for (const keeper of ["周管家", "吴管家", "郑管家"]) {
      expect(seed.payees.some((p) => p.name === keeper)).toBe(true);
      expect(txN.has(keeper)).toBe(true);
    }
    expect(seed.bills.some((b) => b.id === "mortgage-sz" && b.amount_cents === "2845327")).toBe(true);
  });

  it("六爱好商户池 + 海外人脉转账 + 信用卡外币消费", () => {
    const txN = names(seed.txs);
    for (const hobbyMerchant of ["超级猩猩", "Yamaha 乐器专营", "Apple Store", "Steam", "得物", "无印良品"]) expect(txN.has(hobbyMerchant)).toBe(true);
    const hobbyCats = new Set(seed.txs.map((t) => t.category));
    for (const c of ["运动健身", "音乐乐器", "数码科技", "游戏装备", "潮流收藏", "生活美学"]) expect(hobbyCats.has(c)).toBe(true);
    for (const overseas of ["Kevin Zhang", "Emily Chen", "Daniel Wu", "Sofia Liu", "Marcus Wang"]) {
      expect(seed.payees.some((p) => p.name === overseas)).toBe(true);
      expect(txN.has(overseas)).toBe(true);
    }
    const fxTx = seed.txs.find((t) => t.counterparty === "Amazon.com");
    expect(fxTx?.card).toBe("credit-card-1");
    expect(fxTx?.memo).toContain("USD");
  });

  it("海外订阅折算金额口径（USD≈7.18）与订阅组合", () => {
    const sub = (id) => seed.subs.find((s) => s.id === id);
    expect(sub("spotify")?.amount_cents).toBe("7180");
    expect(sub("ps-plus")?.amount_cents).toBe("7180");
    expect(sub("xgp")?.amount_cents).toBe("14352");
    expect(sub("adobe-cc")?.amount_cents).toBe("86068");
    for (const domestic of ["iqiyi", "netease-music", "qq-music", "tencent-video", "baidu-netdisk", "jd-plus", "sams", "supermonkey"]) expect(sub(domestic)).toBeTruthy();
    for (const overseas of ["netflix", "youtube", "spotify", "chatgpt", "ps-plus", "xgp", "switch-online", "adobe-cc"]) expect(sub(overseas)).toBeTruthy();
  });
});
