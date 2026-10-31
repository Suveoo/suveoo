import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "../../worker-main.js";

/** P3-13：恒等比较不再按长度早退（长度差异也折进累积差）。 */
describe("constantTimeEqual", () => {
  it("等长相同/不同", () => {
    expect(constantTimeEqual("abcd", "abcd")).toBe(true);
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
  });
  it("长度不等一律 false（且不早退：前缀相同也不行）", () => {
    expect(constantTimeEqual("abcd", "abcde")).toBe(false);
    expect(constantTimeEqual("abcde", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
  it("非字符串输入安全返回 false", () => {
    expect(constantTimeEqual(null, "a")).toBe(false);
    expect(constantTimeEqual("a", undefined)).toBe(false);
    expect(constantTimeEqual(123, "123")).toBe(false);
  });
});
