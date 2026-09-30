import { describe, expect, it } from "vitest";
import {
  goalProgressMath, generateProposals, demoGoalSeed, columnMigrations,
  classifyRisk, hardPolicyDenials, compileToIR, checkInvariants, TOOL_REGISTRY,
} from "../../worker-main.js";
import { toCents } from "../../worker-main.js";

/* 第二十二期：目标陪伴（AI Savings Coach）——进度数学 / 提议两规则 / 色级动态 / 种子自洽 */

const DAY = 86400000, MONTH = 30 * DAY;
const nowMs = Date.UTC(2026, 8, 28, 4, 0, 0); /* 2026-09-28 12:00 北京 */

describe("goalProgressMath（进度数学单一真相源）", () => {
  it("恰 6 个月目标存满 2 个月：expected=2×月计划、on-track、预测达成≈截止", () => {
    const created = new Date(nowMs - 60 * DAY).toISOString();
    const deadline = new Date(nowMs + 120 * DAY).toISOString().slice(0, 10);
    const goal = { created_at: created, deadline, target_cents: "3000000", monthly_plan_cents: "500000" };
    /* saved=2×500000 → elapsed 恰 2 月 → expected=1000000 = saved（100% 计划进度） */
    const m = goalProgressMath(goal, 1000000n, nowMs);
    expect(m.monthsTotal).toBe(6);
    expect(Math.abs(m.elapsedMonths - 2)).toBeLessThan(0.01);
    expect(m.expectedCents).toBe("1000000"); /* 原始分串 */
    expect(m.pct).toBeCloseTo(33.33, 1);
    expect(m.onTrack).toBe(true);
    /* 速率=500000/月 → 剩 2000000 → 4 个月后达成（≈ deadline） */
    expect(m.predictedAt).toBeTruthy();
    expect(Math.abs(Date.parse(m.predictedAt) - (nowMs + 4 * MONTH))).toBeLessThan(DAY);
  });

  it("落后 40%：on-track=false；补齐 80% 边界恰好翻正", () => {
    const created = new Date(nowMs - 60 * DAY).toISOString();
    const goal = { created_at: created, deadline: new Date(nowMs + 120 * DAY).toISOString().slice(0, 10), target_cents: "3000000", monthly_plan_cents: "500000" };
    expect(goalProgressMath(goal, 500000n, nowMs).onTrack).toBe(false); /* 50% of expected */
    expect(goalProgressMath(goal, 800000n, nowMs).onTrack).toBe(true);  /* =80% 边界（≥） */
  });

  it("新建目标（elapsed=0）：expected=0 恒 on-track；saved=0 无预测", () => {
    const goal = { created_at: new Date(nowMs).toISOString(), deadline: new Date(nowMs + 150 * DAY).toISOString().slice(0, 10), target_cents: "2000000", monthly_plan_cents: "400000" };
    const m = goalProgressMath(goal, 0n, nowMs);
    expect(m.onTrack).toBe(true);
    expect(m.predictedAt).toBeNull();
    /* elapsed=0 无法外推速率（rate 须 elapsed≥0.05 月）——有存款也不预测，设计如此 */
    expect(goalProgressMath(goal, 150000n, nowMs).predictedAt).toBeNull();
  });
});

describe("提议引擎 goal 规则（off-track 提速 / 发薪日钩子）", () => {
  const monthKey = "2026-09";
  const baseGoal = {
    id: 1, name: "日本旅行", target_cents: "3000000", monthly_plan_cents: "500000",
    created_at: new Date(nowMs - 60 * DAY).toISOString(), deadline: new Date(nowMs + 120 * DAY).toISOString().slice(0, 10),
    saved_cents: "500000", has_monthly_task: false,
  };
  const snap = (goals, extra = {}) => ({ subs: [], bills: [], payees: [], tasks: [], routine_tx: [], creditDebtCents: 0n, debitBalanceCents: 0n, gmHoldingCents: 0n, goals, ...extra });

  it("off-track（elapsed≥0.5 月且落后）→ 提议补存 expected−saved，dedup 月度幂等", () => {
    const out = generateProposals(snap([{ ...baseGoal }]), { monthKey, nowMs });
    const p = out.find((x) => x.rule === "goal_offtrack");
    expect(p).toBeTruthy();
    expect(p.kind).toBe("ROUTINE");
    expect(p.impact_cents).toBeNull(); /* 存入额不当"省钱" */
    expect(p.params.catchup).toBe("5000.00"); /* expected 1000000分 − saved 500000分 = ¥5,000 */
    expect(p.params.exec.intent).toBe("goal_contribute");
    expect(p.params.exec.endpoint).toBe("/api/goals/1/contribute");
    expect(p.dedup_key).toBe(`goal_offtrack:1:${monthKey}`);
  });

  it("on-track 或未满半月的目标不出提速提议", () => {
    const onTrack = generateProposals(snap([{ ...baseGoal, saved_cents: "1000000" }]), { monthKey, nowMs });
    expect(onTrack.some((x) => x.rule === "goal_offtrack")).toBe(false);
    const fresh = generateProposals(snap([{ ...baseGoal, created_at: new Date(nowMs - 5 * DAY).toISOString() }]), { monthKey, nowMs });
    expect(fresh.some((x) => x.rule === "goal_offtrack")).toBe(false);
  });

  it("发薪日钩子：无月度任务+可识别发薪日 → 提议；已挂任务 → 不出", () => {
    const withPayday = generateProposals(snap([baseGoal], { paydayDay: 10 }), { monthKey, nowMs });
    const p = withPayday.find((x) => x.rule === "goal_payday");
    expect(p).toBeTruthy();
    expect(p.params.day).toBe(10);
    expect(p.params.amount).toBe("5000.00");
    expect(p.params.exec.args.task_type).toBe("goal_contribution");
    expect(p.params.exec.args.repeat).toBe("monthly");
    expect(p.dedup_key).toBe(`goal_payday:1:${monthKey}`);
    const tasked = generateProposals(snap([{ ...baseGoal, has_monthly_task: true }], { paydayDay: 10 }), { monthKey, nowMs });
    expect(tasked.some((x) => x.rule === "goal_payday")).toBe(false);
  });
});

