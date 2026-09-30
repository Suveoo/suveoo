import { describe, expect, it } from "vitest";
import {
  genDimensionalSeed, seededRng, normalizeSeedPreset, presetRngSeed,
  SEED_PROFESSIONS, SEED_PROFESSION_TABLE, SEED_PROFESSION_CATS,
  SEED_WEALTH_TIERS, SEED_INCOME_SHAPES, SEED_ENTERPRISE,
} from "../../worker-main.js";

/** 第三十五轮：维度化拟真种子——90 职业档案完整性 / 档位单调性 / 收入形状 / 确定性 / 量级带 / 不变量。 */
const gen = (p) => {
  const norm = normalizeSeedPreset(p);
  return genDimensionalSeed(seededRng(presetRngSeed(norm)), norm);
};
const sigOf = (s) => JSON.stringify(s.txs.map((t) => [t.counterparty, t.amount_cents, t.direction, t.card]));

describe("职业档案表（90）", () => {
  it("总量 90、类目 11、id 唯一、字段齐全（公司≥2/月薪带/发薪日∈{5,10,15}/签名商户≥2/订阅≥1/大额≥1/时段对）", () => {
    expect(SEED_PROFESSION_TABLE).toHaveLength(90);
    expect(SEED_PROFESSION_CATS).toHaveLength(11);
    expect(new Set(SEED_PROFESSION_TABLE.map((r) => r[0])).size).toBe(90);
    for (const p of Object.values(SEED_PROFESSIONS)) {
      expect(p.cos.length >= 2, p.id).toBe(true);
      expect(p.pay[0] < p.pay[1], p.id).toBe(true);
      expect([5, 10, 15].includes(p.payday), `${p.id} payday=${p.payday}`).toBe(true);
      expect(p.shops.length >= 2, p.id).toBe(true);
      expect(p.subs.length >= 1, p.id).toBe(true);
      expect(p.big.length >= 1, p.id).toBe(true);
      expect(p.hrs.length === 2, p.id).toBe(true);
    }
  });
  it("每职业签名数据点 ≥6；签名商户名跨职业不重复（专属）；订阅允许公共项（Keep/得到类）但去重后 ≥120", () => {
    const shopNames = new Map(), subNames = new Set();
    for (const p of Object.values(SEED_PROFESSIONS)) {
      const pts = p.cos.length + p.shops.length + p.subs.length + p.big.length;
      expect(pts, `${p.id} 签名点 ${pts}`).toBeGreaterThanOrEqual(6);
      for (const s of p.shops) { if (shopNames.has(s[0])) throw new Error(`签名商户重复：${s[0]}（${shopNames.get(s[0])} / ${p.id}）`); shopNames.set(s[0], p.id); }
      for (const s of p.subs) subNames.add(s[0]);
    }
    expect(shopNames.size).toBeGreaterThanOrEqual(250);
    expect(subNames.size).toBeGreaterThanOrEqual(120);
  });
  it("任务书列举职业全量在册（抽样 20 个关键职业逐个点名）", () => {
    for (const id of ["product-manager", "software-engineer", "hrbp", "actuary", "lawyer", "university-professor", "high-school-teacher", "college-student", "surgeon", "nurse", "firefighter", "judge", "streamer", "pilot", "barista", "head-chef", "real-estate-agent", "pro-gamer", "architect", "admin-manager"]) {
      expect(SEED_PROFESSIONS[id], id).toBeTruthy();
    }
  });
});

describe("档位与目录", () => {
  it("三档缩放单调：总资产（借记+持仓）hnwi > affluent > mass；信用额度同序", () => {
    const wealth = (s) => Number(s.summary.debit_total_cents) + s.summary.holdings_cost_cents;
    const m = gen({ tier: "mass", income: "salaried", profession: "software-engineer" });
    const a = gen({ tier: "affluent", income: "salaried", profession: "software-engineer" });
    const h = gen({ tier: "hnwi", income: "salaried", profession: "software-engineer" });
    expect(wealth(h)).toBeGreaterThan(wealth(a));
    expect(wealth(a)).toBeGreaterThan(wealth(m));
    expect(Number(h.summary.credit_limit_cents)).toBeGreaterThan(Number(a.summary.credit_limit_cents));
    expect(Number(a.summary.credit_limit_cents)).toBeGreaterThan(Number(m.summary.credit_limit_cents));
    /* 档位谱系：大众持仓仅 R1 货基/短债；高净值含 R5（ai-semi）与全谱系 */
    expect(m.holdings.every((x) => ["global-money-1", "global-short-bond"].includes(x.fund))).toBe(true);
    expect(h.holdings.map((x) => x.fund)).toContain("ai-semi");
  });
  it("目录枚举与 normalizeSeedPreset 兜底（非法值回默认富裕×工薪×软件工程师）", () => {
    expect(Object.keys(SEED_WEALTH_TIERS).sort()).toEqual(["affluent", "hnwi", "mass"]);
    expect(Object.keys(SEED_INCOME_SHAPES).sort()).toEqual(["business", "investor", "salaried"]);
    expect(Object.keys(SEED_ENTERPRISE).sort()).toEqual(["corporate", "institution", "micro", "sme"]);
    const n = normalizeSeedPreset({ tier: "bogus", income: "bogus", profession: "bogus", enterprise: "bogus", mode: "bogus" });
    expect(n).toEqual({ tier: "affluent", income: "salaried", profession: "software-engineer", enterprise: null, mode: "overwrite", blocks: { txs: true, payees: true, bills: true, subs: true, holdings: true, tasks: true, notifs: true, fx: true, credit: true } });
  });
});

