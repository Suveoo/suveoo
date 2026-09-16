#!/usr/bin/env node
/* gen-fund-data.mjs — Suveoo 基金数据生成器（16 只）
 *
 * 金融依据（非随机数字）：
 * 1. 月度净值由多因子模型生成：r_m = alpha/12 + Σ(w_f · f_y/12) + idio·ε/√12，
 *    因子年度收益锚定真实市场史（MSCI ACWI / 全球综合债 / 伦敦金 / 亚太科技 /
 *    半导体 AI / REITs / 医疗 / 新能源 / 货基收益率下移轨迹）。
 * 2. returns(1m..since)、年化收益/波动、夏普、最大回撤等指标全部从生成序列反算，保证自洽。
 * 3. projection（未来 10 年）为 1200 路径蒙特卡洛（对数正态；前瞻假设低于历史均值——估值回归），
 *    输出 p10/p25/p50/p75/p90 的 1 元投资年度终值。
 * 4. 固定种子（mulberry32），幂等可复现。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "frontend", "assets", "data", "funds");
const END = { y: 2026, m: 8 }; /* 序列终点：2026-08 月末 */

/* ---------- 确定性 RNG ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* ---------- 真实市场因子（年度收益，%）。2026 为 YTD 至 8 月 ---------- */
const F = {
  eq: { 2012: 12, 2013: 17, 2014: 3, 2015: -1, 2016: 6, 2017: 19, 2018: -9, 2019: 21, 2020: 14, 2021: 15, 2022: -18, 2023: 18, 2024: 15, 2025: 13, 2026: 8 },
  bond: { 2012: 4, 2013: -2, 2014: 4, 2015: 1, 2016: 3, 2017: 3, 2018: 1, 2019: 7, 2020: 5, 2021: -3, 2022: -13, 2023: 6, 2024: 4, 2025: 4, 2026: 2 },
  gold: { 2012: 5, 2013: -28, 2014: -2, 2015: -10, 2016: 8, 2017: 12, 2018: -2, 2019: 13, 2020: 20, 2021: -4, 2022: 0, 2023: 12, 2024: 23, 2025: 26, 2026: 18 },
  apac: { 2012: 4, 2013: 7, 2014: 22, 2015: 5, 2016: -8, 2017: 21, 2018: -20, 2019: 20, 2020: 18, 2021: 2, 2022: -16, 2023: -6, 2024: 11, 2025: 9, 2026: 7 },
  /* 超额因子（叠加在 eq 上） */
  tech: { 2012: 4, 2013: 5, 2014: 4, 2015: 6, 2016: 4, 2017: 9, 2018: -2, 2019: 7, 2020: 14, 2021: 9, 2022: -12, 2023: 14, 2024: 12, 2025: 10, 2026: 5 },
  semi: { 2012: 2, 2013: 5, 2014: 6, 2015: 4, 2016: 8, 2017: 12, 2018: -6, 2019: 22, 2020: 26, 2021: 22, 2022: -35, 2023: 38, 2024: 17, 2025: 21, 2026: 13 },
  reit: { 2016: 2, 2017: 5, 2018: -4, 2019: 6, 2020: -18, 2021: 18, 2022: -25, 2023: 10, 2024: 6, 2025: 8, 2026: 4 },
  health: { 2015: 2, 2016: -2, 2017: 5, 2018: 3, 2019: 6, 2020: 6, 2021: 5, 2022: -8, 2023: -3, 2024: -8, 2025: 5, 2026: 3 },
  energy: { 2019: 12, 2020: 52, 2021: 30, 2022: -25, 2023: -30, 2024: -12, 2025: 8, 2026: 5 },
  embi: { 2012: 12, 2013: -8, 2014: 4, 2015: -4, 2016: 8, 2017: 10, 2018: -6, 2019: 12, 2020: 2, 2021: 0, 2022: -12, 2023: 8, 2024: 6, 2025: 7, 2026: 4 },
  /* 人民币货基年化（锚定余额宝七日年化轨迹） */
  cnmm: { 2012: 3.8, 2013: 4.1, 2014: 3.5, 2015: 3.0, 2016: 2.6, 2017: 2.9, 2018: 2.9, 2019: 2.4, 2020: 2.0, 2021: 2.1, 2022: 1.9, 2023: 1.9, 2024: 1.7, 2025: 1.5, 2026: 1.4 },
  /* A 股红利低波超额（相对 apac） */
  div: { 2019: 4, 2020: -4, 2021: 10, 2022: 12, 2023: 8, 2024: 12, 2025: 6, 2026: 4 },
};

