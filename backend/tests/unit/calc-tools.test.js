import { describe, expect, it } from "vitest";
import {
  calcCompoundSavings, calcLoanCompare, calcGoalSaving,
  calcCreditPayoff, calcRetirement, calcInflation, calcSplitBill,
  calcDepositCompare, calcFxConvert, calcBudgetAllocator,
} from "../../worker-main.js";

const DEPOSITS = [
  { slug: "demand", name: "活期存款", term: "随取", rate: 0.2 },
  { slug: "notice-7d", name: "7 天通知存款", term: "7 天", rate: 0.45 },
  { slug: "term-3m", name: "3 个月定期", term: "3 个月", rate: 1.05 },
  { slug: "term-6m", name: "6 个月定期", term: "6 个月", rate: 1.25 },
  { slug: "term-1y", name: "1 年定期", term: "1 年", rate: 1.45 },
  { slug: "term-3y", name: "3 年定期", term: "3 年", rate: 1.85 },
];
const FX_QUOTES = [
  { code: "USD", name: "美元", buy: "7.1024", sell: "7.1782", mid: "7.1403" },
  { code: "JPY", name: "日元（100）", buy: "4.6820", sell: "4.7410", mid: "4.7115" },
];

describe("calc_compound_savings 复利储蓄", () => {
  it("典型值：10 万年化 3% 存 5 年每月追加 2000（按月复利）", () => {
    const r = calcCompoundSavings({ principal: 100000, rate: 3, years: 5, monthly: 2000, freq: 12 });
    expect(r.result.final_value).toBe(245778.34);
    expect(r.result.total_interest).toBe(25778.34);
    expect(r.result.total_deposited).toBe(220000);
    expect(r.result.months).toBe(60);
    expect(r.summary).toContain("245,778.34");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/savings-compound?principal=100000&rate=3&years=5&monthly=2000&freq=12");
  });

  it("零边界：本金 0 / 每月追加缺省按 0 → 终值 0", () => {
    const r = calcCompoundSavings({ principal: 0, rate: 3, years: 1 });
    expect(r.result.final_value).toBe(0);
    expect(r.result.total_interest).toBe(0);
    expect(r.result.months).toBe(12);
  });

  it("按年复利：10 万 3% 5 年不追加", () => {
    const r = calcCompoundSavings({ principal: 100000, rate: 3, years: 5, monthly: 0, freq: 1 });
    expect(r.result.final_value).toBe(115927.41);
  });

  it("非法输入拒绝：负本金 / 零年限 / 非法频率 / 缺参", () => {
    expect(calcCompoundSavings({ principal: -1, rate: 3, years: 5 }).status).toBe("INVALID");
    expect(calcCompoundSavings({ principal: 100, rate: 3, years: 0 }).status).toBe("INVALID");
    expect(calcCompoundSavings({ principal: 100, rate: -0.1, years: 5 }).status).toBe("INVALID");
    expect(calcCompoundSavings({ principal: 100, rate: 3, years: 5, freq: 7 }).status).toBe("INVALID");
    expect(calcCompoundSavings({}).status).toBe("INVALID");
  });
});

describe("calc_loan_compare 贷款对比", () => {
  it("典型值：100 万 3.1% 30 年", () => {
    const r = calcLoanCompare({ amount: 1000000, rate: 3.1, years: 30 });
    expect(r.result.months).toBe(360);
    expect(r.result.annuity.monthly_payment).toBe(4270.16);
    expect(r.result.annuity.total_interest).toBe(537259.04);
    expect(r.result.straight.first_payment).toBe(5361.11);
    expect(r.result.straight.last_payment).toBe(2784.95);
    expect(r.result.straight.total_interest).toBe(466291.67);
    expect(r.result.interest_difference).toBe(70967.37);
    expect(r.summary).toContain("4,270.16");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/loan-compare?amount=1000000&rate=3.1&years=30");
  });

  it("零利率边界：月供=本金/期数，利息为 0", () => {
    const r = calcLoanCompare({ amount: 12000, rate: 0, years: 1 });
    expect(r.result.annuity.monthly_payment).toBe(1000);
    expect(r.result.annuity.total_interest).toBe(0);
    expect(r.result.straight.first_payment).toBe(1000);
    expect(r.result.straight.total_interest).toBe(0);
  });

  it("非法输入拒绝：负金额 / 零年限 / 非数值", () => {
    expect(calcLoanCompare({ amount: -100, rate: 3, years: 5 }).status).toBe("INVALID");
    expect(calcLoanCompare({ amount: 100, rate: 3, years: 0 }).status).toBe("INVALID");
    expect(calcLoanCompare({ amount: "abc", rate: 3, years: 5 }).status).toBe("INVALID");
    expect(calcLoanCompare({}).status).toBe("INVALID");
  });
});

