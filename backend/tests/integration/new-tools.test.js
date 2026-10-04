import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第十一期新工具全链：site_guide / notification_list / transfer_limit_query / bill_list / report_status（GREEN 只读）
 *  + subscription_reminder_toggle（YELLOW 出卡→确认→执行→审计） + deposit_open（RED OTP→确认→执行→持仓/审计）。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "新工具用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  return j(await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true }));
}
const DO = (uid, payload) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" }, body: JSON.stringify(payload),
}).then((r) => r.json());

describe("第十一期新工具", () => {
  it("GREEN×4：notification_list / transfer_limit_query / bill_list / report_status 只读且无副作用", async () => {
    const me = await registerUser("nt1@test.dev");
    const H = { authorization: `Bearer ${me.token}` };
    const call = (id, name, args = {}) => SELF.fetch(`${BASE}/mcp?sid=nt`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }).then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text));

    /* 灌底数据：一条通知 + 两个账单（一个自动扣款） */
    await DO(me.user_id, { op: "seedDemo",
      txs: [{ ts: new Date().toISOString(), amount_cents: "4200", direction: "OUT", counterparty: "便利店", memo: "", status: "SUCCESS", channel: "form", trace_id: null, category: "购物" }],
      payees: [], bills: [
        { id: "water", name: "水费", category: "生活服务", amount_cents: "28640", due_day: 5, autopay: 1 },
        { id: "credit-repay", name: "信用卡还款", category: "信用卡", amount_cents: "0", due_day: 10, autopay: 0 },
      ],
      subs: [], holdings: [], notifs: [{ type: "SYSTEM", title: "欢迎开户", body: "欢迎使用 Suveoo（模拟银行系统）。" }], tasks: [],
    });

    /* notification_list：返回通知与未读数；重复调用不产生副作用（未读数不变、无新通知） */
    const n1 = await call(1, "notification_list");
    expect(n1.notifications.length).toBeGreaterThanOrEqual(1);
    expect(n1.notifications[0].title).toBe("欢迎开户");
    expect(Number(n1.unread)).toBeGreaterThanOrEqual(1);
    const n2 = await call(2, "notification_list");
    expect(n2.notifications.length).toBe(n1.notifications.length);
    /* unread_only 过滤 */
    await DO(me.user_id, { op: "notifRead", ids: "all" });
    const n3 = await call(3, "notification_list", { unread_only: true });
    expect(n3.notifications).toHaveLength(0);

    /* transfer_limit_query：卡列表 + AI 通道硬上限 + 三色阈值 */
    const lim = await call(4, "transfer_limit_query");
    expect(lim.cards.length).toBeGreaterThanOrEqual(4);
    expect(lim.ai_channel.single).toBe("5000.00");
    expect(lim.form_channel.daily).toBe("100000.00");
    expect(lim.tiers.red).toContain("验证码强验证"); /* 第九十六轮：site_guide 红级描述由"邮箱 OTP"改为通道无关的"验证码（短信/邮箱）" */

    /* bill_list：水费金额 + autopay 态；credit-repay 金额=当前欠款（新户 0 → NO_DEBT 注记） */
    const bl = await call(5, "bill_list");
    const water = bl.bills.find((b) => b.bill_id === "water");
    expect(water.amount).toBe("286.40");
    expect(water.autopay).toBe(true);
    const cred = bl.bills.find((b) => b.bill_id === "credit-repay");
    expect(cred.amount).toBe("0.00");
    expect(cred.note).toContain("NO_DEBT");

    /* report_status：有流水月份列表 */
    const rep = await call(6, "report_status");
    expect(rep.months.length).toBeGreaterThanOrEqual(1);
    expect(rep.months[0]).toMatch(/^\d{4}-\d{2}$/);

    /* 无副作用终检：审计流无新增写记录（GREEN 不落 user_audit） */
    const audit = (await DO(me.user_id, { op: "userAudit" })).audit;
    expect(audit.some((a) => ["notification_list", "transfer_limit_query", "bill_list", "report_status"].includes(a.action))).toBe(false);
  }, 30000);

  it("site_guide（GREEN）：查询命中真实页面并给页面链接", async () => {
    const me = await registerUser("nt2@test.dev");
    const H = { authorization: `Bearer ${me.token}` };
    const call = (id, name, args = {}) => SELF.fetch(`${BASE}/mcp?sid=nt2`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }).then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text));
    const g = await call(1, "site_guide", { query: "转账记录导出" });
    expect(g.matches[0].route).toBe("/transfer/history");
    const ov = await call(2, "site_guide");
    expect(ov.total_pages).toBe(75);
  }, 30000);

  it("subscription_reminder_toggle（YELLOW）：不存在拒绝 → 真实订阅出卡 → 确认执行 → 状态翻转 + 审计", async () => {
    const me = await registerUser("nt3@test.dev");
    const H = { authorization: `Bearer ${me.token}` };
    const call = (id, name, args = {}) => SELF.fetch(`${BASE}/mcp?sid=nt3`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }).then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text));

    /* 不存在：前置拒绝不出卡 */
    const bad = await call(1, "subscription_reminder_toggle", { subscription_id: "nope", enabled: true });
    expect(bad.status).toBe("BLOCKED");
    expect(bad.reason).toBe("SUBSCRIPTION_NOT_FOUND");

    /* 灌一个 reminders=1 的订阅 → 关闭提醒 */
    await DO(me.user_id, { op: "seedDemo", txs: [], payees: [], bills: [], subs: [{ id: "netflix", merchant: "Netflix", plan: "标准", amount_cents: "6800", cycle: "月", usage_score: 60, dark_pattern_note: null, reminders: 1 }], holdings: [], notifs: [], tasks: [] });
    const y1 = await call(2, "subscription_reminder_toggle", { subscription_id: "netflix", enabled: false });
    expect(y1.status).toBe("INPUT_REQUIRED");
    expect(y1.tier ?? y1.card?.tier).toBe("YELLOW");
    const y2 = await call(3, y1.card.action, { ...y1.card.params, grant_hash: y1.card.grant_hash });
    expect(y2.status).toBe("EXECUTED");

    /* 状态翻转 + 审计可查 + 站内通知 */
    const subs = (await DO(me.user_id, { op: "subs" })).subscriptions;
    expect(Number(subs.find((s) => s.id === "netflix").reminders)).toBe(0);
    const audit = (await DO(me.user_id, { op: "userAudit" })).audit;
    expect(audit.some((a) => a.action === "subscription_reminder_toggle")).toBe(true);
    const notifs = (await DO(me.user_id, { op: "notifications", cursor: "0" })).notifications;
    expect(notifs.some((n) => n.title.includes("续费提醒已关闭"))).toBe(true);
  }, 30000);

  it("deposit_open（RED）：非法 slug/低于起存拒绝 → term-1y ¥50 OTP 全链 → 持仓 + 审计 + 通知", async () => {
    const me = await registerUser("nt4@test.dev");
    const H = { authorization: `Bearer ${me.token}` };
    const call = (id, name, args = {}) => SELF.fetch(`${BASE}/mcp?sid=nt4`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }).then((r) => r.json()).then((r) => JSON.parse(r.result.content[0].text));

    /* 前置拒绝：非存款 slug / 低于起存（term-1y 起存 ¥50） */
    const bad1 = await call(1, "deposit_open", { product_id: "global-mixed-1", amount: "100.00" });
    expect(bad1.status).toBe("BLOCKED");
    expect(bad1.reason).toBe("INVALID_PRODUCT");
    const bad2 = await call(2, "deposit_open", { product_id: "term-1y", amount: "10.00" });
    expect(bad2.status).toBe("BLOCKED");
    expect(bad2.reason).toBe("INVALID_AMOUNT");
    expect(bad2.message).toContain("起存");

    /* 红级全链：出卡 → redstep 发码 → OTP 确认 → EXECUTED */
    const r1 = await call(3, "deposit_open", { product_id: "term-1y", amount: "50.00" });
    expect(r1.status).toBe("INPUT_REQUIRED");
    expect(r1.card.tier).toBe("RED");
    await post("/api/auth/email-code", { scene: "redstep", email: "nt4@test.dev" });
    const otp = await lastCode("nt4@test.dev");
    const r2 = await call(4, r1.card.action, { ...r1.card.params, grant_hash: r1.card.grant_hash, otp });
    expect(r2.status).toBe("EXECUTED");

    /* 持仓出现 term-1y 本金 ¥50；审计与通知可查 */
    const holdings = (await DO(me.user_id, { op: "holdings" })).holdings;
    const dep = holdings.find((h) => h.fund === "term-1y");
    expect(dep).toBeTruthy();
    expect(dep.amount_cents).toBe("5000");
    const audit = (await DO(me.user_id, { op: "userAudit" })).audit;
    expect(audit.some((a) => a.action === "deposit_open")).toBe(true);
    const notifs = (await DO(me.user_id, { op: "notifications", cursor: "0" })).notifications;
    expect(notifs.some((n) => n.title.includes("存款开立成功"))).toBe(true);
  }, 30000);
});
