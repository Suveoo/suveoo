import { describe, expect, it } from "vitest";
import { generateProposals, subMonthlyCents, nextMonthlyRunIso, demoProposalSeed } from "../../worker-main.js";

/* 第六期 idle：AI 主动银行——提议引擎纯函数。规则透明、确定性（零 LLM），
   金额一律 cents（BigInt）。 */

const sub = (over = {}) => ({ id: "x", merchant: "X", plan: "月卡", amount_cents: "3000", cycle: "月", usage_score: 60, status: "ACTIVE", ...over });
const bill = (over = {}) => ({ id: "b", name: "账单", category: "生活服务", amount_cents: "5000", due_day: 10, autopay: 0, ...over });

describe("subMonthlyCents（订阅月费折算）", () => {
  it("月付原值 / 年付 ÷12 / 季付 ÷3（BigInt 整除）", () => {
    expect(subMonthlyCents(sub({ amount_cents: "3000", cycle: "月" }))).toBe(3000n);
    expect(subMonthlyCents(sub({ amount_cents: "240000", cycle: "年" }))).toBe(20000n);
    expect(subMonthlyCents(sub({ amount_cents: "4900", cycle: "季" }))).toBe(1633n);
  });
});

describe("nextMonthlyRunIso（每月 day 日 09:00 北京 = UTC 01:00）", () => {
  it("本月已过 → 下月；day 超出次月天数 → 钳到月末", () => {
    /* 北京 2026-09-23：1 日已过 → 10-01 */
    expect(nextMonthlyRunIso(1, Date.parse("2026-09-23T02:00:00Z"))).toBe("2026-10-01T01:00:00.000Z");
    /* 25 日未到 → 本月 */
    expect(nextMonthlyRunIso(25, Date.parse("2026-09-23T02:00:00Z"))).toBe("2026-09-25T01:00:00.000Z");
    /* 31 日 → 次月 2 月只有 28 天 → 钳到 02-28 */
    expect(nextMonthlyRunIso(31, Date.parse("2026-01-05T02:00:00Z"))).toBe("2026-01-31T01:00:00.000Z");
    expect(nextMonthlyRunIso(31, Date.parse("2026-01-31T10:00:00Z"))).toBe("2026-02-28T01:00:00.000Z");
  });
});

describe("SAVE：沉睡订阅 / 低使用高费订阅", () => {
  const base = { bills: [], payees: [], tasks: [], routine_tx: [], creditDebtCents: 0n, debitBalanceCents: 0n, gmHoldingCents: 0n };
  it("usage<20 命中 dormant；CANCELLED 不命中；usage 高不命中", () => {
    const out = generateProposals({ ...base, subs: [
      sub({ id: "keep", merchant: "Keep", usage_score: 6, amount_cents: "1600" }),
      sub({ id: "dead", usage_score: 5, status: "CANCELLED" }),
      sub({ id: "fit", usage_score: 80 }),
    ] }, { monthKey: "2026-09", nowMs: Date.parse("2026-09-23T02:00:00Z") });
    const saves = out.filter((p) => p.rule === "dormant_sub");
    expect(saves).toHaveLength(1);
    expect(saves[0].target).toBe("keep");
    expect(saves[0].impact_cents).toBe("1600");
    expect(saves[0].params.days).toBe(31); /* round((100-6)/3) */
    expect(saves[0].params.exec.endpoint).toBe("/api/subscriptions/keep/cancel");
    expect(saves[0].tier).toBe("YELLOW");
  });
  it("年付订阅 impact=月折算（¥240/年 → ¥20/月）", () => {
    const out = generateProposals({ ...base, subs: [sub({ id: "sams", usage_score: 8, amount_cents: "240000", cycle: "年" })] }, { monthKey: "2026-09", nowMs: 0 });
    expect(out.find((p) => p.rule === "dormant_sub").impact_cents).toBe("20000");
  });
  it("low_use：20≤usage<35 且月费≥¥25 命中；不足 ¥25 不命中；与 dormant 不重叠", () => {
    const out = generateProposals({ ...base, subs: [
      sub({ id: "tx", merchant: "腾讯视频", usage_score: 23, amount_cents: "3000" }),
      sub({ id: "rd", usage_score: 34, amount_cents: "1900" }), /* ¥19 < ¥25 */
      sub({ id: "hi", usage_score: 41, amount_cents: "3000" }),
    ] }, { monthKey: "2026-09", nowMs: 0 });
    const rules = out.map((p) => `${p.rule}:${p.target}`).sort();
    expect(rules).toEqual(["low_use_sub:tx"]);
  });
  it("SAVE 合计封顶 5 条（按月省额降序）", () => {
    const subs = Array.from({ length: 8 }, (_, i) => sub({ id: `s${i}`, usage_score: 5, amount_cents: String((i + 1) * 1000) }));
    const out = generateProposals({ ...base, subs }, { monthKey: "2026-09", nowMs: 0 });
    expect(out.filter((p) => p.kind === "SAVE")).toHaveLength(5);
    expect(out.filter((p) => p.kind === "SAVE")[0].target).toBe("s7"); /* ¥80/月最大 */
  });
});