describe("goal_contribute 色级与硬校验（金额三件套 + dynamic）", () => {
  it("¥900 黄 / 日累计合并后 >¥1000 升红（与转账同口径）", () => {
    expect(classifyRisk("goal_contribute", { goal_id: 1, amount: "900.00" }).tier).toBe("YELLOW");
    expect(classifyRisk("goal_contribute", { goal_id: 1, amount: "900.00" }, { dailyAccumulatedCents: toCents("200.00") }).tier).toBe("RED");
    expect(classifyRisk("goal_contribute", { goal_id: 1, amount: "1200.00" }).tier).toBe("RED");
  });
  it("AI 通道超 ¥5,000 单笔拒绝（AI_CAP_TOOLS 纳入）", () => {
    const d = hardPolicyDenials("goal_contribute", { goal_id: 1, amount: "6000.00" }, { channel: "ai" });
    expect(d.some((x) => x.code === "AI_SINGLE_LIMIT_EXCEEDED")).toBe(true);
    expect(hardPolicyDenials("goal_contribute", { goal_id: 1, amount: "0" }, { channel: "ai" })[0]?.code).toBe("INVALID_AMOUNT");
  });
  it("注册表五工具就位；INVARIANT_BALANCE 挂 goal_contribute", () => {
    for (const n of ["goal_query", "goal_create", "goal_adjust", "goal_contribute", "goal_abandon"]) expect(TOOL_REGISTRY[n]).toBeTruthy();
    expect(TOOL_REGISTRY.goal_contribute.amountArg).toBe("amount");
    expect(TOOL_REGISTRY.goal_contribute.dynamic).toBe(true);
    const ir = compileToIR("goal_contribute", { goal_id: 1, amount: "50.00" }, {});
    expect(checkInvariants(ir, { ledgerBalanceCents: toCents("30.00") }).violations[0]?.code).toBe("INVARIANT_BALANCE");
  });
});

describe("种子与迁移", () => {
  it("demoGoalSeed 自洽律：saved=contributions 合计、月计划=target/6、on-track", () => {
    const [g] = demoGoalSeed();
    const saved = g.contributions.reduce((a, c) => a + BigInt(c), 0n);
    expect(saved).toBe(1000000n);
    const monthsTotal = Math.max(1, Math.ceil((g.created_days_ago + g.deadline_days) * DAY / MONTH));
    expect(monthsTotal).toBe(6);
    expect((BigInt(g.target_cents) + BigInt(monthsTotal) - 1n) / BigInt(monthsTotal)).toBe(500000n);
    const m = goalProgressMath({ created_at: new Date(nowMs - g.created_days_ago * DAY).toISOString(), deadline: new Date(nowMs + g.deadline_days * DAY).toISOString().slice(0, 10), target_cents: g.target_cents, monthly_plan_cents: "500000" }, saved, nowMs);
    expect(m.onTrack).toBe(true);
    expect(g.task.day_of_month).toBe(3);
  });
  it("columnMigrations：老 tasks 表补 completed_at，新表不动", () => {
    expect(columnMigrations({ tasks: ["id", "type"] })).toContain("ALTER TABLE tasks ADD COLUMN completed_at TEXT");
    expect(columnMigrations({ tasks: ["id", "type", "completed_at"] }).some((q) => q.includes("completed_at"))).toBe(false);
  });
});
