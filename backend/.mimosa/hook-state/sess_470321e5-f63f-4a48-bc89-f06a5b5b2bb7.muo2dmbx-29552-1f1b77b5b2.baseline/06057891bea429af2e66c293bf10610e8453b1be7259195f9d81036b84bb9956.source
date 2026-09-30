import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF } from "cloudflare:test";

/** dashboard 扩展字段：by_category_month（本月/上月分类收支）与 income_recent（近 60 天入账方聚合）。
 *  供交易记录页"结果优先"环比可视化与前端确定性洞察规则（月薪→定投等）共用；既有字段不受影响。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await (await import("cloudflare:test")).env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("dashboard 扩展字段（by_category_month / income_recent）", () => {
  it("转账后：本月分类含该笔 OUT/income_recent 含对方 IN；字段形状与月口径正确", async () => {
    const a = await registerUser("dashext1@test.dev", "看板甲");
    const b = await registerUser("dashext2@test.dev", "看板乙");
    const { env } = await import("cloudflare:test");
    const bCards = (await env.LEDGER.get(env.LEDGER.idFromName(`u:${b.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "getCards" }),
    }).then((r) => r.json())).cards;
    const bDebit = bCards.find((c) => c.kind === "debit");

    const body = { recipient_account: bDebit.number, recipient_name: "看板乙", amount: "45.67", memo: "看板样本" };
    let r = await j(await post("/api/transfers/intrabank", body, a.token));
    if (r.status === "INPUT_REQUIRED") r = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: r.grant.grant_hash }, a.token));
    expect(r.status).toBe("EXECUTED");

    const dashA = await j(await SELF.fetch(`${BASE}/api/dashboard`, { headers: { authorization: `Bearer ${a.token}` } }));
    /* 既有字段原样保留 */
    expect(Array.isArray(dashA.by_category)).toBe(true);
    expect(Array.isArray(dashA.monthly)).toBe(true);
    /* 新字段：本月（UTC）OUT 分类含该笔转账 */
    const thisM = new Date().toISOString().slice(0, 7);
    const lastM = new Date(Date.now() - 26 * 86400000).toISOString().slice(0, 7);
    expect(Array.isArray(dashA.by_category_month)).toBe(true);
    const outThisM = dashA.by_category_month.filter((x) => x.m === thisM && x.direction === "OUT");
    expect(outThisM.length).toBeGreaterThan(0);
    /* 与 monthly 同口径：total 为原始分值（整数），前端换算 */
    expect(outThisM.some((x) => x.category === "转账" && Number(x.total) === 4567)).toBe(true);
    expect(dashA.by_category_month.every((x) => x.m === thisM || x.m === lastM)).toBe(true);
    /* 新字段：收款方近 60 天入账聚合含转出方，金额一致 */
    const dashB = await j(await SELF.fetch(`${BASE}/api/dashboard`, { headers: { authorization: `Bearer ${b.token}` } }));
    expect(Array.isArray(dashB.income_recent)).toBe(true);
    const fromA = dashB.income_recent.find((x) => (x.counterparty ?? "").includes("看板甲"));
    expect(fromA).toBeTruthy();
    expect(Number(fromA.total)).toBe(45.67);
    expect(fromA.count).toBeGreaterThanOrEqual(1);
  });
});

/* 第四十轮：/api/home/bundle —— 主页五查询一次往返聚合（第七期 idle 增 proposals 徽标键，仍单往返） */
describe("home bundle", () => {
  it("鉴权后返回 overview/dashboard/subscriptions/bills/insight/proposals 六键，overview 与独立端点同口径", async () => {
    const reg = await j(await post("/api/auth/email-code", { scene: "register", email: "hb1@test.dev" }));
    const out = await j(await post("/api/auth/register", { email: "hb1@test.dev", code: await lastCode("hb1@test.dev"), name: "聚合甲", password: TEST_PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true }));
    const H = { authorization: `Bearer ${out.token}` };
    const b = await j(await SELF.fetch(BASE + "/api/home/bundle", { headers: H }));
    expect(b.ok).toBe(true);
    for (const k of ["overview", "dashboard", "subscriptions", "bills", "insight", "proposals"]) expect(b[k]).toBeTruthy();
    /* proposals 徽标键（第七期）：只读形状齐全（新账户 pending=0 亦返回结构与 report），且可带 since */
    expect(typeof b.proposals.fresh).toBe("number");
    expect(typeof b.proposals.pending).toBe("number");
    expect(b.proposals.report.month).toBeTruthy();
    const b2 = await j(await SELF.fetch(BASE + "/api/home/bundle?since=2999-01-01T00:00:00.000Z", { headers: H }));
    expect(typeof b2.proposals.fresh).toBe("number");
    const solo = await j(await SELF.fetch(BASE + "/api/overview", { headers: H }));
    expect(String(b.overview.total_assets)).toBe(String(solo.total_assets));
    const anon = await SELF.fetch(BASE + "/api/home/bundle");
    expect(anon.status).toBe(401);
  });
});