describe("calc_goal_saving 目标储蓄", () => {
  it("典型值：目标 50 万、现有 10 万、5 年、年化 3%", () => {
    const r = calcGoalSaving({ target: 500000, current: 100000, years: 5, rate: 3 });
    expect(r.result.projected_value).toBe(116161.68);
    expect(r.result.gap).toBe(383838.32);
    expect(r.result.monthly_required).toBe(5937.48);
    expect(r.summary).toContain("5,937.48");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/goal-planner?target=500000&current=100000&years=5&rate=3");
  });

  it("已达标边界：现有储蓄 ≥ 目标 → 每月需存 0", () => {
    const r = calcGoalSaving({ target: 100000, current: 120000, years: 5, rate: 0 });
    expect(r.result.monthly_required).toBe(0);
    expect(r.result.gap).toBe(0);
    expect(r.summary).toContain("无需追加");
  });

  it("非法输入拒绝：零目标 / 负储蓄 / 缺参", () => {
    expect(calcGoalSaving({ target: 0, current: 0, years: 5, rate: 3 }).status).toBe("INVALID");
    expect(calcGoalSaving({ target: 100, current: -1, years: 5, rate: 3 }).status).toBe("INVALID");
    expect(calcGoalSaving({ target: 100, years: 5 }).status).toBe("INVALID");
  });
});

describe("calc_credit_payoff 信用卡还款", () => {
  it("典型值：欠 1.2 万 APR18% 月还 1200 → 11 个月还清", () => {
    const r = calcCreditPayoff({ debt: 12000, apr: 18, monthly: 1200 });
    expect(r.result.months).toBe(11);
    expect(r.result.total_interest).toBe(1099.47);
    expect(r.summary).toContain("11");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/credit-payoff?debt=12000&apr=18&monthly=1200");
  });

  it("反向：目标 12 个月 → 月供 1100.16", () => {
    const r = calcCreditPayoff({ debt: 12000, apr: 18, months: 12 });
    expect(r.result.monthly_payment).toBe(1100.16);
    expect(r.result.months).toBe(12);
    expect(r.link).toBe("https://suveoo.com/wealth/tools/credit-payoff?debt=12000&apr=18&months=12");
  });

  it("边界：月供低于月利息 → impossible；零利率月供即欠款/月数", () => {
    const bad = calcCreditPayoff({ debt: 12000, apr: 18, monthly: 100 });
    expect(bad.result.impossible).toBe(true);
    expect(bad.result.min_monthly_interest).toBe(180);
    const zero = calcCreditPayoff({ debt: 12000, apr: 0, months: 12 });
    expect(zero.result.monthly_payment).toBe(1000);
    expect(zero.result.total_interest).toBe(0);
  });

  it("非法输入拒绝：负欠款 / 负 APR / 两个方向都缺", () => {
    expect(calcCreditPayoff({ debt: -1, apr: 18, monthly: 100 }).status).toBe("INVALID");
    expect(calcCreditPayoff({ debt: 100, apr: -1, monthly: 10 }).status).toBe("INVALID");
    expect(calcCreditPayoff({ debt: 100, apr: 18 }).status).toBe("INVALID");
  });
});

