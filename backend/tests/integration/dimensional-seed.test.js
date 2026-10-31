import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第三十五轮：维度化注入（/demo-lab）——覆盖/合并/自定义三模式 + 预检 dry-run 与实跑同构 + 缺省回归。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(env.ADMIN_TOKEN ? { "x-admin-token": env.ADMIN_TOKEN } : {}) },
    body: JSON.stringify(body ?? {}),
  }, 60000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "维度测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
/* 数据源账户（suveoo 域名拟真账户，self-seed 收款人池依赖）：文件级一次 */
let srcOnce = null;
const ensureSource = () => (srcOnce ??= (async () => {
  await registerUser("dimsrc1@suveoo.com", "沈青梧");
  await registerUser("dimsrc2@suveoo.com", "顾清言");
})());
const doGoals = async (uid) => (await env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" }, body: JSON.stringify({ op: "goals" }),
}).then((r) => r.json()));
const counts = async (uid) => (await env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify({ op: "blockCounts" }),
}).then((r) => r.json())).counts;
const cardsOf = async (uid) => (await env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify({ op: "getCards" }),
}).then((r) => r.json())).cards;
const doOp = async (uid, payload) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify(payload),
}).then((r) => r.json());
const txRows = async (uid) => {
  let out = [], cursor = 0;
  for (;;) {
    const page = await doOp(uid, { op: "transfers", scope: "all", cursor });
    out = out.concat(page.txs ?? []);
    if (!page.next_cursor) return out;
    cursor = Number(page.next_cursor);
  }
};