/* ---------- 指标计算（自洽性来源） ---------- */
const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : 0);
function statsFromSeries(nav, months) {
  const rets = [];
  for (let i = 1; i < nav.length; i++) rets.push(nav[i] / nav[i - 1] - 1);
  const n = rets.length, mean = rets.reduce((a, b) => a + b, 0) / n;
  const annRet = (Math.pow(nav[nav.length - 1] / nav[0], 12 / n) - 1) * 100;
  const vol = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1)) * Math.sqrt(12) * 100;
  const rf = 2.0;
  const sharpe = vol > 0.05 ? (annRet - rf) / vol : null;
  let peak = nav[0], mdd = 0;
  for (const v of nav) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
  const monthRets = rets.map((r) => r * 100);
  return {
    ann_return: +annRet.toFixed(2), ann_vol: +vol.toFixed(2),
    sharpe: sharpe == null ? null : +sharpe.toFixed(2), max_drawdown: +(mdd * 100).toFixed(2),
    best_month: +Math.max(...monthRets).toFixed(2), worst_month: +Math.min(...monthRets).toFixed(2),
  };
}

/* ---------- 因子月度噪声（年化波动拆到月，模拟年内路径；锚定真实资产波动量级） ---------- */
const FVOL = { eq: 4.2, bond: 1.1, gold: 3.6, apac: 4.8, tech: 1.4, semi: 2.2, reit: 1.6, health: 1.2, energy: 3.0, embi: 1.5, cnmm: 0.02, div: 0.8 };

/* ---------- 月度序列生成 ---------- */
function genSeries(spec, rng) {
  const start = spec.inception; /* {y,m} */
  const navs = [1];
  const bench = [1];
  /* dates[i] 与 navs[i] 一一对齐：起点月对应初始净值 1，其后逐月 */
  const dates = [`${start.y}-${String(start.m).padStart(2, "0")}`];
  const FNAMES = Object.keys(FVOL);
  let y = start.y, m = start.m;
  while (y < END.y || (y === END.y && m <= END.m)) {
    dates.push(`${y}-${String(m).padStart(2, "0")}`);
    let fy = y;
    if (y >= 2026) fy = 2026; /* YTD 年 */
    const fv = (name) => (F[name]?.[fy] ?? 0) / 100;
    /* 每月先为全部因子抽一次共同月度冲击（未用到的因子也抽，保证任意因子子集路径一致） */
    const shock = {};
    for (const fn of FNAMES) shock[fn] = (FVOL[fn] / 100) * gauss(rng);
    let r = spec.alpha / 12 / 100;
    for (const [fn, w] of Object.entries(spec.factors)) r += w * (fv(fn) / 12 + shock[fn]);
    r += (spec.idio / Math.sqrt(12) / 100) * gauss(rng);
    /* 平滑：上月上偏则本月轻微回调（动量逆转），降低月间跳跃 */
    const prevR = navs.length > 1 ? navs[navs.length - 1] / navs[navs.length - 2] - 1 : 0;
    r -= prevR * 0.08;
    navs.push(navs[navs.length - 1] * (1 + r));
    /* 基准：主因子确定性部分（不含 alpha、特异与冲击） */
    let br = 0;
    for (const [fn, w] of Object.entries(spec.factors)) br += w * fv(fn) / 12;
    bench.push(bench[bench.length - 1] * (1 + br));
    m++; if (m > 12) { m = 1; y++; }
  }
  /* 终值校准：月度路径形状保留，但区间总收益锚定因子复合目标（含波动拖累补偿 σ²/2），
   * 防止随机实现把长期收益带偏——保证"金融依据"落在区间级别上。 */
  const years = (navs.length - 1) / 12;
  const tv = Math.sqrt(spec.idio ** 2 + Object.entries(spec.factors).reduce((a, [fn, w]) => a + (w * FVOL[fn]) ** 2, 0)) / 100;
  const benchEnd = bench[bench.length - 1];
  const target = benchEnd * Math.pow(1 + spec.alpha / 100, years) * Math.exp((tv * tv / 2) * years * 0.55);
  const c = Math.log(target / navs[navs.length - 1]) / (navs.length - 1);
  for (let i = 0; i < navs.length; i++) navs[i] *= Math.exp(c * i);
  return { navs, bench, dates };
}

/* ---------- 10 年蒙特卡洛预测（前瞻假设：估值回归，低于历史） ---------- */
function genProjection(spec, rng) {
  const mu = Math.log(1 + spec.fwd_mu / 100), sig = spec.fwd_sigma / 100; /* μ 转对数：p50 终值 = (1+fwd_mu)^t，几何年化语义 */
  const PATHS = 1200, MONTHS = 120;
  const grid = Array.from({ length: 11 }, () => []); /* 年 0..10 */
  for (let p = 0; p < PATHS; p++) {
    let v = 1;
    grid[0].push(v);
    for (let t = 1; t <= MONTHS; t++) {
      v *= Math.exp(mu / 12 + (sig / Math.sqrt(12)) * gauss(rng));
      if (t % 12 === 0) grid[t / 12].push(v);
    }
  }
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const band = (p) => grid.map((g) => +q(g, p).toFixed(4));
  return {
    assumptions: { exp_return: spec.fwd_mu, exp_vol: spec.fwd_sigma, rf: 2.0, method: "1200 路径对数正态蒙特卡洛（月度）；前瞻假设已按估值回归下调，低于历史区间" },
    years: Array.from({ length: 11 }, (_, i) => i),
    p10: band(0.10), p25: band(0.25), p50: band(0.50), p75: band(0.75), p90: band(0.90),
  };
}