describe("calc_retirement 退休规划", () => {
  it("典型值：30 岁退休 60、月支出 6000、年化 5%、通胀 2.5%", () => {
    const r = calcRetirement({ age: 30, retire: 60, spend: 6000, rate: 5, inflation: 2.5 });
    expect(r.result.required_corpus).toBe(1338225.21);
    expect(r.result.monthly_saving).toBe(1607.94);
    expect(r.result.withdraw_years).toBe(25);
    expect(r.summary).toContain("1,338,225.21");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/retirement?age=30&retire=60&spend=6000&rate=5&inflation=2.5");
  });

  it("默认边界：rate/inflation 缺省按 5/2.5", () => {
    const r = calcRetirement({ age: 30, retire: 60, spend: 6000 });
    expect(r.result.required_corpus).toBe(1338225.21);
  });

  it("非法输入拒绝：退休年龄≤当前年龄 / 负数 / 缺参", () => {
    expect(calcRetirement({ age: 60, retire: 60, spend: 6000 }).status).toBe("INVALID");
    expect(calcRetirement({ age: 30, retire: 60, spend: -1 }).status).toBe("INVALID");
    expect(calcRetirement({ age: 30, retire: 60 }).status).toBe("INVALID");
  });
});

describe("calc_inflation 通胀购买力", () => {
  it("典型值：10 万、2.5%、20 年", () => {
    const r = calcInflation({ amount: 100000, inflation: 2.5, years: 20 });
    expect(r.result.future_purchasing_power).toBe(61027.09);
    expect(r.result.equivalent_needed).toBe(163861.64);
    expect(r.result.loss_pct).toBe(38.97);
    expect(r.link).toBe("https://suveoo.com/wealth/tools/inflation-calculator?amount=100000&inflation=2.5&years=20");
  });

  it("零通胀边界：购买力不变", () => {
    const r = calcInflation({ amount: 100000, inflation: 0, years: 20 });
    expect(r.result.future_purchasing_power).toBe(100000);
    expect(r.result.loss_pct).toBe(0);
  });

  it("非法输入拒绝：负通胀 / 零年数 / 非数值", () => {
    expect(calcInflation({ amount: 100, inflation: -1, years: 5 }).status).toBe("INVALID");
    expect(calcInflation({ amount: 100, inflation: 2, years: 0 }).status).toBe("INVALID");
    expect(calcInflation({ inflation: 2, years: 5 }).status).toBe("INVALID");
  });
});

describe("calc_split_bill AA 分账高级版", () => {
  it("典型值：860 元 3 人，张三 -60、李四 +10，整数分守恒", () => {
    const r = calcSplitBill({ total: 860, n: 3, adjustments: { "张三": -60, "李四": 10 } });
    const byName = Object.fromEntries(r.result.splits.map((s) => [s.name, s.amount]));
    expect(byName["张三"]).toBe("243.34");
    expect(byName["李四"]).toBe("313.33");
    expect(byName["成员3"]).toBe("303.33");
    expect(r.result.sum).toBe("860.00");
    expect(r.result.conservation_ok).toBe(true);
    expect(r.link).toBe("https://suveoo.com/wealth/tools/split-bill-plus?total=860&n=3&adjust=%E5%BC%A0%E4%B8%89%3A-60%2C%E6%9D%8E%E5%9B%9B%3A10");
  });

  it("零边界：无调整、除不尽仍守恒（860/3）", () => {
    const r = calcSplitBill({ total: 860, n: 3 });
    expect(r.result.splits.map((s) => s.amount).join(",")).toBe("286.67,286.67,286.66");
    expect(r.result.conservation_ok).toBe(true);
  });

  it("participants 数组命名", () => {
    const r = calcSplitBill({ total: 100, participants: ["Alice", "Bob"] });
    const byName = Object.fromEntries(r.result.splits.map((s) => [s.name, s.amount]));
    expect(byName["Alice"]).toBe("50.00");
    expect(byName["Bob"]).toBe("50.00");
  });

  it("非法输入拒绝：负总额 / 零人数 / 调整超额 / 非数值调整", () => {
    expect(calcSplitBill({ total: -10, n: 3 }).status).toBe("INVALID");
    expect(calcSplitBill({ total: 100, n: 0 }).status).toBe("INVALID");
    expect(calcSplitBill({ total: 100, n: 2, adjustments: { "张三": 150 } }).status).toBe("INVALID");
    expect(calcSplitBill({ total: 100, n: 2, adjustments: { "张三": "abc" } }).status).toBe("INVALID");
  });
});