describe("收入形状", () => {
  it("工薪：12 笔同名公司月薪（发薪日=职业 payday）+ 12 月年终奖", () => {
    const s = gen({ tier: "affluent", income: "salaried", profession: "surgeon" });
    const prof = SEED_PROFESSIONS.surgeon;
    const co = s.txs.filter((t) => t.direction === "IN" && t.memo === "工资入账（税后）");
    expect(co).toHaveLength(12);
    expect(new Set(co.map((t) => t.counterparty)).size).toBe(1);
    expect(prof.cos).toContain(co[0].counterparty);
    const days = new Set(co.map((t) => new Date(t.ts).getUTCDate()));
    expect([...days].every((d) => Math.abs(d - prof.payday) <= 1)).toBe(true);
    expect(s.txs.some((t) => t.memo === "年终奖（绩效）")).toBe(true);
  });
  it("企业主：无固定月薪（单一对手方年入账笔数<35，无 12 笔同日月薪形状）、有季度分红与税费/社保支出", () => {
    const s = gen({ tier: "affluent", income: "business", profession: "barista" });
    const byCp = new Map();
    for (const t of s.txs) if (t.direction === "IN") byCp.set(t.counterparty, (byCp.get(t.counterparty) ?? 0) + 1);
    const maxSame = Math.max(...[...byCp.values()]);
    expect(maxSame).toBeLessThan(35); /* 无月度固定 12 笔同源同日月薪形状 */
    expect(s.txs.some((t) => t.memo === "季度分红（股东）")).toBe(true);
    expect(s.txs.some((t) => t.counterparty.includes("税务"))).toBe(true);
    expect(s.txs.some((t) => t.counterparty.includes("社保局"))).toBe(true);
  });
  it("投资人：限制性股票解禁 + 季度投资收益 + 董事/咨询费", () => {
    const s = gen({ tier: "hnwi", income: "investor", profession: "investment-manager" });
    expect(s.txs.some((t) => t.memo === "限制性股票解禁（RSU 归属）")).toBe(true);
    expect(s.txs.filter((t) => ["季度分红派息", "基金赎回到账", "私募季度分配"].includes(t.memo)).length).toBeGreaterThanOrEqual(4);
    expect(s.txs.some((t) => ["独立董事津贴", "专家咨询费", "顾问费"].includes(t.memo))).toBe(true);
  });
});

