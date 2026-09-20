import { describe, expect, it } from "vitest";
import { fxQuotesFromRates, fxSparkByDay } from "../../worker-main.js";
/* workerd 沙箱内 fs 只能读 bundle 文件，故 16 只基金 JSON 走静态 import（构建期打包） */
import f01 from "../../../frontend/assets/data/funds/global-money-1.json";
import f02 from "../../../frontend/assets/data/funds/global-short-bond.json";
import f03 from "../../../frontend/assets/data/funds/esg-bond.json";
import f04 from "../../../frontend/assets/data/funds/cn-dividend.json";
import f05 from "../../../frontend/assets/data/funds/consumer-staples.json";
import f06 from "../../../frontend/assets/data/funds/quant-neutral.json";
import f07 from "../../../frontend/assets/data/funds/em-gov-bond.json";
import f08 from "../../../frontend/assets/data/funds/global-mixed-1.json";
import f09 from "../../../frontend/assets/data/funds/reit-global.json";
import f10 from "../../../frontend/assets/data/funds/global-mixed-2.json";
import f11 from "../../../frontend/assets/data/funds/global-equity-index.json";
import f12 from "../../../frontend/assets/data/funds/gold-index.json";
import f13 from "../../../frontend/assets/data/funds/healthcare-bio.json";
import f14 from "../../../frontend/assets/data/funds/new-energy.json";
import f15 from "../../../frontend/assets/data/funds/apac-tech.json";
import f16 from "../../../frontend/assets/data/funds/ai-semi.json";

const FUNDS = [f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12, f13, f14, f15, f16];
const NEW_8 = ["global-short-bond", "cn-dividend", "consumer-staples", "quant-neutral", "reit-global", "healthcare-bio", "new-energy", "ai-semi"];

describe("基金数据集（16 只）", () => {
  const files = FUNDS.map((f) => `${f.slug}.json`);
  const funds = FUNDS;

  it("共 16 只，含新增 8 只，风险等级 R1-R5 全覆盖", () => {
    expect(files).toHaveLength(16);
    const slugs = funds.map((f) => f.slug);
    for (const s of NEW_8) expect(slugs).toContain(s);
    const risks = new Set(funds.map((f) => f.risk_level));
    for (const r of [1, 2, 3, 4, 5]) expect(risks.has(r)).toBe(true);
  });

  it("历史序列覆盖 ≥4 年（≥48 个月度点），且 nav_dates 与序列等长", () => {
    for (const f of funds) {
      expect(f.nav_history.length, f.slug).toBeGreaterThanOrEqual(49);
      expect(f.nav_dates.length).toBe(f.nav_history.length);
      expect(f.benchmark_history.length).toBe(f.nav_history.length);
      expect(f.nav_history[0]).toBeCloseTo(1, 5);
      expect(f.nav).toBe(f.nav_history.at(-1));
    }
  });

  it("returns 自洽：since ≈ 期末净值涨幅；3y/5y 仅在序列足够长时出现", () => {
    for (const f of funds) {
      const expectSince = +((f.nav - 1) * 100).toFixed(2);
      expect(Math.abs(f.returns.since - expectSince)).toBeLessThan(0.05);
      if (f.nav_history.length > 37) expect(f.returns["3y"]).not.toBeNull();
      if (f.nav_history.length > 61) expect(f.returns["5y"]).not.toBeNull();
      else expect(f.returns["5y"]).toBeNull();
    }
  });

  it("stats 从序列反算：波动为正、回撤 ≤0、最好月 ≥ 最差月", () => {
    for (const f of funds) {
      expect(f.stats.ann_vol, f.slug).toBeGreaterThan(0);
      expect(f.stats.max_drawdown).toBeLessThanOrEqual(0);
      expect(f.stats.best_month).toBeGreaterThanOrEqual(f.stats.worst_month);
      /* 风险等级与波动量级粗对齐：R1 低波动、R5 高波动 */
      if (f.risk_level === 1) expect(f.stats.ann_vol).toBeLessThan(2.5);
      if (f.risk_level === 5) expect(f.stats.ann_vol).toBeGreaterThan(15);
    }
  });

  it("蒙特卡洛预测：5 条分位曲线 × 11 年，p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90，起点为 1", () => {
    for (const f of funds) {
      const p = f.projection;
      for (const k of ["p10", "p25", "p50", "p75", "p90"]) {
        expect(p[k]).toHaveLength(11);
        expect(p[k][0]).toBe(1);
      }
      for (let y = 0; y <= 10; y++) {
        expect(p.p10[y]).toBeLessThanOrEqual(p.p25[y]);
        expect(p.p25[y]).toBeLessThanOrEqual(p.p50[y]);
        expect(p.p50[y]).toBeLessThanOrEqual(p.p75[y]);
        expect(p.p75[y]).toBeLessThanOrEqual(p.p90[y]);
      }
    }
  });

  it("披露要素齐全：策略/基准/费率结构/分红/持仓/行业/区域/经理", () => {
    for (const f of funds) {
      expect(f.strategy?.length).toBeGreaterThan(20);
      expect(f.benchmark).toBeTruthy();
      expect(f.fee).toHaveProperty("total");
      expect(f.dividend_policy).toBeTruthy();
      expect(f.holdings.length).toBeGreaterThanOrEqual(3);
      expect(f.sectors.length).toBeGreaterThan(0);
      expect(f.regions.length).toBeGreaterThan(0);
      expect(f.manager).toHaveProperty("name");
    }
  });
});