describe("ROUTINE：周期转账识别", () => {
  const base = { subs: [], bills: [], creditDebtCents: 0n, debitBalanceCents: 0n, gmHoldingCents: 0n };
  const payees = [{ name: "房东陈叔", account: "6222881234567890" }];
  it("3 个月同金额同日 → 提议；参数含下月执行时刻与收款人卡号", () => {
    const out = generateProposals({ ...base, payees, tasks: [], routine_tx: [
      { counterparty: "房东陈叔", amount_cents: "350000", ts: "2026-07-01T00:12:00Z" },
      { counterparty: "房东陈叔", amount_cents: "350000", ts: "2026-08-01T00:12:00Z" },
      { counterparty: "房东陈叔", amount_cents: "350000", ts: "2026-09-01T00:12:00Z" },
    ] }, { monthKey: "2026-09", nowMs: Date.parse("2026-09-23T02:00:00Z") });
    const r = out.find((p) => p.rule === "routine_transfer");
    expect(r).toBeTruthy();
    expect(r.tier).toBe("RED"); /* ¥3500 > ¥1000 执行日单笔恒红 */
    expect(r.params.exec.args.recipient_account).toBe("6222881234567890");
    expect(r.params.exec.args.execute_at).toBe("2026-10-01T01:00:00.000Z");
    expect(r.params.exec.args.repeat).toBe("monthly");
    expect(r.impact_cents).toBeNull();
  });
  it("¥3500→RED / ¥100→YELLOW（预约执行日口径）", () => {
    const mk = (amt) => generateProposals({ ...base, payees, tasks: [], routine_tx: [
      { counterparty: "房东陈叔", amount_cents: amt, ts: "2026-07-01T00:00:00Z" },
      { counterparty: "房东陈叔", amount_cents: amt, ts: "2026-08-01T00:00:00Z" },
    ] }, { monthKey: "2026-09", nowMs: Date.parse("2026-09-23T02:00:00Z") }).find((p) => p.rule === "routine_transfer");
    expect(mk("350000").tier).toBe("RED");
    expect(mk("10000").tier).toBe("YELLOW");
  });
  it("已有同收款人 monthly 任务（payload/标题）→ 不重复提议；金额不一致 / 非收款人 / 月频超 2 → 不提议", () => {
    const txs3 = [
      { counterparty: "房东陈叔", amount_cents: "350000", ts: "2026-07-01T00:00:00Z" },
      { counterparty: "房东陈叔", amount_cents: "350000", ts: "2026-08-01T00:00:00Z" },
    ];
    const withTask = generateProposals({ ...base, payees, tasks: [{ type: "scheduled_transfer", repeat: "monthly", title: "每月 1 日房租", payload: JSON.stringify({ transfer: { recipient_name: "房东陈叔" } }) }], routine_tx: txs3 }, { monthKey: "2026-09", nowMs: 0 });
    const withTitle = generateProposals({ ...base, payees, tasks: [{ type: "scheduled_transfer", repeat: "monthly", title: "每月给房东陈叔转房租", payload: "{}" }], routine_tx: txs3 }, { monthKey: "2026-09", nowMs: 0 });
    expect(withTask.find((p) => p.rule === "routine_transfer")).toBeUndefined();
    expect(withTitle.find((p) => p.rule === "routine_transfer")).toBeUndefined();
    const inconsistent = generateProposals({ ...base, payees, tasks: [], routine_tx: [
      { counterparty: "房东陈叔", amount_cents: "10000", ts: "2026-07-01T00:00:00Z" },
      { counterparty: "房东陈叔", amount_cents: "900000", ts: "2026-08-01T00:00:00Z" },
    ] }, { monthKey: "2026-09", nowMs: 0 });
    expect(inconsistent.find((p) => p.rule === "routine_transfer")).toBeUndefined();
    const stranger = generateProposals({ ...base, payees, tasks: [], routine_tx: [
      { counterparty: "某商户", amount_cents: "10000", ts: "2026-07-01T00:00:00Z" },
      { counterparty: "某商户", amount_cents: "10000", ts: "2026-08-01T00:00:00Z" },
    ] }, { monthKey: "2026-09", nowMs: 0 });
    expect(stranger.find((p) => p.rule === "routine_transfer")).toBeUndefined();
    const weekly = generateProposals({ ...base, payees, tasks: [], routine_tx: [
      { counterparty: "房东陈叔", amount_cents: "10000", ts: "2026-07-01T00:00:00Z" },
      { counterparty: "房东陈叔", amount_cents: "10000", ts: "2026-07-08T00:00:00Z" },
      { counterparty: "房东陈叔", amount_cents: "10000", ts: "2026-07-15T00:00:00Z" },
    ] }, { monthKey: "2026-09", nowMs: 0 });
    expect(weekly.find((p) => p.rule === "routine_transfer")).toBeUndefined();
  });
});

