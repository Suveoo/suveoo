/* batch-ops.test.js — 第一百零五轮：操作组合（plan_preview/batch_execute）纯函数层
 * 分级（整卡=最高项+合计日累计口径）、硬校验（逐项+合计 AI 上限+结构约束）。 */
import { describe, it, expect } from "vitest";
import { classifyRisk, hardPolicyDenials, AI_SYSTEM_PROMPT } from "../../worker-main.js";

const RISK = { GREEN: "GREEN", YELLOW: "YELLOW", RED: "RED" };
const Y = 100000n; /* ¥1000 黄线 */

describe("操作组合分级（classifyRisk batch_execute）", () => {
  it("同工具多目标（两张冻结卡）：整卡=最高项=红", () => {
    const items = [
      { intent: "card_freeze", args: { card_id: "a" } },
      { intent: "card_freeze", args: { card_id: "b" } },
    ];
    expect(classifyRisk("batch_execute", { items }, { dailyAccumulatedCents: 0n }).tier).toBe(RISK.RED);
  });
  it("全黄组合（订阅退订+收款人）=黄；混入一张红卡=红", () => {
    const yels = [
      { intent: "subscription_cancel", args: { subscription_id: 1 } },
      { intent: "payee_manage", args: { action: "delete", id: 2 } },
    ];
    expect(classifyRisk("batch_execute", { items: yels }, { dailyAccumulatedCents: 0n }).tier).toBe(RISK.YELLOW);
    expect(classifyRisk("batch_execute", { items: [...yels, { intent: "card_freeze", args: { card_id: "x" } }] }, { dailyAccumulatedCents: 0n }).tier).toBe(RISK.RED);
  });
  it("合计金额口径：两笔 ¥600 黄级项相加+今日 ¥0 → 超黄线整卡升红（赛题日累计口径）", () => {
    const items = [
      { intent: "transfer_execute", args: { recipient: "acct:6222020200112230", amount: "600.00" } },
      { intent: "transfer_execute", args: { recipient: "acct:6222020200112231", amount: "600.00" } },
    ];
    const r = classifyRisk("batch_execute", { items }, { dailyAccumulatedCents: 0n });
    expect(r.tier).toBe(RISK.RED);
    expect(r.reasons.some((x) => x.code === "DAILY_ACCUM_EXCEEDED")).toBe(true);
  });
  it("预约执行日口径继承：明日执行的两笔 ¥600 不计今日累计 → 黄", () => {
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString();
    const items = [
      { intent: "scheduled_task_create", args: { task_type: "scheduled_transfer", amount: "600.00", execute_at: tomorrow, transfer: { amount: "600.00", recipient_account: "6222020200112230", recipient_name: "x", execute_at: tomorrow } } },
    ];
    expect(classifyRisk("batch_execute", { items }, { dailyAccumulatedCents: 0n }).tier).toBe(RISK.YELLOW);
  });
  it("未知子项：升红并带 BATCH_UNKNOWN_ITEM 理由", () => {
    const r = classifyRisk("batch_execute", { items: [{ intent: "no_such_tool", args: {} }] }, { dailyAccumulatedCents: 0n });
    expect(r.tier).toBe(RISK.RED);
    expect(r.reasons.some((x) => x.code === "BATCH_UNKNOWN_ITEM")).toBe(true);
  });
});

describe("操作组合硬校验（hardPolicyDenials batch_execute）", () => {
  it("空/超 8 项拒绝", () => {
    expect(hardPolicyDenials("batch_execute", { items: [] })[0].code).toBe("INVALID_ARGS");
    const nine = Array.from({ length: 9 }, () => ({ intent: "card_freeze", args: { card_id: "x" } }));
    expect(hardPolicyDenials("batch_execute", { items: nine })[0].code).toBe("INVALID_ARGS");
  });
  it("绿项/嵌套拒绝；逐项金额错误带 [intent] 前缀", () => {
    const d1 = hardPolicyDenials("batch_execute", { items: [{ intent: "account_query", args: {} }] });
    expect(d1.some((x) => x.message.includes("纯查询不进组合"))).toBe(true);
    const d2 = hardPolicyDenials("batch_execute", { items: [{ intent: "batch_execute", args: {} }] });
    expect(d2.some((x) => x.message.includes("不可嵌套"))).toBe(true);
    const d3 = hardPolicyDenials("batch_execute", { items: [{ intent: "transfer_execute", args: { recipient: "acct:6222020200112230", amount: "-5" } }] });
    expect(d3.some((x) => x.code === "INVALID_AMOUNT" && x.message.startsWith("[transfer_execute]"))).toBe(true);
  });
  it("AI 通道合计防绕过：8 笔 ¥5000（各低于单笔上限）合计破日上限拒绝", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ intent: "transfer_execute", args: { recipient: `acct:622202020011223${i}`, amount: "5000.00" } }));
    const d = hardPolicyDenials("batch_execute", { items }, { channel: "ai", dailyAccumulatedCents: 0n });
    expect(d.some((x) => x.code === "AI_DAILY_LIMIT_EXCEEDED")).toBe(true);
  });
});

describe("提示词预算（规则 12 并入后）", () => {
  it("AI_SYSTEM_PROMPT ≤ 2050 字符", () => {
    expect(AI_SYSTEM_PROMPT.length).toBeLessThanOrEqual(2050);
  });
});
