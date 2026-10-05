import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第一百一十九轮：账单真自动缴费 + 本期重复缴费守卫。
 * 覆盖：普通账单二缴 409；due_scan 自动扣款（成功/余额不足/本期已缴跳过/credit-repay 排除/当日防重）。 */
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
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const mails = JSON.parse((await env.MAIL_OUTBOX.get("outbox:" + email)) ?? "[]");
  const code = (mails.at(-1)?.text ?? "").match(/\b\d{6}\b/)?.[0] ?? null;
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
const cardsOf = async (uid) => (await doOp("u:" + uid, { op: "getCards" })).cards;
const seedBill = (uid, bill) => doOp("u:" + uid, { op: "seedDemo", txs: [], payees: [], bills: [bill], subs: [], holdings: [], notifs: [], tasks: [] });

/** 与 dueReminders 同口径构造北京时区扫描入参 */
function scanInput() {
  const cn = new Date(Date.now() + 8 * 3600e3);
  const day = (d) => d.toISOString().slice(0, 10);
  const t = new Date(cn.getTime() + 864e5);
  const t2 = new Date(cn.getTime() + 2 * 864e5);
  return {
    date_key: day(cn), today: day(cn), tomorrow_day: t.getUTCDate(),
    day_after_tomorrow: day(t2),
    month_start: day(new Date(Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), 1))),
  };
}
const todayDay = () => Number(new Date(Date.now() + 8 * 3600e3).toISOString().slice(8, 10));