describe("GUARD / WEALTH", () => {
  const base = { subs: [], payees: [], tasks: [], routine_tx: [], gmHoldingCents: 0n };
  it("bill_autopay：autopay=0 按金额降序至多 2 条，credit-repay 排除", () => {
    const out = generateProposals({ ...base, bills: [
      bill({ id: "gas", name: "燃气", amount_cents: "8635", autopay: 0 }),
      bill({ id: "prop", name: "物业", amount_cents: "41270", autopay: 0 }),
      bill({ id: "sat", name: "卫星", amount_cents: "2300", autopay: 0 }),
      bill({ id: "credit-repay", amount_cents: "0", autopay: 0 }),
      bill({ id: "auto", name: "已自动", amount_cents: "99999", autopay: 1 }),
    ], creditDebtCents: 0n, debitBalanceCents: 0n }, { monthKey: "2026-09", nowMs: 0 });
    const bps = out.filter((p) => p.rule === "bill_autopay");
    expect(bps.map((p) => p.target)).toEqual(["prop", "gas"]);
    expect(bps[0].params.exec.method).toBe("PATCH");
  });
  it("credit_debt：>¥500 命中；≤¥500 不命中", () => {
    const mk = (debt) => generateProposals({ ...base, bills: [], creditDebtCents: debt, debitBalanceCents: 0n }, { monthKey: "2026-09", nowMs: 0 });
    expect(mk(518329n).some((p) => p.rule === "credit_debt")).toBe(true);
    expect(mk(50000n).some((p) => p.rule === "credit_debt")).toBe(false);
  });
  it("idle_cash：¥92 万 → 建议 ¥10 万（封顶）RED；¥5.5 万 → 建议不足 ¥1 万不出；<¥5 万不出", () => {
    const mk = (bal) => generateProposals({ ...base, bills: [], creditDebtCents: 0n, debitBalanceCents: bal, gmHoldingCents: 500000n }, { monthKey: "2026-09", nowMs: 0 }).find((p) => p.rule === "idle_cash");
    expect(mk(92000000n).params.suggest).toBe("100000.00");
    expect(mk(92000000n).tier).toBe("RED");
    expect(mk(92000000n).params.prev_holding_cents).toBe("500000");
    expect(mk(5500000n)).toBeUndefined();
    expect(mk(4500000n)).toBeUndefined();
  });
});

describe("demoProposalSeed（demo 战报非零；零 rng）", () => {
  it("3 条 EXECUTED 预置：SAVE 带月省额 + ROUTINE + GUARD；dedup 月键", () => {
    const seed = demoProposalSeed(Date.parse("2026-09-23T02:00:00Z"));
    expect(seed).toHaveLength(3);
    expect(seed.map((s) => s.kind).sort()).toEqual(["GUARD", "ROUTINE", "SAVE"]);
    expect(seed[0].impact_cents).toBe("1633");
    expect(seed.every((s) => s.dedup_key.endsWith(":2026-09"))).toBe(true);
    expect(seed.some((s) => s.apply?.sub_cancel === "mango-tv")).toBe(true);
    expect(seed.some((s) => s.apply?.bill_autopay === "property")).toBe(true);
  });
});