describe("fxQuotesFromRates（实时汇率 → 牌价）", () => {
  const rates = { USD: 0.14, EUR: 0.1284, JPY: 21.22, GBP: 0.1101, HKD: 1.09, SGD: 0.1832, AUD: 0.2123, CAD: 0.1914, CHF: 0.1127, NZD: 0.2312 };

  it("全 10 币种换算：JPY 按 100 单位，buy < mid < sell", () => {
    const qs = fxQuotesFromRates(rates);
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      expect(Number(q.buy)).toBeLessThan(Number(q.mid));
      expect(Number(q.mid)).toBeLessThan(Number(q.sell));
    }
    const jpy = qs.find((q) => q.code === "JPY");
    expect(Number(jpy.mid)).toBeCloseTo(100 / 21.22, 3); /* 每 100 日元兑 CNY */
    const usd = qs.find((q) => q.code === "USD");
    expect(Number(usd.mid)).toBeCloseTo(1 / 0.14, 3);
  });

  it("点差比例正确（USD 35bp：sell-mid ≈ mid×0.0035）且缺失币种被跳过", () => {
    const qs = fxQuotesFromRates({ USD: 0.14 });
    expect(qs).toHaveLength(1);
    const usd = qs[0];
    expect(Number(usd.sell) - Number(usd.mid)).toBeCloseTo(Number(usd.mid) * 0.0035, 6);
    expect(Number(usd.mid) - Number(usd.buy)).toBeCloseTo(Number(usd.mid) * 0.0035, 6);
  });

  it("spark 缺省时只有当日 1 个真实点（不伪造历史平铺）；提供历史时原样透传", () => {
    const noSpark = fxQuotesFromRates({ USD: 0.14 });
    expect(noSpark[0].spark).toHaveLength(1); /* 严禁用当前值平铺 7 点伪造历史（第四期任务 A 口径） */
    expect(noSpark[0].spark[0]).toBeCloseTo(1 / 0.14, 2);
    const withSpark = fxQuotesFromRates({ USD: 0.14 }, { USD: [7.1, 7.12, 7.09, 7.13, 7.1, 7.11, 7.14] });
    expect(withSpark[0].spark).toEqual([7.1, 7.12, 7.09, 7.13, 7.1, 7.11, 7.14]);
  });
});

describe("fxSparkByDay（spark 序列按自然日去重——第四期任务 A）", () => {
  const rates = { USD: 0.1487, JPY: 21.22 };
  const quotesOf = (mids) => mids.map(([code, mid]) => ({ code, mid: String(mid) }));

  it("同日多次采样序列不变（只更新当日末点，数据源日更时值相同）", () => {
    const store0 = fxSparkByDay({}, quotesOf([["USD", 6.7252]]), "2026-09-21");
    expect(store0.series.USD).toEqual([6.73]);
    const store1 = fxSparkByDay(store0, quotesOf([["USD", 6.7252]]), "2026-09-21");
    expect(store1.series.USD).toEqual([6.73]); /* 同日重复采样：序列长度与值均不变 */
    const store2 = fxSparkByDay(store1, quotesOf([["USD", 6.7252]]), "2026-09-21");
    expect(store2.series.USD).toEqual([6.73]);
  });

  it("跨日追加新点：序列 = 每天一个真实值，最多保留 7 天", () => {
    let store = {};
    for (let d = 1; d <= 9; d++) {
      const day = `2026-09-${String(d).padStart(2, "0")}`;
      const mid = 6.7 + d * 0.01;
      store = fxSparkByDay(store, quotesOf([["USD", mid]]), day);
    }
    expect(store.series.USD).toHaveLength(7); /* 第 1/2 天滑出窗口，保留第 3-9 天 */
    expect(store.series.USD).toEqual([6.73, 6.74, 6.75, 6.76, 6.77, 6.78, 6.79]);
    expect(store.days.USD).toBe("2026-09-09");
  });

  it("同日数据源更新时当日末点被最新值替换（不追加）", () => {
    const store0 = fxSparkByDay({}, quotesOf([["USD", 6.7]]), "2026-09-21");
    const store1 = fxSparkByDay({ ...store0, days: { USD: "2026-09-20" }, series: { USD: [6.7] } }, quotesOf([["USD", 6.75]]), "2026-09-21");
    /* days 记录已是 09-21 的场景：再次采样只更新末点 */
    const store2 = fxSparkByDay(store1, quotesOf([["USD", 6.75]]), "2026-09-21");
    expect(store2.series.USD[store2.series.USD.length - 1]).toBe(6.75);
    expect(store2.series.USD).toHaveLength(store1.series.USD.length);
  });

  it("JPY 口径与 mid 一致（每 100 日元兑 CNY），多币种独立累计", () => {
    const store = fxSparkByDay({}, quotesOf([["USD", 6.7252], ["JPY", 4.7115]]), "2026-09-21");
    expect(store.series.USD).toEqual([6.73]);
    expect(store.series.JPY).toEqual([4.71]);
    expect(store.days).toEqual({ USD: "2026-09-21", JPY: "2026-09-21" });
  });
});
