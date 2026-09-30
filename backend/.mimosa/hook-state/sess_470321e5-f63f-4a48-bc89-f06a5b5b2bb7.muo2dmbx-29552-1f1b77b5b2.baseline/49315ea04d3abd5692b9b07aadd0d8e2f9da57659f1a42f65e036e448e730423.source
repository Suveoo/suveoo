import { describe, expect, it } from "vitest";
import {
  toCents, centsToStr, moneyAdd, moneySub, moneyCmp, mulRatio, splitEqually,
  luhnCheckDigit, isLuhnValid, newCardNumber, maskCardNumber,
} from "../../worker-main.js";

describe("⑦.1 十进制金额（bigint cents）", () => {
  it("解析字符串与数字（含补零与负数）", () => {
    expect(toCents("500")).toBe(50000n);
    expect(toCents("500.5")).toBe(50050n);
    expect(toCents("500.55")).toBe(50055n);
    expect(toCents(1234.56)).toBe(123456n);
    expect(toCents("0.01")).toBe(1n);
    expect(toCents("-12.34")).toBe(-1234n);
    expect(toCents(" 860.00 ")).toBe(86000n);
  });

  it("拒绝非法格式", () => {
    expect(() => toCents("500.555")).toThrow(); // 三位小数
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents(null)).toThrow();
  });

  it("centsToStr 恒两位小数且可往返", () => {
    expect(centsToStr(50055n)).toBe("500.55");
    expect(centsToStr(50000n)).toBe("500.00");
    expect(centsToStr(1n)).toBe("0.01");
    expect(centsToStr(-1234n)).toBe("-12.34");
    expect(centsToStr(toCents("999328.24"))).toBe("999328.24"); // 开户余额区间下界
    expect(centsToStr(toCents("1124549.38"))).toBe("1124549.38"); // 上界
  });

  it("加减比较不受浮点误差影响（0.1+0.2 陷阱）", () => {
    expect(moneyAdd(toCents("0.1"), toCents("0.2"))).toBe(toCents("0.3"));
    expect(moneySub(toCents("1.0"), toCents("0.3"))).toBe(toCents("0.7"));
    expect(moneyCmp(toCents("0.3"), moneyAdd(toCents("0.1"), toCents("0.2")))).toBe(0);
    expect(moneyCmp(toCents("0.30"), toCents("0.31"))).toBe(-1);
  });

  it("mulRatio 精确比例乘（向下取整）", () => {
    expect(mulRatio(86000n, 1n, 2n)).toBe(43000n);
    expect(mulRatio(99n, 1n, 2n)).toBe(49n); // 0.495 → 49 分
    expect(() => mulRatio(100n, 1n, 0n)).toThrow();
  });
});

describe("⑦.1 splitEqually（AA 分账守恒）", () => {
  it("火锅 860 元三人 AA：总和严格等于 860.00", () => {
    const parts = splitEqually(toCents("860.00"), 3);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(86000n);
    // 86000/3 = 28666.67 分：前两人 28667、第三人 28666（余数按顺序 +1 分）
    expect(parts.map(centsToStr)).toEqual(["286.67", "286.67", "286.66"]);
  });

  it("整除情形无余数", () => {
    expect(splitEqually(toCents("900.00"), 3).map(centsToStr)).toEqual(["300.00", "300.00", "300.00"]);
  });

  it("金额小到不够每人 1 分时守恒仍成立", () => {
    const parts = splitEqually(2n, 3);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(2n);
    expect(parts.map(Number)).toEqual([1, 1, 0]);
  });

  it("非法参数拒绝", () => {
    expect(() => splitEqually(100n, 0)).toThrow();
    expect(() => splitEqually(100n, -1)).toThrow();
    expect(() => splitEqually(100, 2)).toThrow(); // 非 bigint
  });
});

describe("⑦.2 Luhn 与卡号生成", () => {
  it("Luhn 校验位：经典用例 7992739871 → 3", () => {
    expect(luhnCheckDigit("7992739871")).toBe(3);
  });

  it("生成 16 位且 Luhn 合法的卡号", () => {
    const n = newCardNumber({ bin: "622288" });
    expect(n).toMatch(/^\d{16}$/);
    expect(n.startsWith("622288")).toBe(true);
    expect(isLuhnValid(n)).toBe(true);
  });

  it("rng 注入可复现；不同序列产出不同卡号", () => {
    const seq = () => 0.1;
    expect(newCardNumber({ rng: seq })).toBe(newCardNumber({ rng: seq }));
    expect(newCardNumber({ rng: seq })).not.toBe(newCardNumber({ rng: Math.random }));
  });

  it("BIN 非法拒绝；掩码格式正确", () => {
    expect(() => newCardNumber({ bin: "12345" })).toThrow();
    expect(maskCardNumber("6222881234567812")).toBe("**** 7812");
  });
});