describe("calc_deposit_compare 存款方案对比", () => {
  it("典型值：5 万、12 个月 → 短期推荐 1 年定期 50725，长期 3 年 1.85%", () => {
    const r = calcDepositCompare({ principal: 50000, months: 12 }, DEPOSITS);
    expect(r.result.short_pick.slug).toBe("term-1y");
    expect(r.result.short_pick.horizon_value).toBe(50725);
    expect(r.result.long_pick.slug).toBe("term-3y");
    expect(r.result.long_pick.rate).toBe(1.85);
    expect(r.result.long_pick.fits_horizon).toBe(false);
    expect(r.link).toBe("https://suveoo.com/wealth/tools/deposit-compare?principal=50000&months=12");
  });

  it("短用款期边界：2 个月 → 定期均不满足，活期/通知可选", () => {
    const r = calcDepositCompare({ principal: 50000, months: 2 }, DEPOSITS);
    expect(r.result.short_pick.slug).toBe("notice-7d");
    expect(r.result.rows.find((x) => x.slug === "term-3m").fits).toBe(false);
    expect(r.result.rows.find((x) => x.slug === "term-3m").horizon_value).toBeNull();
  });

  it("非法输入拒绝：负本金 / 零月数 / 无产品数据", () => {
    expect(calcDepositCompare({ principal: -1, months: 12 }, DEPOSITS).status).toBe("INVALID");
    expect(calcDepositCompare({ principal: 100, months: 0 }, DEPOSITS).status).toBe("INVALID");
    expect(calcDepositCompare({ principal: 100, months: 12 }, []).status).toBe("INVALID");
  });
});

describe("calc_fx_convert 外汇兑换", () => {
  it("典型值：购汇 1000 CNY → USD 按卖出价 7.1782", () => {
    const r = calcFxConvert({ dir: "buy", ccy: "USD", amount: 1000 }, FX_QUOTES);
    expect(r.result.amount_out).toBe(139.31);
    expect(r.result.rate_used).toBe("7.1782");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/fx-convert?dir=buy&ccy=USD&amount=1000");
  });

  it("结汇与 JPY 每 100 单位特例", () => {
    const sell = calcFxConvert({ dir: "sell", ccy: "USD", amount: 1000 }, FX_QUOTES);
    expect(sell.result.amount_out).toBe(7102.4);
    expect(sell.result.amount_out_currency).toBe("CNY");
    const jpy = calcFxConvert({ dir: "buy", ccy: "JPY", amount: 1000 }, FX_QUOTES);
    expect(jpy.result.amount_out).toBe(21092.6);
  });

  it("非法输入拒绝：不支持的币种 / 非正金额 / 无牌价", () => {
    expect(calcFxConvert({ dir: "buy", ccy: "XXX", amount: 100 }, FX_QUOTES).status).toBe("INVALID");
    expect(calcFxConvert({ dir: "buy", ccy: "USD", amount: -5 }, FX_QUOTES).status).toBe("INVALID");
    expect(calcFxConvert({ dir: "buy", ccy: "USD", amount: 100 }, []).status).toBe("INVALID");
  });
});

describe("calc_budget_allocator 预算分配器", () => {
  it("典型值：月入 12000 按 50/30/20 分配", () => {
    const r = calcBudgetAllocator({ income: 12000, needs: 50, wants: 30, save: 20 });
    expect(r.result.needs_amount).toBe(6000);
    expect(r.result.wants_amount).toBe(3600);
    expect(r.result.save_amount).toBe(2400);
    expect(r.summary).toContain("6,000");
    expect(r.link).toBe("https://suveoo.com/wealth/tools/budget-allocator?income=12000&needs=50&wants=30&save=20");
  });

  it("默认比例：仅传收入按 50/30/20", () => {
    const r = calcBudgetAllocator({ income: 8000 });
    expect(r.result.needs_pct).toBe(50);
    expect(r.result.wants_pct).toBe(30);
    expect(r.result.save_pct).toBe(20);
    expect(r.result.save_amount).toBe(1600);
    expect(r.summary).toContain("比例结构健康");
  });

  it("非法输入拒绝：比例和≠100 / 负收入 / 缺收入", () => {
    expect(calcBudgetAllocator({ income: 12000, needs: 50, wants: 40, save: 20 }).status).toBe("INVALID");
    expect(calcBudgetAllocator({ income: -1, needs: 50, wants: 30, save: 20 }).status).toBe("INVALID");
    expect(calcBudgetAllocator({}).status).toBe("INVALID");
  });
});
