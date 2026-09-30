import { describe, expect, it, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { executeIntent } from "../../worker-main.js";
/* 测试 R2 无生产产品数据：静态 import 仓库真实产品 JSON（vitest esbuild 内联——workerd 沙箱内 fs 路径不可用，
   funds-nav 测试同思路）播种方案产品池（基金角色池 + 存款阶梯档） */
import fundMoney from "../../../frontend/assets/data/funds/global-money-1.json";
import fundShortBond from "../../../frontend/assets/data/funds/global-short-bond.json";
import fundEsgBond from "../../../frontend/assets/data/funds/esg-bond.json";
import fundMixed1 from "../../../frontend/assets/data/funds/global-mixed-1.json";
import fundGold from "../../../frontend/assets/data/funds/gold-index.json";
import fundEquity from "../../../frontend/assets/data/funds/global-equity-index.json";
import fundAsemi from "../../../frontend/assets/data/funds/ai-semi.json";
import depDemand from "../../../frontend/assets/data/deposits/demand.json";
import dep3m from "../../../frontend/assets/data/deposits/term-3m.json";
import dep6m from "../../../frontend/assets/data/deposits/term-6m.json";
import dep1y from "../../../frontend/assets/data/deposits/term-1y.json";
import dep3y from "../../../frontend/assets/data/deposits/term-3y.json";

/** 第五期 idle 任务 5：对话即方案（动态产品拼装）全链。
 *  覆盖：GREEN 试算（确定性/守恒）→ 黄级两段式一键购买（持仓/守恒/审计/通知）
 *  + 拒绝路径（幻觉产品 / 分配合计不符 / PR 适当性 / AI 通道上限）+ 部分失败整体回退（补偿语义）。
 *  注册口令为运行期合成串（vitest 沙箱一次性注册、测试从不复登——源码不落任何环境真实凭据）。 */
const BASE = "https://suveoo.com";
let pwSeq = 0;
const newPassword = () => `pw-${Date.now().toString(36)}-${++pwSeq}`;

const urlOf = (path) => new URL(path, BASE).href;
async function post(path, body, token) {
  const url = urlOf(path);
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return SELF.fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  const text = mails.at(-1)?.text ?? "";
  const hit = text.match(/\b(\d{6})\b/);
  return hit ? hit[1] : null;
}
async function registerUser(email, riskAnswers) {
  await post("/api/auth/email-code", { scene: "register", email });
  return j(await post("/api/auth/register", { email, code: await lastCode(email), name: "方案用户", password: newPassword(), risk_answers: riskAnswers, aml_consented: true }));
}
const DO = (uid, payload) => {
  const doName = ["u", String(uid)].join(":");
  const bodyText = JSON.stringify(payload);
  const init = { method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" }, body: bodyText };
  return env.LEDGER.get(env.LEDGER.idFromName(doName)).fetch("https://do.internal/suveoo", init).then((r) => r.json());
};

/* 测试 R2 无生产产品数据：播种方案产品池（基金角色池 + 存款阶梯档） */
const POOL = [
  ["assets/data/funds/global-money-1.json", fundMoney],
  ["assets/data/funds/global-short-bond.json", fundShortBond],
  ["assets/data/funds/esg-bond.json", fundEsgBond],
  ["assets/data/funds/global-mixed-1.json", fundMixed1],
  ["assets/data/funds/gold-index.json", fundGold],
  ["assets/data/funds/global-equity-index.json", fundEquity],
  ["assets/data/funds/ai-semi.json", fundAsemi],
  ["assets/data/deposits/demand.json", depDemand],
  ["assets/data/deposits/term-3m.json", dep3m],
  ["assets/data/deposits/term-6m.json", dep6m],
  ["assets/data/deposits/term-1y.json", dep1y],
  ["assets/data/deposits/term-3y.json", dep3y],
];
async function seedProductPool() {
  await Promise.all(POOL.map(([key, json]) => env.ASSETS.put(key, JSON.stringify(json))));
}

describe("第五期：对话即方案（solution_preview / solution_package_purchase）", () => {
  beforeAll(async () => { await seedProductPool(); });
  const call = (H, name, args = {}) => {
    const url = urlOf("/mcp?sid=sol");
    return SELF.fetch(url, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) })
      .then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text));
  };

  it("① preview：确定性拼装、整数守恒、期限约束风险、真实产品", async () => {
    const me = await registerUser("sol1@test.dev", [3, 3, 3, 3, 3]);
    const H = { authorization: `Bearer ${me.token}` };
    const p1 = await call(H, "solution_preview", { amount: "100000.00", horizon_months: 6, risk_pref: "growth", purpose: "闲钱增值" });
    expect(p1.status).toBe("OK");
    const items = p1.solution.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    /* 整数守恒：分配合计 cent 级等于总额 */
    const sumCents = items.reduce((a, it) => a + BigInt(Math.round(parseFloat(it.amount) * 100)), 0n);
    expect(sumCents).toBe(10_000_000n);
    /* 期限 6 个月 → 风险上限 R2：不得出现 R3+ 产品（growth 自动回落） */
    for (const it of items) expect(it.risk_level).toBeLessThanOrEqual(2);
    /* 产品全部真实存在（存款六档或 16 基金 slug） */
    for (const it of items) expect(it.name != null && it.product_id != null).toBe(true);
    /* 长期限对照：36 个月 growth 允许 R4+ 进取层；两次同参调用结果一致（确定性） */
    const p2 = await call(H, "solution_preview", { amount: "100000.00", horizon_months: 36, risk_pref: "growth" });
    expect(Math.max(...p2.solution.items.map((i) => i.risk_level))).toBeGreaterThanOrEqual(4);
    const p3 = await call(H, "solution_preview", { amount: "100000.00", horizon_months: 6, risk_pref: "growth", purpose: "闲钱增值" });
    expect(JSON.stringify(p3.solution.items)).toBe(JSON.stringify(items));
    /* 应急场景：零风险资产（只存款+货币基金） */
    const pe = await call(H, "solution_preview", { amount: "50000.00", horizon_months: 6, risk_pref: "balanced", purpose: "应急备用金" });
    for (const it of pe.solution.items) expect(it.risk_level).toBeLessThanOrEqual(1);
  });

  it("② 一键购买（黄级两段式）：preview→purchase→确认→逐笔持仓+资金守恒+通知+审计", async () => {
    const me = await registerUser("sol2@test.dev", [4, 4, 4, 4, 4]);
    const H = { authorization: `Bearer ${me.token}` };
    const cards = (await DO(me.user_id, { op: "getCards" })).cards;
    const defCard = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const before = BigInt(defCard.balance_cents);

    const pv = await call(H, "solution_preview", { amount: "800.00", horizon_months: 6, risk_pref: "balanced" });
    expect(pv.status).toBe("OK");
    /* 黄级出卡（¥800 ≤ ¥1000 且当日零累计）：INPUT_REQUIRED + 确认卡（服务端核验明细） */
    const g1 = await call(H, "solution_package_purchase", { name: "半年闲钱组合", items: pv.solution.items.map((i) => ({ product_id: i.product_id, amount: i.amount })), total_amount: "800.00", horizon_months: 6 });
    expect(g1.status).toBe("INPUT_REQUIRED");
    expect(g1.grant.grant_hash).toBeTruthy(); /* /mcp 编程通道返回完整 grant（模型侧才只有前缀） */
    /* /mcp 编程通道拿完整 grant → 二段确认（黄级免 OTP） */
    const g2 = await call(H, "solution_package_purchase", { grant_hash: g1.grant.grant_hash, name: "半年闲钱组合", items: pv.solution.items.map((i) => ({ product_id: i.product_id, amount: i.amount })), total_amount: "800.00", horizon_months: 6 });
    expect(g2.status).toBe("EXECUTED");
    expect(g2.success_count).toBe(pv.solution.items.length);
    expect(g2.summary).toContain("半年闲钱组合");
    /* 资金守恒：默认卡扣减总额；每笔产品持仓增加对应金额 */
    const after = BigInt(((await DO(me.user_id, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1)).balance_cents);
    expect(before - after).toBe(80_000n);
    const holdings = (await DO(me.user_id, { op: "holdings" })).holdings;
    for (const it of pv.solution.items) {
      const h = holdings.find((x) => x.fund === it.product_id);
      expect(BigInt(h?.amount_cents ?? "0")).toBe(BigInt(Math.round(parseFloat(it.amount) * 100)));
    }
    /* 通知与审计 */
    const notifs = await DO(me.user_id, { op: "notifications" });
    const notifTxt = JSON.stringify(notifs.notifications ?? notifs.items ?? notifs);
    expect(notifTxt).toContain("组合方案已购入");
    const audit = (await DO(me.user_id, { op: "userAudit" })).audit;
    expect(audit.some((a) => a.action === "solution_package_purchase")).toBe(true);
  });

  it("③ 拒绝：幻觉产品（编造 product_id）在出卡前被拦", async () => {
    const me = await registerUser("sol3@test.dev", [3, 3, 3, 3, 3]);
    const H = { authorization: `Bearer ${me.token}` };
    const r = await call(H, "solution_package_purchase", { items: [{ product_id: "超导量子对冲基金", amount: "500.00" }, { product_id: "global-money-1", amount: "500.00" }], total_amount: "1000.00" });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("INVALID_PRODUCT");
    expect(r.message).toContain("不得编造");
    /* 无持仓、无资金变动 */
    const holdings = (await DO(me.user_id, { op: "holdings" })).holdings;
    expect(holdings).toHaveLength(0);
  });

  it("④ 拒绝：分配合计与总额不符（模型擅改金额）", async () => {
    const me = await registerUser("sol4@test.dev", [3, 3, 3, 3, 3]);
    const H = { authorization: `Bearer ${me.token}` };
    const r = await call(H, "solution_package_purchase", { items: [{ product_id: "global-money-1", amount: "300.00" }, { product_id: "term-3m", amount: "500.00" }], total_amount: "900.00" });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("INVALID_AMOUNT");
    expect(r.message).toContain("800.00"); /* 服务端复算的合计（300+500）如实入拒绝信息 */
  });

  it("⑤ 拒绝：PR 适当性（PR1 用户组合含 R2+ 基金 → 确认段 INVARIANT_PR_MISMATCH）", async () => {
    const me = await registerUser("sol5@test.dev", [1, 1, 1, 1, 1]); /* PR1 */
    const H = { authorization: `Bearer ${me.token}` };
    const args = { items: [{ product_id: "global-money-1", amount: "400.00" }, { product_id: "esg-bond", amount: "600.00" }], total_amount: "1000.00" };
    /* 首段照常出卡（INVARIANTS 在确认段运行）；确认段被 PR 适当性硬拦 */
    const g1 = await call(H, "solution_package_purchase", args);
    expect(g1.status).toBe("INPUT_REQUIRED");
    const r = await call(H, "solution_package_purchase", { ...args, grant_hash: g1.grant.grant_hash });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("INVARIANT_PR_MISMATCH");
    const holdings = (await DO(me.user_id, { op: "holdings" })).holdings;
    expect(holdings).toHaveLength(0);
  });

  it("⑥ 分级：>¥1000 升红（确认段 OTP_REQUIRED；大额组合由红级 OTP 把关——不设 AI ¥5k 上限，与底层单笔申购同口径）", async () => {
    const me = await registerUser("sol6@test.dev", [3, 3, 3, 3, 3]);
    const H = { authorization: `Bearer ${me.token}` };
    /* ¥2000：>¥1000 黄红阈值 → 红级：首段出红卡，确认段缺 OTP → OTP_REQUIRED */
    const args2 = { items: [{ product_id: "global-money-1", amount: "1000.00" }, { product_id: "term-3m", amount: "1000.00" }], total_amount: "2000.00" };
    const r2a = await call(H, "solution_package_purchase", args2);
    expect(r2a.status).toBe("INPUT_REQUIRED");
    const r2 = await call(H, "solution_package_purchase", { ...args2, grant_hash: r2a.grant.grant_hash });
    expect(r2.status).toBe("OTP_REQUIRED");
    expect(r2.grant.grant_prefix).toBeTruthy();
  });

  it("⑦ 部分失败：任一笔失败 → 已成交笔按成本回退、成败笔数明确、资金归位", async () => {
    const me = await registerUser("sol7@test.dev", [3, 3, 3, 3, 3]);
    const cards = (await DO(me.user_id, { op: "getCards" })).cards;
    const defCard = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const before = BigInt(defCard.balance_cents);
    /* 直调执行层构造部分失败：第一笔远超余额必败，第二笔 ¥50 定期成功后应被补偿赎回 */
    const ex = await executeIntent(env, {
      intent: "solution_package_purchase", user_id: me.user_id, trace_id: "bai_test_partial", nonce: "n-test-partial",
      channel: "form", steps: [{ op: "solution_package_purchase", params: {
        name: "部分失败测试", total_amount: "3000050.00",
        items: [
          { product_id: "global-money-1", amount: "3000000.00", nav: "1.00", risk_level: 1, kind: "fund", name: "环球货币基金 1" },
          { product_id: "term-3m", amount: "50.00", nav: "1.00", risk_level: 1, kind: "deposit", name: "3 个月定期" },
        ],
      }, dep: [] }],
    });
    expect(ex.ok).toBe(false);
    expect(ex.fail_count).toBe(1);
    expect(ex.refunded).toEqual(["term-3m"]);
    expect(ex.success_count).toBe(0);
    /* 资金归位：默认卡余额不变；持仓无残留 */
    const after = BigInt(((await DO(me.user_id, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1)).balance_cents);
    expect(after).toBe(before);
    const holdings = (await DO(me.user_id, { op: "holdings" })).holdings;
    expect(holdings.filter((h) => BigInt(h.amount_cents) > 0n)).toHaveLength(0);
  });
});
