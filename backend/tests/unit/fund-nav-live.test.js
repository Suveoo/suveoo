import { describe, expect, it } from "vitest";
import { accrualPrice, computeNavs, marketOpen, parseStooqCsv, parseYahooSpark } from "../../worker-main.js";

/* 第九期 NAV 实时化——纯函数层：多币种加权 / 校准 / 降级 / 适配器解析 / 开市判定。
 *  全部 fixtures 本地构造，零外呼（硬规则 7）。 */

const RATES = { USD: 0.14, HKD: 1.1, EUR: 0.1284, JPY: 21.22, TWD: 4.52, KRW: 196.5 };
const HOLDINGS_2 = { "test-fund": [["AAPL", 60, "USD", "US"], ["0700.HK", 40, "HKD", "HK"]] };

describe("computeNavs（多币种加权 → CNY → 校准 → nav/day_change）", () => {
  it("加权求和与 day_change 精度：nav 4dp、涨跌 2dp（昨收口径）", () => {
    const prices = { AAPL: { p: 200, prev: 198 }, "0700.HK": { p: 400, prev: 404 } };
    const r = computeNavs({ holdings: HOLDINGS_2, prices, rates: RATES, calib: { "test-fund": 1 }, staticNavs: { "test-fund": 2 } });
    const usd = 1 / 0.14, hkd = 1 / 1.1;
    const raw = 0.6 * 200 * usd + 0.4 * 400 * hkd;
    const rawPrev = 0.6 * 198 * usd + 0.4 * 404 * hkd;
    expect(r.navs["test-fund"].nav).toBe(+(raw).toFixed(4));
    expect(r.navs["test-fund"].day_change).toBe(+(((raw / rawPrev) - 1) * 100).toFixed(2));
    expect(r.navs["test-fund"].live).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("校准常数缺失时现场标定：nav === 静态 nav（上线零断层），k 经 recalibrated 返回持久化", () => {
    const prices = { AAPL: { p: 200, prev: 198 }, "0700.HK": { p: 400, prev: 404 } };
    const r1 = computeNavs({ holdings: HOLDINGS_2, prices, rates: RATES, calib: {}, staticNavs: { "test-fund": 2.0 } });
    expect(r1.navs["test-fund"].nav).toBe(2.0); /* k×raw ≡ staticNav（恒等，非近似） */
    expect(r1.recalibrated["test-fund"]).toBeCloseTo(2.0 / (0.6 * 200 / 0.14 + 0.4 * 400 / 1.1), 12);
    /* 二次调用带持久化后的 k：nav 连续（波动只来自底层价格变化） */
    const r2 = computeNavs({ holdings: HOLDINGS_2, prices: { AAPL: { p: 204, prev: 198 }, "0700.HK": { p: 400, prev: 404 } }, rates: RATES, calib: { "test-fund": r1.recalibrated["test-fund"] }, staticNavs: { "test-fund": 2.0 } });
    expect(r2.navs["test-fund"].nav).toBeGreaterThan(2.0);
    expect(r2.recalibrated["test-fund"]).toBeUndefined();
  });

  it("降级链：任一底层缺价或缺汇率 → 整只回退静态（live:false），互不牵连；无静态 nav 也无校准 → nav=null", () => {
    const holdings = { ...HOLDINGS_2, "cny-only": [["600519.SS", 100, "CNY", "CN"]], "no-static": [["AAPL", 100, "USD", "US"]] };
    const r = computeNavs({ holdings, prices: { "600519.SS": { p: 1200, prev: 1210 } }, rates: RATES, calib: {}, staticNavs: { "test-fund": 2.0, "cny-only": 3.0 }, staticDays: { "test-fund": 0.5 } });
    expect(r.navs["test-fund"].live).toBe(false); /* AAPL/0700.HK 缺价 */
    expect(r.navs["test-fund"].nav).toBe(2.0);
    expect(r.navs["test-fund"].day_change).toBe(0.5); /* 静态日涨跌原样透传 */
    expect(r.navs["cny-only"].live).toBe(true); /* CNY 无需汇率 */
    expect(r.navs["no-static"].nav).toBeNull();
    expect(new Set(r.missing)).toEqual(new Set(["test-fund", "no-static"]));
    /* 缺 HKD 汇率：含 0700.HK 的基金降级，纯 CNY 基金照常实时 */
    const r2 = computeNavs({ holdings, prices: { AAPL: { p: 200 }, "0700.HK": { p: 400 }, "600519.SS": { p: 1200 } }, rates: { ...RATES, HKD: undefined }, calib: { "test-fund": 1 }, staticNavs: { "test-fund": 2.0, "cny-only": 3.0 } });
    expect(r2.navs["test-fund"].live).toBe(false);
    expect(r2.navs["cny-only"].live).toBe(true);
  });

  it("默认 16 只持仓表：权重合计 100、币种/市场标签齐全、ticker 全局去重后 ≤80（子请求预算）", async () => {
    const { FUND_HOLDINGS: H } = await import("../../worker-main.js");
    for (const [slug, list] of Object.entries(H)) {
      const sum = list.reduce((a, h) => a + h[1], 0); /* h=[t,w,ccy,mkt] */
      expect(Math.abs(sum - 100), slug).toBeLessThan(0.05);
      for (const [t, , ccy, mkt] of list) {
        if (t.startsWith("ACC:")) { expect(t).toMatch(/^ACC:(CNY|USD):[\d.]+$/); expect(mkt).toBe("ACC"); }
        else { expect(["USD", "HKD", "CNY", "TWD", "KRW", "JPY", "EUR"]).toContain(ccy); expect(["US", "HK", "CN", "TW", "KR", "JP", "METAL"]).toContain(mkt); }
      }
    }
    expect(Object.keys(H)).toHaveLength(16);
    const tickers = new Set(Object.values(H).flat().map((h) => h[0]).filter((t) => !t.startsWith("ACC:")));
    expect(tickers.size).toBeGreaterThan(0);
    expect(tickers.size).toBeLessThanOrEqual(80); /* 一次刷新 ≤6 批 spark（15/批），远低于 50 子请求上限 */
  });
});

describe("应计资产（ACC:货币:年化%）——货币基金/现金腿", () => {
  const ANCHOR = Date.parse("2026-09-26T00:00:00+08:00");
  it("基期 100、按年化线性应计；24h 应计日增长 = 年化/365", () => {
    expect(accrualPrice(1.9, ANCHOR)).toBe(100);
    expect(accrualPrice(1.9, ANCHOR + 365 * 86_400_000)).toBeCloseTo(101.9, 9);
    const r = computeNavs({ holdings: { "global-money-1": [["ACC:CNY:1.9", 100, "CNY", "ACC"]] }, prices: {}, rates: {}, calib: {}, staticNavs: { "global-money-1": 1.4206 }, nowMs: ANCHOR + 10 * 86_400_000 });
    expect(r.navs["global-money-1"].nav).toBe(1.4206); /* 校准后 t0 恒等 */
    expect(r.navs["global-money-1"].day_change).toBeCloseTo(1.9 / 365, 2); /* 货币基金日应计 ≈ 0.0052% */
    expect(r.navs["global-money-1"].market_open).toBe(true); /* 应计资产无休市 */
  });
});

describe("parseYahooSpark（主源适配，两种响应形状）", () => {
  it("新形状（顶层按符号 map）：fulldayPrice/chartPreviousClose 直取", () => {
    const out = parseYahooSpark({
      NVDA: { symbol: "NVDA", fulldayPrice: 225.11, fulldayChange: 0.53, close: [225.11], chartPreviousClose: 224.58 },
      "0700.HK": { symbol: "0700.HK", fulldayPrice: 436.6, close: [436.6], chartPreviousClose: 438.4 },
    });
    expect(out.NVDA).toEqual({ p: 225.11, prev: 224.58 });
    expect(out["0700.HK"]).toEqual({ p: 436.6, prev: 438.4 });
  });
  it("旧形状（spark.result 数组）+ 脏数据过滤（价≤0/缺价剔除；prev 缺失→null 但保留现价）", () => {
    const out = parseYahooSpark({ spark: { result: [
      { symbol: "AGGG", response: [{ meta: {}, close: [0.0001] }] }, /* 已知脏数据（AGGG 报价损坏）→ 剔除 */
      { symbol: "SMH", response: [{ close: [608.26] }] }, /* 无 prev → prev:null */
      { symbol: "GC=F", response: [{ fulldayPrice: 2650.2, close: [2650.2], chartPreviousClose: 2641.8 }] },
    ] } });
    expect(out.AGGG).toBeUndefined();
    expect(out.SMH).toEqual({ p: 608.26, prev: null });
    expect(out["GC=F"]).toEqual({ p: 2650.2, prev: 2641.8 });
  });
});

describe("parseStooqCsv（备源适配）", () => {
  it("表头/N/D 行过滤，Close 列取价（stooq 无昨收 → prev:null）", () => {
    const csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\r\nNVDA.US,2026-09-25,22:00:03,224.1,226.9,223.1,225.11,42661541\r\nXAUUSD,2026-09-25,22:00:03,2640,2660,2635,2650.2,0\r\nBADCASE,2026-09-25,22:00:03,N/D,N/D,N/D,N/D,N/D";
    const out = parseStooqCsv(csv);
    expect(out["NVDA.US"]).toEqual({ p: 225.11, prev: null });
    expect(out.XAUUSD).toEqual({ p: 2650.2, prev: null });
    expect(out.BADCASE).toBeUndefined();
  });
});

describe("marketOpen（开市判定，展示级；北京时区口径）", () => {
  const bj = (s) => Date.parse(s + "+08:00");
  it("周三盘内：北京上午 A股/港股开、美股闭；北京晚间美股开、A 股闭（夏令时 ET=UTC-4）", () => {
    const wedAM = bj("2026-09-23T10:00:00"); /* 周三 10:00 北京 */
    expect(marketOpen("CN", wedAM)).toBe(true);
    expect(marketOpen("HK", wedAM)).toBe(true);
    expect(marketOpen("US", wedAM)).toBe(false); /* 22:00 EDT 周二 */
    const wedPM = bj("2026-09-23T22:30:00"); /* 周三 22:30 北京 = 10:30 EDT */
    expect(marketOpen("US", wedPM)).toBe(true);
    expect(marketOpen("CN", wedPM)).toBe(false);
  });
  it("午休：A 股 11:30-13:00 闭、港股 12:00-13:00 闭；两地午后开", () => {
    const lunch = bj("2026-09-23T12:30:00");
    expect(marketOpen("CN", lunch)).toBe(false);
    expect(marketOpen("HK", lunch)).toBe(false);
    expect(marketOpen("JP", lunch)).toBe(true); /* 东京 13:30，午休 11:30-12:30 已过 */
    const pm = bj("2026-09-23T14:00:00");
    expect(marketOpen("CN", pm)).toBe(true);
    expect(marketOpen("HK", pm)).toBe(true);
  });
  it("周末全闭（股票/金属）；应计资产无休市；冬令时 ET=UTC-5（一月上午 22:30 北京=9:30 EST 开盘）", () => {
    const sat = bj("2026-09-26T10:00:00"); /* 周六 */
    for (const t of ["US", "HK", "CN", "JP", "TW", "KR", "METAL"]) expect(marketOpen(t, sat), t).toBe(false);
    expect(marketOpen("ACC", sat)).toBe(true);
    const janWed = bj("2026-01-14T22:30:00"); /* 周三 22:30 北京 = 09:30 EST 边界含起点 */
    expect(marketOpen("US", janWed)).toBe(true);
  });
});
