import { describe, expect, it } from "vitest";
import { RISK, classifyRisk, hardPolicyDenials, POLICY_LIMITS } from "../../worker-main.js";

describe("③ classifyRisk 三色分级", () => {
  it("只读工具一律绿色", () => {
    for (const t of ["account_query", "transaction_history", "bill_analysis", "split_bill_calculate", "contacts_search"]) {
      expect(classifyRisk(t, {}).tier).toBe(RISK.GREEN);
    }
  });

  it("转账 ≤¥1,000 日累计 → 黄；超出 → 红（边界含本笔）", () => {
    expect(classifyRisk("transfer_execute", { amount: "500" }).tier).toBe(RISK.YELLOW);
    expect(classifyRisk("transfer_execute", { amount: "1000" }, { dailyAccumulatedCents: 0n }).tier).toBe(RISK.YELLOW);
    expect(classifyRisk("transfer_execute", { amount: "1000" }, { dailyAccumulatedCents: 1n }).tier).toBe(RISK.RED);
    expect(classifyRisk("transfer_execute", { amount: "500" }, { dailyAccumulatedCents: 60000n }).tier).toBe(RISK.RED); // 500+600=1100
  });

  it("结汇购汇同样按 CNY 等值动态分级", () => {
    expect(classifyRisk("fx_exchange", { amount_cny: "500" }).tier).toBe(RISK.YELLOW);
    expect(classifyRisk("fx_exchange", { amount_cny: "2000" }).tier).toBe(RISK.RED);
  });

  it("注册为红的工具恒红", () => {
    for (const t of ["wealth_product_purchase", "wealth_product_redeem", "card_freeze", "card_unfreeze", "ecommerce_order_mock"]) {
      expect(classifyRisk(t, { amount: "10" }).tier).toBe(RISK.RED);
    }
  });

  it("未注册工具返回 null tier", () => {
    expect(classifyRisk("steal_all_funds", {}).tier).toBeNull();
  });
});

describe("③ hardPolicyDenials 硬拒绝", () => {
  it("金额非法或非正数一律拒绝", () => {
    expect(hardPolicyDenials("transfer_execute", { amount: "0" })).toHaveLength(1);
    expect(hardPolicyDenials("transfer_execute", { amount: "-5" })[0].code).toBe("INVALID_AMOUNT");
    expect(hardPolicyDenials("transfer_execute", { amount: "abc" })[0].code).toBe("INVALID_AMOUNT");
    expect(hardPolicyDenials("transfer_execute", { amount: "100" })).toHaveLength(0);
  });

  it("AI 通道单笔硬上限 ¥5,000（表单通道不受此限）", () => {
    expect(hardPolicyDenials("transfer_execute", { amount: "6000" }, { channel: "ai" })[0].code).toBe("AI_SINGLE_LIMIT_EXCEEDED");
    expect(hardPolicyDenials("transfer_execute", { amount: "6000" }, { channel: "form" })).toHaveLength(0);
    expect(hardPolicyDenials("transfer_execute", { amount: "5000" }, { channel: "ai" })).toHaveLength(0); // 边界：等于上限放行
  });

  it("AI 通道日累计硬上限 ¥10,000", () => {
    expect(hardPolicyDenials("transfer_execute", { amount: "1000" }, { channel: "ai", dailyAccumulatedCents: 900001n })[0].code)
      .toBe("AI_DAILY_LIMIT_EXCEEDED");
    expect(hardPolicyDenials("transfer_execute", { amount: "1000" }, { channel: "ai", dailyAccumulatedCents: 900000n })).toHaveLength(0); // 边界：恰等于上限放行
  });

  it("AI 硬上限只约束转账类：理财申购大额不受转账限额误伤", () => {
    expect(hardPolicyDenials("wealth_product_purchase", { amount: "50000" }, { channel: "ai" })).toHaveLength(0);
    expect(hardPolicyDenials("fx_exchange", { amount_cny: "6000" }, { channel: "ai" })[0].code).toBe("AI_SINGLE_LIMIT_EXCEEDED");
  });

  it("阈值常量与 pages.md §2.10 一致", () => {
    expect(POLICY_LIMITS.YELLOW_DAILY_CENTS).toBe(100000n); // ¥1,000
    expect(POLICY_LIMITS.AI_SINGLE_CENTS).toBe(500000n);    // ¥5,000
    expect(POLICY_LIMITS.AI_DAILY_CENTS).toBe(1000000n);    // ¥10,000
  });
});
