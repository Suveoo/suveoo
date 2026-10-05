import { describe, expect, it } from "vitest";
import { toCents } from "../../worker-main.js";

/** B2 金额解析（第一百三十一轮 · 板块一 Phase 1）：本地确定性 30 条。
 *  口径：toCents 是服务端唯一金额入口（模型侧中文数字归一后仍须产出此处合法形态）。
 *  偏差说明：中文数字（"一百二十三块五"）属模型侧行为，划入 L1/B1 生产实测（工具入参必经本入口校验）。 */
describe("B2 金额解析 · 合法形态（20）", () => {
  const cases = [
    ["0", 0n], ["0.00", 0n], ["1", 100n], ["1.2", 120n], ["1.23", 123n],
    ["0.05", 5n], ["0.5", 50n], ["50", 5000n], ["1234567.89", 123456789n],
    ["999999.99", 99999999n], ["1000000.00", 100000000n], [" 12.34 ", 1234n],
    ["007", 700n], ["1000", 100000n], ["88.8", 8880n], ["0.10", 10n],
  ];
  it.each(cases)("toCents(%j) === %i 分", (input, cents) => {
    expect(toCents(input)).toBe(cents);
  });
  it("数字入参（2）：100 → 10000 分；1.5 → 150 分", () => {
    expect(toCents(100)).toBe(10000n);
    expect(toCents(1.5)).toBe(150n);
  });
  it("边界两位（2）：最大两位小数不进位丢分", () => {
    expect(toCents("0.99")).toBe(99n);
    expect(toCents("1.99")).toBe(199n);
  });
});

describe("B2 金额解析 · 非法形态必拒（10）", () => {
  const evils = ["１０００", "1,000", "1.234", "1e9", "", "  ", "1 2", "0.001", "12.34.56", "+5"];
  it.each(evils)("toCents(%j) 必须抛出（畸形不静默容错）", (evil) => {
    expect(() => toCents(evil)).toThrow();
  });
});