describe("量级带与企业档", () => {
  it("12 个月流水落带：大众 40-80/月、富裕 60-120/月、高净值 100-200/月（企业档附加容许 +60%）", () => {
    const m = gen({ tier: "mass", income: "salaried", profession: "nurse" });
    const a = gen({ tier: "affluent", income: "salaried", profession: "software-engineer" });
    const h = gen({ tier: "hnwi", income: "salaried", profession: "investment-manager" });
    expect(m.summary.monthAvgTx).toBeGreaterThanOrEqual(40);
    expect(m.summary.monthAvgTx).toBeLessThanOrEqual(80);
    expect(a.summary.monthAvgTx).toBeGreaterThanOrEqual(60);
    expect(a.summary.monthAvgTx).toBeLessThanOrEqual(120);
    expect(h.summary.monthAvgTx).toBeGreaterThanOrEqual(100);
    expect(h.summary.monthAvgTx).toBeLessThanOrEqual(200);
    for (const ent of ["micro", "sme", "corporate", "institution"]) {
      const s = gen({ tier: "affluent", income: "business", profession: "hairstylist", enterprise: ent });
      expect(s.summary.monthAvgTx).toBeLessThanOrEqual(192); /* 120×1.6 */
    }
  });
  it("企业档各 ≥15 个签名对手方/账单项（含订阅商户）；小微企业有工资发放多人多笔", () => {
    for (const [ent, cfg] of Object.entries(SEED_ENTERPRISE)) {
      const s = gen({ tier: "affluent", income: "business", profession: "tax-advisor", enterprise: ent });
      const names = new Set([...s.txs.map((t) => t.counterparty), ...s.bills.map((b) => b.name), ...s.subs.map((x) => x.merchant)]);
      const sig = [...(cfg.clients ?? []), ...(cfg.suppliers ?? []), ...(cfg.employees ?? []), ...cfg.subs.map((x) => x[0]), ...cfg.bills.map((x) => x[0]), ...(cfg.taxes ?? []).map((x) => x[0])].filter(Boolean);
      const hit = sig.filter((x) => [...names].some((n) => n === x || n.includes(String(x).slice(0, 5)) || String(x).includes(n)));
      expect(hit.length, `${ent} 命中 ${hit.length}`).toBeGreaterThanOrEqual(15);
    }
    const micro = gen({ tier: "affluent", income: "business", profession: "barista", enterprise: "micro" });
    const wages = micro.txs.filter((t) => (t.memo ?? "").startsWith("工资发放-"));
    expect(new Set(wages.map((t) => t.counterparty)).size).toBeGreaterThanOrEqual(3);
    const sme = gen({ tier: "affluent", income: "business", profession: "hrbp", enterprise: "sme" });
    expect(sme.txs.some((t) => (t.memo ?? "").includes("代发工资·批次"))).toBe(true);
    expect(sme.txs.some((t) => t.memo === "增值税申报扣款")).toBe(true);
  });
  it("职业签名层落在流水：签名商户出现 + 大额项出现（量级×档位系数）", () => {
    const s = gen({ tier: "affluent", income: "salaried", profession: "surgeon" });
    const names = new Set(s.txs.map((t) => t.counterparty));
    for (const shop of SEED_PROFESSIONS.surgeon.shops) expect(names.has(shop[0]), shop[0]).toBe(true);
    const bigNames = s.txs.filter((t) => Number(t.amount_cents) > 1000000).map((t) => t.counterparty);
    expect(SEED_PROFESSIONS.surgeon.big.some((b) => bigNames.includes(b[0]))).toBe(true);
    const subs = new Set(s.subs.map((x) => x.merchant));
    expect(subs.has("UpToDate")).toBe(true);
  });
});

describe("确定性与不变量", () => {
  it("同 preset 双跑同构（对手方/金额/方向/卡序一致）；mode/blocks 不改变数据形状", () => {
    const p = { tier: "hnwi", income: "business", profession: "streamer", enterprise: "sme" };
    expect(sigOf(gen(p))).toBe(sigOf(gen(p)));
    expect(sigOf(gen({ ...p, mode: "merge" }))).toBe(sigOf(gen(p)));
    expect(sigOf(gen({ ...p, mode: "custom", blocks: { subs: true } }))).toBe(sigOf(gen(p)));
  });
  it("信用卡欠款=消费明细合计（账本可复算）且 ≤ 额度 80%；收款人手机号 ^1\\d{10}$ 全覆盖", () => {
    for (const tier of ["mass", "affluent", "hnwi"]) {
      const s = gen({ tier, income: "salaried", profession: "software-engineer" });
      const sum = s.txs.filter((t) => t.card === "credit-card-1" && t.direction === "OUT").reduce((a, t) => a + Number(t.amount_cents), 0);
      expect(s.credit_debt_cents, tier).toBe(String(sum));
      expect(sum, tier).toBeLessThanOrEqual(Math.floor(Number(s.summary.credit_limit_cents) * 0.8) + 1);
      expect(s.payees.every((p) => /^1\d{10}$/.test(p.phone ?? ""))).toBe(true);
    }
  });
  it("卡片计划：4 张借记余额=档位总额（全正）；月度任务 day_of_month 锚定；高净值外币 3-5 种", () => {
    const s = gen({ tier: "hnwi", income: "salaried", profession: "pilot" });
    const debit = s.card_updates.filter((c) => c.slug.startsWith("debit-"));
    expect(debit).toHaveLength(4);
    expect(debit.every((c) => BigInt(c.balance_cents) > 0n)).toBe(true);
    expect(debit.reduce((a, c) => a + BigInt(c.balance_cents), 0n)).toBe(BigInt(s.summary.debit_total_cents));
    expect(s.tasks.filter((t) => t.title.includes("每月")).every((t) => Number.isInteger(t.day_of_month))).toBe(true);
    expect(s.fx_balances.length).toBeGreaterThanOrEqual(3);
    expect(s.fx_balances.length).toBeLessThanOrEqual(5);
  });
});