/* ---------- 16 只基金定义 ---------- */
const FUNDS = [
  {
    slug: "global-money-1", name: "Suveoo 环球货币基金 1", code: "SV-GMM1", risk_level: 1,
    inception: { y: 2012, m: 3 }, factors: { cnmm: 1.0 }, alpha: -0.1, idio: 0.15, fwd_mu: 1.3, fwd_sigma: 0.3,
    benchmark: "人民币货币基金七日年化基准", asset_class: "货币市场",
    strategy: "投资于银行存款、同业存单与短期限高等级债券，追求流动性与收益的平衡；组合久期控制在 120 天以内。",
    min_invest: "¥0.01", fee: { mgmt: 0.15, custody: 0.05, sales: 0.00, total: "0.20%/年" }, dividend_policy: "红利再投（每日结转）",
    manager: { name: "沈亦舟", tenure_years: 9, aum: "¥286.4 亿（模拟）", style: "流动性管理" },
    holdings: [
      { name: "同业存单（国有大行 3M）", weight: 32.5 }, { name: "银行协议存款", weight: 24.8 },
      { name: "国债逆回购", weight: 15.2 }, { name: "短融券 AAA", weight: 12.6 },
      { name: "政策性金融债", weight: 9.4 }, { name: "现金及备付金", weight: 5.5 },
    ],
    sectors: [{ name: "货币市场工具", weight: 100 }],
    regions: [{ name: "中国内地", weight: 100 }],
  },
  {
    slug: "global-short-bond", name: "Suveoo 环球短债基金", code: "SV-GSB2", risk_level: 1,
    inception: { y: 2020, m: 6 }, factors: { bond: 0.28, cnmm: 0.62 }, alpha: 0.75, idio: 0.25, fwd_mu: 2.4, fwd_sigma: 1.6,
    benchmark: "综合债指数（1-3 年）× 汇率对冲", asset_class: "固定收益·短债",
    strategy: "以投资级短久期债券为主，通过骑乘策略与货币对冲获取稳定票息；久期 1.5-2.5 年区间浮动。",
    min_invest: "¥10", fee: { mgmt: 0.25, custody: 0.08, sales: 0.00, total: "0.33%/年" }, dividend_policy: "现金分红（每月）",
    manager: { name: "顾言笙", tenure_years: 7, aum: "¥94.2 亿（模拟）", style: "短久期票息" },
    holdings: [
      { name: "美国国债 2Y", weight: 28.4 }, { name: "德国国债 2Y", weight: 16.8 },
      { name: "中国国债 2Y", weight: 14.2 }, { name: "投资级公司债 AAA", weight: 12.5 },
      { name: "日本国债 2Y", weight: 10.6 }, { name: "货币对冲工具", weight: 8.3 },
      { name: "现金", weight: 9.2 },
    ],
    sectors: [{ name: "利率债", weight: 62 }, { name: "信用债", weight: 25 }, { name: "现金/对冲", weight: 13 }],
    regions: [{ name: "北美", weight: 34 }, { name: "欧洲", weight: 26 }, { name: "中国", weight: 24 }, { name: "亚太其他", weight: 16 }],
  },
  {
    slug: "esg-bond", name: "Suveoo 环球 ESG 债券基金", code: "SV-ESG1", risk_level: 2,
    inception: { y: 2019, m: 3 }, factors: { bond: 0.7 }, alpha: 1.6, idio: 1.8, fwd_mu: 3.6, fwd_sigma: 4.2,
    benchmark: "全球绿色债券指数", asset_class: "固定收益·ESG",
    strategy: "投资于绿色债券、社会责任债券与可持续发展挂钩债券，ESG 评级 BBB 以上；通过负面剔除与主题超配控制信用风险。",
    min_invest: "¥100", fee: { mgmt: 0.35, custody: 0.10, sales: 0.05, total: "0.50%/年" }, dividend_policy: "现金分红（每季度）",
    manager: { name: "陆之遥", tenure_years: 6, aum: "¥61.8 亿（模拟）", style: "可持续固收" },
    holdings: [
      { name: "法国绿色国债 OAT 2035", weight: 9.8 }, { name: "德国绿色联邦债", weight: 8.6 },
      { name: "欧洲投资银行气候债", weight: 7.9 }, { name: "世界银行可持续债", weight: 7.2 },
      { name: "中国绿色金融债（国开）", weight: 6.8 }, { name: "美国企业绿债 AAA", weight: 6.1 },
      { name: "日本政府绿色债", weight: 5.4 }, { name: "荷兰绿色债券", weight: 4.9 },
    ],
    sectors: [{ name: "主权/超主权绿债", weight: 55 }, { name: "金融绿债", weight: 28 }, { name: "企业绿债", weight: 17 }],
    regions: [{ name: "欧洲", weight: 52 }, { name: "北美", weight: 22 }, { name: "亚太", weight: 20 }, { name: "其他", weight: 6 }],
  },
  {
    slug: "cn-dividend", name: "Suveoo 红利低波精选", code: "SV-DLV3", risk_level: 2,
    inception: { y: 2019, m: 6 }, factors: { apac: 0.55, div: 1.0 }, alpha: 0.4, idio: 4.5, fwd_mu: 5.8, fwd_sigma: 9.5,
    benchmark: "中证红利低波动指数", asset_class: "股票·红利低波",
    strategy: "聚焦高股息、低波动、现金流稳健的上市公司；股息率 4% 以上、连续分红 5 年以上为入池硬条件，行业上限 25%。",
    min_invest: "¥100", fee: { mgmt: 0.50, custody: 0.10, sales: 0.10, total: "0.70%/年" }, dividend_policy: "现金分红（每季度，强制分红 90%）",
    manager: { name: "秦慕之", tenure_years: 8, aum: "¥128.6 亿（模拟）", style: "红利价值" },
    holdings: [
      { name: "工商银行", weight: 6.8 }, { name: "建设银行", weight: 5.9 }, { name: "中国神华", weight: 5.2 },
      { name: "长江电力", weight: 4.8 }, { name: "中国石油", weight: 4.5 }, { name: "农业银行", weight: 4.2 },
      { name: "中国海洋石油", weight: 3.9 }, { name: "陕西煤业", weight: 3.6 }, { name: "大秦铁路", weight: 3.1 },
      { name: "中国移动", weight: 2.8 },
    ],
    sectors: [{ name: "银行", weight: 24 }, { name: "能源", weight: 22 }, { name: "公用事业", weight: 16 }, { name: "交运", weight: 12 }, { name: "电信", weight: 10 }, { name: "其他", weight: 16 }],
    regions: [{ name: "中国内地", weight: 88 }, { name: "香港", weight: 12 }],
  },
  {
    slug: "consumer-staples", name: "Suveoo 全球必需消费指数", code: "SV-GCS4", risk_level: 2,
    inception: { y: 2014, m: 3 }, factors: { eq: 0.7 }, alpha: 0.2, idio: 5.5, fwd_mu: 5.5, fwd_sigma: 9.8,
    benchmark: "全球必需消费品指数（本币）", asset_class: "股票·防御消费",
    strategy: "跟踪全球必需消费品龙头：食品饮料、家用产品、零售必需品；防御属性强，波动低于宽基，长期赚通胀传导的钱。",
    min_invest: "¥100", fee: { mgmt: 0.30, custody: 0.08, sales: 0.05, total: "0.43%/年" }, dividend_policy: "现金分红（每半年）",
    manager: { name: "苏念慈", tenure_years: 10, aum: "¥87.3 亿（模拟）", style: "指数增强" },
    holdings: [
      { name: "宝洁 P&G", weight: 7.2 }, { name: "可口可乐", weight: 6.5 }, { name: "雀巢", weight: 6.1 },
      { name: "沃尔玛", weight: 5.8 }, { name: "百事", weight: 5.2 }, { name: "联合利华", weight: 4.9 },
      { name: "贵州茅台", weight: 4.4 }, { name: "Costco", weight: 4.1 }, { name: "高露洁", weight: 3.5 },
      { name: "金佰利", weight: 3.0 },
    ],
    sectors: [{ name: "食品饮料", weight: 46 }, { name: "家用与个人用品", weight: 24 }, { name: "必需零售", weight: 20 }, { name: "烟草", weight: 10 }],
    regions: [{ name: "北美", weight: 52 }, { name: "欧洲", weight: 26 }, { name: "亚太", weight: 18 }, { name: "其他", weight: 4 }],
  },
  {
    slug: "quant-neutral", name: "Suveoo 量化市场中性", code: "SV-QMN5", risk_level: 2,
    inception: { y: 2017, m: 9 }, factors: { }, alpha: 4.3, idio: 2.6, fwd_mu: 3.8, fwd_sigma: 3.2,
    benchmark: "一年期定存利率 + 2%", asset_class: "绝对收益·市场中性",
    strategy: "多因子选股多头 + 股指期货对冲市场风险，收益来自截面定价偏差；组合年化换手 8-12 倍，行业与市值中性约束。",
    min_invest: "¥1,000", fee: { mgmt: 1.20, custody: 0.15, sales: 0.20, total: "1.55%/年 + 业绩报酬 20%（超额部分）" }, dividend_policy: "红利再投",
    manager: { name: "程一苇", tenure_years: 7, aum: "¥52.7 亿（模拟）", style: "量化对冲" },
    holdings: [
      { name: "多头股票组合（约 280 只）", weight: 138 }, { name: "股指期货空头（IC/IM）", weight: -118 },
      { name: "现金及保证金", weight: 80 },
    ],
    sectors: [{ name: "全市场分散", weight: 100 }],
    regions: [{ name: "中国内地", weight: 100 }],
  },
  {
    slug: "em-gov-bond", name: "Suveoo 环球新兴市场政府债券指数基金", code: "SV-EMG3", risk_level: 3,
    inception: { y: 2013, m: 6 }, factors: { bond: 0.45, embi: 1.0 }, alpha: 0.1, idio: 5.0, fwd_mu: 4.8, fwd_sigma: 9.0,
    benchmark: "新兴市场本币政府债指数", asset_class: "固定收益·新兴市场",
    strategy: "覆盖主要新兴市场本币国债，汇率敞口不完全对冲（保留 60%）；久期 5-6 年；国别上限 12%。",
    min_invest: "¥10", fee: { mgmt: 0.45, custody: 0.12, sales: 0.05, total: "0.62%/年" }, dividend_policy: "现金分红（每季度）",
    manager: { name: "纪云深", tenure_years: 9, aum: "¥73.5 亿（模拟）", style: "全球固收" },
    holdings: [
      { name: "墨西哥国债 5Y", weight: 9.6 }, { name: "巴西国债 5Y", weight: 9.1 }, { name: "印尼国债 10Y", weight: 8.7 },
      { name: "印度国债 7Y", weight: 8.2 }, { name: "波兰国债 5Y", weight: 7.5 }, { name: "南非国债 10Y", weight: 7.0 },
      { name: "泰国国债 10Y", weight: 6.4 }, { name: "土耳其国债 3Y", weight: 4.8 },
    ],
    sectors: [{ name: "本币政府债", weight: 82 }, { name: "准主权债", weight: 12 }, { name: "现金", weight: 6 }],
    regions: [{ name: "拉美", weight: 32 }, { name: "亚洲新兴", weight: 38 }, { name: "欧非中东", weight: 30 }],
  },
  {
    slug: "global-mixed-1", name: "Suveoo 环球多元资产组合 1", code: "SV-GMA1", risk_level: 3,
    inception: { y: 2014, m: 9 }, factors: { eq: 0.55, bond: 0.4 }, alpha: 0.3, idio: 3.2, fwd_mu: 5.2, fwd_sigma: 7.8,
    benchmark: "60% 全球股票 + 40% 全球综合债", asset_class: "混合·稳健平衡",
    strategy: "股债 55/40 动态再平衡（±5% 触发）；股票端全球分散，债券端以投资级为主；波动目标 8% 以内。",
    min_invest: "¥1,000", fee: { mgmt: 0.60, custody: 0.12, sales: 0.10, total: "0.82%/年" }, dividend_policy: "现金分红（每年）",
    manager: { name: "林晚晴", tenure_years: 11, aum: "¥156.9 亿（模拟）", style: "风险平价" },
    holdings: [
      { name: "美国国债 10Y", weight: 8.5 }, { name: "Apple Inc.", weight: 4.2 }, { name: "微软", weight: 3.8 },
      { name: "诺和诺德", weight: 3.1 }, { name: "台积电", weight: 2.9 }, { name: "贵州茅台", weight: 2.4 },
      { name: "腾讯控股", weight: 2.2 }, { name: "LVMH", weight: 1.9 }, { name: "丰田汽车", weight: 1.7 },
      { name: "现金及等价物", weight: 5.3 },
    ],
    sectors: [{ name: "股票", weight: 55 }, { name: "债券", weight: 40 }, { name: "现金", weight: 5 }],
    regions: [{ name: "北美", weight: 42 }, { name: "欧洲", weight: 22 }, { name: "亚太", weight: 28 }, { name: "其他", weight: 8 }],
  },
  {
    slug: "reit-global", name: "Suveoo 环球 REITs 指数基金", code: "SV-GRT6", risk_level: 3,
    inception: { y: 2016, m: 3 }, factors: { eq: 0.8, reit: 1.0 }, alpha: -1.2, idio: 5.5, fwd_mu: 5.6, fwd_sigma: 14.5,
    benchmark: "全球 REITs 指数（含开发，本币）", asset_class: "不动产·REITs",
    strategy: "覆盖北美、亚太、欧洲上市 REITs：写字楼、物流、数据中心、住宅、零售 Infrastructure；分红率 3.5-4.5%。",
    min_invest: "¥100", fee: { mgmt: 0.40, custody: 0.10, sales: 0.05, total: "0.55%/年" }, dividend_policy: "现金分红（每季度，分红率 90% 以上）",
    manager: { name: "阮行止", tenure_years: 8, aum: "¥68.4 亿（模拟）", style: "不动产投资" },
    holdings: [
      { name: "Prologis（物流）", weight: 7.8 }, { name: "American Tower（通信塔）", weight: 7.2 },
      { name: "Equinix（数据中心）", weight: 6.5 }, { name: "Simon Property（零售）", weight: 5.9 },
      { name: "Welltower（医疗地产）", weight: 5.1 }, { name: "日本物流 REIT", weight: 4.6 },
      { name: "领展房产基金（香港）", weight: 4.2 }, { name: "Vonovia（德国住宅）", weight: 3.8 },
    ],
    sectors: [{ name: "物流/工业", weight: 24 }, { name: "通信/数据", weight: 22 }, { name: "住宅", weight: 18 }, { name: "零售", weight: 16 }, { name: "办公", weight: 12 }, { name: "其他", weight: 8 }],
    regions: [{ name: "北美", weight: 58 }, { name: "亚太", weight: 26 }, { name: "欧洲", weight: 16 }],
  },
  {
    slug: "global-mixed-2", name: "Suveoo 环球多元资产组合 2", code: "SV-GMA2", risk_level: 4,
    inception: { y: 2015, m: 3 }, factors: { eq: 0.75, bond: 0.2, gold: 0.05 }, alpha: 0.4, idio: 6.0, fwd_mu: 6.4, fwd_sigma: 11.5,
    benchmark: "75% 全球股票 + 20% 全球债 + 5% 黄金", asset_class: "混合·进取平衡",
    strategy: "股 75/债 20/金 5 进取配置，季度再平衡；股票端超配科技与医疗成长；波动目标 12% 以内。",
    min_invest: "¥1,000", fee: { mgmt: 0.70, custody: 0.12, sales: 0.12, total: "0.94%/年" }, dividend_policy: "红利再投",
    manager: { name: "林晚晴", tenure_years: 11, aum: "¥98.7 亿（模拟）", style: "风险平价" },
    holdings: [
      { name: "微软", weight: 5.6 }, { name: "Apple Inc.", weight: 5.1 }, { name: "英伟达", weight: 4.7 },
      { name: "台积电", weight: 3.9 }, { name: "阿斯麦", weight: 3.2 }, { name: "美国国债 10Y", weight: 8.2 },
      { name: "投资级公司债", weight: 6.8 }, { name: "黄金 ETF", weight: 5.0 }, { name: "腾讯控股", weight: 2.6 },
      { name: "现金", weight: 4.1 },
    ],
    sectors: [{ name: "股票", weight: 75 }, { name: "债券", weight: 20 }, { name: "商品", weight: 5 }],
    regions: [{ name: "北美", weight: 48 }, { name: "欧洲", weight: 20 }, { name: "亚太", weight: 26 }, { name: "其他", weight: 6 }],
  },
  {
    slug: "global-equity-index", name: "Suveoo 环球股票指数基金", code: "SV-GEI7", risk_level: 4,
    inception: { y: 2012, m: 6 }, factors: { eq: 1.0 }, alpha: 0.0, idio: 2.0, fwd_mu: 6.5, fwd_sigma: 15.5,
    benchmark: "MSCI 全球指数（本币）", asset_class: "股票·全球宽基",
    strategy: "被动跟踪全球发达+新兴市场股票指数，覆盖 23 个发达市场与 24 个新兴市场、约 2900 只成分股；费率低、容量大。",
    min_invest: "¥100", fee: { mgmt: 0.20, custody: 0.06, sales: 0.00, total: "0.26%/年" }, dividend_policy: "现金分红（每年）",
    manager: { name: "叶栖迟", tenure_years: 12, aum: "¥312.5 亿（模拟）", style: "指数管理" },
    holdings: [
      { name: "Apple Inc.", weight: 4.6 }, { name: "微软", weight: 4.1 }, { name: "英伟达", weight: 3.2 },
      { name: "Alphabet", weight: 2.5 }, { name: "亚马逊", weight: 2.2 }, { name: "Meta", weight: 1.6 },
      { name: "台积电", weight: 1.4 }, { name: "腾讯控股", weight: 1.1 }, { name: "阿斯麦", weight: 0.9 },
      { name: "三星电子", weight: 0.8 },
    ],
    sectors: [{ name: "信息技术", weight: 28 }, { name: "金融", weight: 16 }, { name: "医疗健康", weight: 12 }, { name: "可选消费", weight: 11 }, { name: "工业", weight: 10 }, { name: "其他", weight: 23 }],
    regions: [{ name: "北美", weight: 62 }, { name: "欧洲", weight: 18 }, { name: "亚太", weight: 15 }, { name: "其他", weight: 5 }],
  },
  {
    slug: "gold-index", name: "Suveoo 环球黄金指数基金", code: "SV-GLD8", risk_level: 4,
    inception: { y: 2012, m: 1 }, factors: { gold: 1.0 }, alpha: -0.1, idio: 2.2, fwd_mu: 4.8, fwd_sigma: 14.8,
    benchmark: "伦敦金现（XAU）× 汇率", asset_class: "商品·贵金属",
    strategy: "通过 ETF 与远期合约跟踪伦敦金现价格；不持有实物金，汇率敞口完全对冲；作为组合尾部风险对冲工具。",
    min_invest: "¥10", fee: { mgmt: 0.30, custody: 0.08, sales: 0.00, total: "0.38%/年" }, dividend_policy: "不分红（价格收益）",
    manager: { name: "霍青庐", tenure_years: 10, aum: "¥141.2 亿（模拟）", style: "商品指数" },
    holdings: [
      { name: "黄金 ETF（实物支持）", weight: 88.5 }, { name: "黄金远期合约", weight: 7.2 },
      { name: "货币市场工具", weight: 4.3 },
    ],
    sectors: [{ name: "贵金属", weight: 100 }],
    regions: [{ name: "全球（美元计价）", weight: 100 }],
  },
  {
    slug: "healthcare-bio", name: "Suveoo 全球医疗健康混合", code: "SV-GHB9", risk_level: 4,
    inception: { y: 2015, m: 9 }, factors: { eq: 0.85, health: 1.0 }, alpha: -0.6, idio: 7.0, fwd_mu: 7.2, fwd_sigma: 16.5,
    benchmark: "全球医疗健康指数", asset_class: "股票·医疗健康",
    strategy: "覆盖创新药、医疗器械、医疗 IT 与医疗服务；超配 GLP-1 产业链与基因测序；单一持仓上限 6%。",
    min_invest: "¥1,000", fee: { mgmt: 0.80, custody: 0.12, sales: 0.15, total: "1.07%/年" }, dividend_policy: "红利再投",
    manager: { name: "闻人语", tenure_years: 9, aum: "¥59.3 亿（模拟）", style: "医疗成长" },
    holdings: [
      { name: "礼来", weight: 5.8 }, { name: "诺和诺德", weight: 5.4 }, { name: "联合健康", weight: 4.9 },
      { name: "强生", weight: 4.2 }, { name: "艾伯维", weight: 3.8 }, { name: "默沙东", weight: 3.5 },
      { name: "直观医疗", weight: 3.0 }, { name: "药明康德", weight: 2.6 },
    ],
    sectors: [{ name: "制药", weight: 48 }, { name: "医疗器械", weight: 20 }, { name: "医疗服务商", weight: 18 }, { name: "生物科技", weight: 14 }],
    regions: [{ name: "北美", weight: 66 }, { name: "欧洲", weight: 22 }, { name: "亚太", weight: 12 }],
  },
  {
    slug: "new-energy", name: "Suveoo 新能源产业精选", code: "SV-NEP10", risk_level: 4,
    inception: { y: 2019, m: 3 }, factors: { eq: 0.7, energy: 1.1 }, alpha: -0.6, idio: 10.0, fwd_mu: 7.8, fwd_sigma: 24.5,
    benchmark: "全球新能源产业指数", asset_class: "股票·新能源",
    strategy: "覆盖光伏、风电、储能、电动车产业链与电网设备；以装机量与单位盈利拐点为主要买卖依据；单一持仓上限 8%。",
    min_invest: "¥1,000", fee: { mgmt: 0.90, custody: 0.12, sales: 0.15, total: "1.17%/年" }, dividend_policy: "红利再投",
    manager: { name: "裴叙白", tenure_years: 6, aum: "¥44.8 亿（模拟）", style: "产业趋势" },
    holdings: [
      { name: "宁德时代", weight: 8.2 }, { name: "隆基绿能", weight: 6.4 }, { name: "比亚迪", weight: 6.1 },
      { name: "阳光电源", weight: 5.2 }, { name: "特斯拉（供应链敞口）", weight: 4.6 }, { name: "通威股份", weight: 4.2 },
      { name: "金风科技", weight: 3.6 }, { name: "Enercon（风电）", weight: 2.9 },
    ],
    sectors: [{ name: "光伏", weight: 32 }, { name: "电动车/储能", weight: 34 }, { name: "风电", weight: 20 }, { name: "电网设备", weight: 14 }],
    regions: [{ name: "中国内地", weight: 62 }, { name: "欧洲", weight: 20 }, { name: "北美", weight: 12 }, { name: "其他", weight: 6 }],
  },
  {
    slug: "apac-tech", name: "Suveoo 亚太科技创新混合", code: "SV-APT11", risk_level: 5,
    inception: { y: 2013, m: 9 }, factors: { apac: 0.8, tech: 1.2 }, alpha: 0.1, idio: 11.0, fwd_mu: 9.5, fwd_sigma: 23.5,
    benchmark: "亚太科技指数", asset_class: "股票·亚太科技",
    strategy: "聚焦亚太地区（A 股/港股/台股/韩股/日股）硬科技与互联网龙头：半导体、AI 应用、消费电子、云服务。",
    min_invest: "¥1,000", fee: { mgmt: 1.00, custody: 0.15, sales: 0.20, total: "1.35%/年" }, dividend_policy: "红利再投",
    manager: { name: "江疏影（同名纯属巧合）", tenure_years: 8, aum: "¥76.9 亿（模拟）", style: "科技成长" },
    holdings: [
      { name: "台积电", weight: 9.2 }, { name: "腾讯控股", weight: 8.4 }, { name: "三星电子", weight: 7.6 },
      { name: "阿里巴巴", weight: 6.8 }, { name: "SK 海力士", weight: 5.4 }, { name: "宁德时代", weight: 4.7 },
      { name: "软银集团", weight: 4.1 }, { name: "中芯国际", weight: 3.5 },
    ],
    sectors: [{ name: "半导体", weight: 38 }, { name: "互联网/云", weight: 32 }, { name: "消费电子", weight: 16 }, { name: "新能源科技", weight: 14 }],
    regions: [{ name: "中国（含港股）", weight: 44 }, { name: "台湾地区", weight: 22 }, { name: "韩国", weight: 20 }, { name: "日本", weight: 14 }],
  },
  {
    slug: "ai-semi", name: "Suveoo 全球半导体 AI 精选", code: "SV-AIS12", risk_level: 5,
    inception: { y: 2019, m: 9 }, factors: { eq: 0.6, semi: 1.15 }, alpha: 0.4, idio: 10.5, fwd_mu: 11.5, fwd_sigma: 29.0,
    benchmark: "全球半导体指数", asset_class: "股票·半导体/AI",
    strategy: "覆盖设计、制造、设备、材料、先进封装全产业链与 AI 算力基础设施；以资本开支周期与 HBM/先进制程份额为核心理由。",
    min_invest: "¥1,000", fee: { mgmt: 1.10, custody: 0.15, sales: 0.25, total: "1.50%/年" }, dividend_policy: "红利再投",
    manager: { name: "詹一诺", tenure_years: 5, aum: "¥38.5 亿（模拟）", style: "硬科技" },
    holdings: [
      { name: "英伟达", weight: 9.6 }, { name: "台积电", weight: 9.1 }, { name: "阿斯麦", weight: 7.4 },
      { name: "博通", weight: 6.2 }, { name: "AMD", weight: 5.5 }, { name: "SK 海力士", weight: 5.0 },
      { name: "应用材料", weight: 4.3 }, { name: "泛林半导体", weight: 3.8 },
    ],
    sectors: [{ name: "半导体设计", weight: 38 }, { name: "晶圆制造", weight: 26 }, { name: "设备与材料", weight: 24 }, { name: "AI 基础设施", weight: 12 }],
    regions: [{ name: "北美", weight: 56 }, { name: "台湾地区", weight: 20 }, { name: "韩国", weight: 12 }, { name: "欧洲", weight: 8 }, { name: "日本", weight: 4 }],
  },
];