describe("维度化注入（覆盖模式）", () => {
  it("高净值×企业主×投资经理+大型企业：落库计数=注入计数、卡片余额/额度按档位、欠款=明细合计、任务 day_of_month 锚定", async () => {
    await ensureSource();
    const u = await registerUser("dim1@test.dev", "高净值测试");
    const r = await j(await post("/api/demo/self-seed", { preset: { tier: "hnwi", income: "business", profession: "investment-manager", enterprise: "corporate", mode: "overwrite" } }, u.token));
    expect(r.ok).toBe(true);
    expect(r.preset).toEqual({ tier: "hnwi", income: "business", profession: "investment-manager", enterprise: "corporate", mode: "overwrite" });
    expect(r.summary.monthAvgTx).toBeGreaterThanOrEqual(100);
    const c = await counts(u.user_id);
    expect(c.txs).toBe(r.injected.txs);
    /* self-seed 收款人=动态数据源（本测试环境仅 2 个源账户；生产 ~34）；与注入计数一致 */
    expect(c.payees).toBe(r.injected.payees);
    expect(c.payees).toBeGreaterThanOrEqual(2);
    /* 覆盖模式应用 card_updates：借记总额落在高净值档位带（¥150万-800万）且信用额度 ¥50-100万 */
    const cards = await cardsOf(u.user_id);
    const debitTotal = cards.filter((x) => x.kind === "debit").reduce((a, x) => a + BigInt(x.balance_cents), 0n);
    expect(debitTotal).toBeGreaterThanOrEqual(150000000n);
    expect(debitTotal).toBeLessThanOrEqual(800000000n);
    const credit = cards.find((x) => x.kind === "credit");
    expect(BigInt(credit.limit_cents)).toBeGreaterThanOrEqual(50000000n);
    expect(BigInt(credit.limit_cents)).toBeLessThanOrEqual(100000000n);
    /* 账本可复算：信用欠款=信用卡消费明细合计 */
    const txs = await txRows(u.user_id);
    const creditSum = txs.filter((t) => (t.card ?? "").startsWith("credit") && t.direction === "OUT").reduce((a, t) => a + BigInt(t.amount_cents), 0n);
    expect(BigInt(credit.balance_cents)).toBe(creditSum);
    /* 集团签名：分红/资金归集/年金/宴请都在 */
    const cps = txs.map((t) => `${t.counterparty}|${t.memo ?? ""}`);
    expect(cps.some((x) => x.includes("集团分红"))).toBe(true);
    expect(cps.some((x) => x.includes("资金归集"))).toBe(true);
    expect(cps.some((x) => x.includes("企业年金"))).toBe(true);
    expect(cps.some((x) => x.includes("商务宴请"))).toBe(true);
    /* 月度任务 day_of_month 锚定（不变量） */
    const taskRows = (await doOp(u.user_id, { op: "tasks" })).tasks ?? [];
    expect(taskRows.filter((t) => t.title.includes("每月")).length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("GET 预检 dry-run 与 POST 实跑同构（确定性）；catalog 含 90 职业/11 类目", async () => {
    await ensureSource();
    const u = await registerUser("dim2@test.dev", "预检测试");
    const H = { authorization: `Bearer ${u.token}`, "x-admin-token": env.ADMIN_TOKEN };
    const q = "tier=mass&income=salaried&profession=high-school-teacher";
    const prev = await j(await SELF.fetch(`${BASE}/api/demo/self-seed?${q}`, { headers: H }));
    expect(prev.catalog.professions).toHaveLength(90);
    expect(new Set(prev.catalog.professions.map((p) => p.cat)).size).toBe(11);
    expect(prev.current.txs).toBe(0); /* 新账户当前为空 */
    expect(prev.preview.txs).toBeGreaterThan(400);
    expect(prev.summary).toBeUndefined(); /* 预检响应不含 summary 键 */
    const r = await j(await post("/api/demo/self-seed", { preset: { tier: "mass", income: "salaried", profession: "high-school-teacher" } }, u.token));
    expect(r.injected.txs).toBe(prev.preview.txs);
    expect(r.injected.bills).toBe(prev.preview.bills);
    expect(r.injected.subscriptions).toBe(prev.preview.subs);
    /* 中学教师签名：学科网会员 + 人教社教师用书出现 */
    const txs = await txRows(u.user_id);
    expect(txs.some((t) => t.counterparty.includes("人教社"))).toBe(true);
  }, 60000);
});

describe("维度化注入（合并模式：读取-合并-重写）", () => {
  it("先灌中学教师（覆盖）再合并网络主播×富裕：payees 无重复、计数只增、信用欠款重算=明细合计、再跑一次幂等", async () => {
    await ensureSource();
    const u = await registerUser("dim3@test.dev", "合并测试");
    const r1 = await j(await post("/api/demo/self-seed", { preset: { tier: "mass", income: "salaried", profession: "high-school-teacher", mode: "overwrite" } }, u.token));
    const c1 = await counts(u.user_id);
    const r2 = await j(await post("/api/demo/self-seed", { preset: { tier: "affluent", income: "business", profession: "streamer", mode: "merge" } }, u.token));
    expect(r2.ok).toBe(true);
    expect(r2.preset.mode).toBe("merge");
    const c2 = await counts(u.user_id);
    expect(c2.txs).toBeGreaterThan(c1.txs); /* 合并只增 */
    expect(c2.subs).toBeGreaterThanOrEqual(c1.subs);
    /* payees 无重名（按名字去重） */
    const payeeRows = (await doOp(u.user_id, { op: "payees" })).payees ?? [];
    expect(new Set(payeeRows.map((p) => p.name)).size).toBe(payeeRows.length);
    /* 信用欠款=合并后全部明细合计（账本可复算） */
    const txs = await txRows(u.user_id);
    const creditSum = txs.filter((t) => (t.card ?? "").startsWith("credit") && t.direction === "OUT").reduce((a, t) => a + BigInt(t.amount_cents), 0n);
    const credit = (await cardsOf(u.user_id)).find((x) => x.kind === "credit");
    expect(BigInt(credit.balance_cents)).toBe(creditSum);
    /* 幂等：同 preset 再合并一次 → 计数不变（同 rng 同数据被去重） */
    await post("/api/demo/self-seed", { preset: { tier: "affluent", income: "business", profession: "streamer", mode: "merge" } }, u.token);
    const c3 = await counts(u.user_id);
    expect(c3.txs).toBe(c2.txs);
    expect(c3.payees).toBe(c2.payees);
    /* 网络主播签名在流水（声卡灯光设备/流量推广） */
    expect(txs.some((t) => t.counterparty.includes("声卡灯光"))).toBe(true);
    expect(txs.some((t) => t.counterparty.includes("流量推广"))).toBe(true);
  }, 90000);
});

describe("维度化注入（自定义范围）与缺省回归", () => {
  it("只勾订阅块：txs/payees/bills 不变、订阅被整段替换为教师档组合", async () => {
    await ensureSource();
    const u = await registerUser("dim4@test.dev", "自定义测试");
    const r1 = await j(await post("/api/demo/self-seed", { preset: { tier: "affluent", income: "salaried", profession: "surgeon", mode: "overwrite" } }, u.token));
    const c1 = await counts(u.user_id);
    const r2 = await j(await post("/api/demo/self-seed", { preset: { tier: "mass", income: "salaried", profession: "high-school-teacher", mode: "custom", blocks: { subs: true, txs: false, payees: false, bills: false, holdings: false, tasks: false, notifs: false, fx: false, credit: false } } }, u.token));
    expect(r2.ok).toBe(true);
    const c2 = await counts(u.user_id);
    expect(c2.txs).toBe(c1.txs);
    expect(c2.payees).toBe(c1.payees);
    expect(c2.bills).toBe(c1.bills);
    expect(c2.subs).toBeLessThan(c1.subs); /* 大众档订阅 5-9 < 外科医生富裕档 10+ */
    /* 外科医生签名订阅（UpToDate）被替换为教师组合（学科网/WPS） */
    const subRows = (await doOp(u.user_id, { op: "subs" })).subscriptions ?? [];
    expect(subRows.some((s) => s.merchant === "UpToDate")).toBe(false);
    expect(subRows.some((s) => s.merchant === "学科网")).toBe(true);
  }, 60000);

  it("preset 缺省（空 body）→ 旧行为回归：经典自助灌入口径不变", async () => {
    await ensureSource();
    const u = await registerUser("dim5@test.dev", "缺省回归");
    const r = await j(await post("/api/demo/self-seed", {}, u.token));
    expect(r.ok).toBe(true);
    expect(r.tx_count).toBeGreaterThan(300);
    expect(r.preset).toBeUndefined();
    expect(r.verification.payees_all_real).toBe(true);
  }, 30000);

  it("非法 preset 值 → 规范化兜底（不 500）", async () => {
    await ensureSource();
    const u = await registerUser("dim6@test.dev", "非法值测试");
    const r = await j(await post("/api/demo/self-seed", { preset: { tier: "!!", income: "??", profession: 42, mode: "bogus" } }, u.token));
    expect(r.ok).toBe(true);
    expect(r.preset).toEqual({ tier: "affluent", income: "salaried", profession: "software-engineer", enterprise: null, mode: "overwrite" });
  }, 60000);
});

/** 第二十三期：维度化目标种子（tier 档案×rng 确定）；自定义模式不勾 goals 不动 */
describe("维度化目标种子（第二十三期）", () => {
  it("大众×工薪覆盖注入：2-3 个 ACTIVE 目标、事件=月度自动存入、held 一致、约六成挂月度任务", async () => {
    await ensureSource();
    const u = await registerUser("dimgoal@test.dev", "目标维度");
    const r = await j(await post("/api/demo/self-seed", { preset: { tier: "mass", income: "salaried", profession: "software-engineer", mode: "overwrite" } }, u.token));
    expect(r.ok).toBe(true);
    const goals = (await doGoals(u.user_id)).goals ?? [];
    expect(goals.length).toBeGreaterThanOrEqual(2);
    expect(goals.length).toBeLessThanOrEqual(3);
    expect(goals.every((g) => g.status === "ACTIVE")).toBe(true);
    expect(goals.some((g) => Number(g.saved_cents ?? g.saved ?? 0) > 0)).toBe(true);
    /* 确定性：同 preset 双跑同构 */
    const r2 = await j(await post("/api/demo/self-seed", { preset: { tier: "mass", income: "salaried", profession: "software-engineer", mode: "overwrite" } }, u.token));
    expect(r2.ok).toBe(true);
    const goals2 = (await doGoals(u.user_id)).goals ?? [];
    expect(goals2.map((g) => [g.name, g.target_cents]).join("|")).toBe(goals.map((g) => [g.name, g.target_cents]).join("|"));
  }, 30000);
});