describe("账单缴费守卫与自动缴费", () => {
  it("普通账单本期二缴 → 409 ALREADY_PAID_THIS_PERIOD（REST 预检，不再出确认卡）", async () => {
    const a = await registerUser("bap1@test.dev", "守卫甲");
    const def = (await cardsOf(a.user_id)).find((c) => c.kind === "debit" && c.is_default);
    await seedBill(a.user_id, { id: "water", name: "水费", category: "生活服务", amount_cents: "3000", due_day: 15, autopay: 0 });
    const p1 = await j(await post("/api/bills/water/pay", {}, a.token));
    expect(p1.status).toBe("INPUT_REQUIRED");
    const p2 = await j(await post("/api/bills/water/pay", { grant_hash: p1.grant.grant_hash }, a.token));
    expect(p2.status).toBe("EXECUTED");
    expect((await cardsOf(a.user_id)).find((c) => c.slug === def.slug).balance_cents).toBe(String(BigInt(def.balance_cents) - 3000n));
    /* 同月二缴：409 结构化拒绝（连确认卡都不出） */
    const again = await post("/api/bills/water/pay", {}, a.token);
    expect(again.status).toBe(409);
    const aj = await j(again);
    expect(aj.reason).toBe("ALREADY_PAID_THIS_PERIOD");
    expect(aj.error.message).toContain("缴费");
    /* 卡余额未再扣 */
    expect((await cardsOf(a.user_id)).find((c) => c.slug === def.slug).balance_cents).toBe(String(BigInt(def.balance_cents) - 3000n));
  }, 30000);

  it("due_scan 自动缴费：到期+开关开 → 扣款/流水(channel=auto)/通知；当日二扫不双扣", async () => {
    const a = await registerUser("bap2@test.dev", "自动甲");
    const def = (await cardsOf(a.user_id)).find((c) => c.kind === "debit" && c.is_default);
    await seedBill(a.user_id, { id: "elec", name: "电费", category: "生活服务", amount_cents: "12800", due_day: todayDay(), autopay: 1 });
    const r1 = await doOp("u:" + a.user_id, { op: "due_scan", ...scanInput() });
    expect(r1.ok).toBe(true);
    const after = (await cardsOf(a.user_id)).find((c) => c.slug === def.slug);
    expect(after.balance_cents).toBe(String(BigInt(def.balance_cents) - 12800n));
    const bills = (await doOp("u:" + a.user_id, { op: "bills" })).bills;
    expect(bills.find((b) => b.id === "elec").last_paid_at).toBeTruthy();
    const txs = (await doOp("u:" + a.user_id, { op: "transfers", scope: "all" })).txs ?? [];
    const autoTx = txs.find((t) => t.counterparty === "电费");
    expect(autoTx?.channel).toBe("auto");
    expect(autoTx?.memo).toContain("自动缴费");
    const notifs = (await doOp("u:" + a.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => n.title === "自动缴费成功" && String(n.body).includes("电费"))).toBe(true);
    /* 当日二扫：autopay_done 防重 → 不双扣 */
    await doOp("u:" + a.user_id, { op: "due_scan", ...scanInput() });
    expect((await cardsOf(a.user_id)).find((c) => c.slug === def.slug).balance_cents).toBe(String(BigInt(def.balance_cents) - 12800n));
  }, 30000);

  it("due_scan 余额不足不动账+失败通知；手动缴费后自动跳过；credit-repay 排除", async () => {
    const a = await registerUser("bap3@test.dev", "自动乙");
    const cards = await cardsOf(a.user_id);
    const def = cards.find((c) => c.kind === "debit" && c.is_default);
    /* 超大账单（¥999,999,999）→ 默认借记卡必然余额不足 */
    await seedBill(a.user_id, { id: "gas", name: "燃气费", category: "生活服务", amount_cents: "99999999900", due_day: todayDay(), autopay: 1 });
    await doOp("u:" + a.user_id, { op: "due_scan", ...scanInput() });
    expect((await cardsOf(a.user_id)).find((c) => c.slug === def.slug).balance_cents).toBe(def.balance_cents);
    const notifs = (await doOp("u:" + a.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => n.title === "自动缴费失败" && String(n.body).includes("燃气费"))).toBe(true);
    expect((await doOp("u:" + a.user_id, { op: "bills" })).bills.find((b) => b.id === "gas").last_paid_at ?? "").toBe("");

    /* 手动缴费（¥99 黄级两段式）后，当日 due_scan 自动缴费跳过 → 不双扣、无成功通知 */
    const b = await registerUser("bap4@test.dev", "自动丙");
    const defB = (await cardsOf(b.user_id)).find((c) => c.kind === "debit" && c.is_default);
    await seedBill(b.user_id, { id: "net", name: "宽带费", category: "生活服务", amount_cents: "9900", due_day: todayDay(), autopay: 1 });
    const m1 = await j(await post("/api/bills/net/pay", {}, b.token));
    expect(m1.status).toBe("INPUT_REQUIRED");
    const m2 = await j(await post("/api/bills/net/pay", { grant_hash: m1.grant.grant_hash }, b.token));
    expect(m2.status).toBe("EXECUTED");
    const afterManual = (await cardsOf(b.user_id)).find((c) => c.slug === defB.slug).balance_cents;
    expect(afterManual).toBe(String(BigInt(defB.balance_cents) - 9900n));
    await doOp("u:" + b.user_id, { op: "due_scan", ...scanInput() });
    expect((await cardsOf(b.user_id)).find((c) => c.slug === defB.slug).balance_cents).toBe(afterManual);
    const notifsB = (await doOp("u:" + b.user_id, { op: "notifications" })).notifications ?? [];
    expect(notifsB.some((n) => n.title === "自动缴费成功")).toBe(false);

    /* credit-repay：动态欠款特例，即使 autopay=1 到期也不自动扣 */
    const c = await registerUser("bap5@test.dev", "自动丁");
    const defC = (await cardsOf(c.user_id)).find((c2) => c2.kind === "debit" && c2.is_default);
    await seedBill(c.user_id, { id: "credit-repay", name: "信用卡还款（全额）", category: "信用", amount_cents: "0", due_day: todayDay(), autopay: 1 });
    await doOp("u:" + c.user_id, { op: "due_scan", ...scanInput() });
    expect((await cardsOf(c.user_id)).find((x) => x.slug === defC.slug).balance_cents).toBe(defC.balance_cents);
  }, 30000);
});