/* ---------- 生成 ---------- */
mkdirSync(OUT, { recursive: true });
const summary = [];
for (const spec of FUNDS) {
  const rng = mulberry32(hashSeed(spec.slug));
  const { navs, bench, dates } = genSeries(spec, rng);
  const round4 = (arr) => arr.map((v) => +v.toFixed(4));
  const navR = round4(navs);
  const stats = statsFromSeries(navs);
  const n = navs.length;
  const ret = (k) => n > k ? +pct(navs[n - 1], navs[n - 1 - k]).toFixed(2) : null;
  const fund = {
    slug: spec.slug, name: spec.name, code: spec.code, risk_level: spec.risk_level,
    inception: `${spec.inception.y}-${String(spec.inception.m).padStart(2, "0")}-01`,
    nav: navR[n - 1],
    /* day_change = 当日涨跌：独立于月度序列的小幅日波动（±0.9% 内，随波动率缩放）——
     * 误用月度环比会令 /account、/home 的"今日收益"出现百分之几十的异常值 */
    day_change: +((rng() - 0.5) * 2 * Math.min(0.9, 0.15 + stats.ann_vol / 40)).toFixed(2),
    returns: { "1m": ret(1), "3m": ret(3), "6m": ret(6), "1y": ret(12), "3y": ret(36), "5y": ret(60), since: +pct(navs[n - 1], 1).toFixed(2) },
    asset_class: spec.asset_class, benchmark: spec.benchmark, strategy: spec.strategy,
    min_invest: spec.min_invest, fee: { ...spec.fee }, dividend_policy: spec.dividend_policy,
    manager: { ...spec.manager },
    stats,
    holdings: spec.holdings, sectors: spec.sectors, regions: spec.regions,
    nav_history: navR, nav_dates: dates,
    benchmark_history: round4(bench),
    projection: genProjection(spec, mulberry32(hashSeed(spec.slug + ":proj"))),
    notice: "理财有风险，投资须谨慎。这是模拟银行系统，历史数据由锚定真实市场行情的多因子模型生成，预测为蒙特卡洛模拟，均不构成投资建议。",
  };
  writeFileSync(join(OUT, `${spec.slug}.json`), JSON.stringify(fund, null, 1) + "\n");
  summary.push(`${spec.slug.padEnd(20)} R${spec.risk_level} ${spec.inception.y}-${String(spec.inception.m).padStart(2, "0")} 起 ${String(n - 1).padStart(3)} 月 | 年化 ${String(stats.ann_return).padStart(6)}% 波动 ${String(stats.ann_vol).padStart(5)}% 回撤 ${stats.max_drawdown}% | since ${fund.returns.since}%`);
}
function hashSeed(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
console.log(summary.join("\n"));
console.log(`\n✓ ${FUNDS.length} 只基金 JSON 已写入 ${OUT}`);
