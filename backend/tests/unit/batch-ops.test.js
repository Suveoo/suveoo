/* batch-ops.test.js — 第一百零五轮：操作组合（plan_preview/batch_execute）纯函数层
 * 分级（整卡=最高项+合计日累计口径）、硬校验（逐项+合计 AI 上限+结构约束）。 */
import { describe, it, expect } from "vitest";
import { classifyRisk, hardPolicyDenials, AI_SYSTEM_PROMPT, batchItemFields, batchItemSummary } from "../../worker-main.js";
/* 语言包静态导入：workerd 运行时 fs 虚拟化读不了仓库路径，transform 期解析是唯一可靠方式 */
import zhCN from "../../../frontend/i18n/zh-CN.json" with { type: "json" };
import zhTW from "../../../frontend/i18n/zh-TW.json" with { type: "json" };
import enUS from "../../../frontend/i18n/en-US.json" with { type: "json" };
import fbDict from "../../../frontend/i18n/fallback.json" with { type: "json" };

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
  it("AI_SYSTEM_PROMPT ≤ 2600 字符（第一百六十二轮 2050→2198；第二百零七轮 2200→2600：规则 10.1 模拟商户代付/订购与路由判据）", () => {
    expect(AI_SYSTEM_PROMPT.length).toBeLessThanOrEqual(2600);
  });
});

describe("组合卡换汇字段（第一百六十三轮修复锁定：方向映射 + 方向感知金额）", () => {
  /* fxNormalizeArgs 归一后的钉死形态（plan_preview 预检归一进 args） */
  const buy = { direction: "buy", currency: "USD", amount_cny: "690.00", amount_foreign: "96.12", rate_used: "7.1782", from_card: null };
  const sell = { direction: "sell", currency: "JPY", amount_cny: "480.24", amount_foreign: "9800.00", rate_used: "4.9000", from_card: null };
  const fields = (a) => Object.fromEntries(batchItemFields("fx_exchange", a));

  it("购汇：方向正确（buy→购汇，修复前反写为结汇）；主金额=人民币，对侧=外币，牌价带口径", () => {
    const f = fields(buy);
    expect(f.direction).toBe("购汇");
    expect(f.amount).toBe("¥ 690.00");
    expect(f.converted).toBe("96.12 USD");
    expect(f.rate).toBe("7.1782");
    expect(f.amount).not.toBe("?"); /* 修复前取不存在的 A.amount 恒 "¥ ?" */
  });
  it("结汇：sell→结汇；主金额=卖出外币（JPY 每 100 口径标注），折合人民币入 converted", () => {
    const f = fields(sell);
    expect(f.direction).toBe("结汇");
    expect(f.amount).toBe("9800.00 JPY");
    expect(f.converted).toBe("¥ 480.24");
    expect(f.rate).toBe("4.9000（每 100 日元）");
  });
  it("摘要行方向正确且两侧金额成对出现（修复前方向原样英文 + 金额恒 ?）", () => {
    expect(batchItemSummary(null, "fx_exchange", buy)).toBe("购汇 USD ¥690.00（折合 96.12 USD）");
    expect(batchItemSummary(null, "fx_exchange", sell)).toBe("结汇 JPY 9800.00 JPY（折合 ¥480.24）");
  });
  it("组合卡字段键零裸键：batchItemFields 发出的每个 op.f.* 标签在四个语言包全部在册", () => {
    const dicts = [zhCN, zhTW, enUS, fbDict];
    /* 覆盖 emit 字段键的主要 intent 形态（空 args 也走 push 分支的键全部暴露） */
    const samples = {
      transfer_execute: { recipient: "acct:6222020200112230", amount: "1.00", memo: "m" },
      scheduled_task_create: { transfer: { amount: "1.00", recipient_account: "6222020200112230" }, repeat: "once" },
      card_limit_adjust: { card_id: "debit-card-1", new_limit: "100.00", new_daily_limit: "200.00" },
      wealth_product_redeem: { product_id: "x", amount: "ALL" },
      funds_lock: { amount: "1.00", reason: "r" },
      fx_exchange: buy,
      subscription_reminder_toggle: { enabled: true },
      payee_manage: { name: "n", account: "6222020200112230" },
    };
    const emitted = new Set();
    for (const [intent, a] of Object.entries(samples)) for (const [k] of batchItemFields(intent, a)) emitted.add(k);
    for (const d of dicts) for (const k of emitted) expect(d[`op.f.${k}`], `${k} 在某语言包缺失（裸键）`).toBeTruthy();
    /* 第一百六十四轮直接肇因的三键显式点名 */
    for (const d of dicts) for (const k of ["currency", "converted", "rate", "direction"]) expect(d[`op.f.${k}`]).toBeTruthy();
  });
});
