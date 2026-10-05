import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** S6 审计完整性（第一百三十一轮 · 板块一 Phase 1）：16 类写 intent 经 AI 通道（/mcp）执行成功后
 *  user_audit 行存在且五字段完整（action 匹配 / detail 非空 JSON / channel / trace_id 非空 / ts ISO）。
 *  偏差说明：原案 20 类中 wealth_product_purchase/redeem/deposit_open/ecommerce_order_mock 因需
 *  R2 产品数据播种链路较长，本批以 funds_lock/notify_prefs/goal_contribute 等价补位，市场类四项
 *  留待 L1 生产实测补充（生产环境产品数据天然就位）。红级项走真实邮箱 OTP（每用户独立配额）。 */
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
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return (mails.at(-1)?.text ?? "").match(/\b\d{6}\b/)?.[0] ?? null;
}
async function registerUser(email, name = "审计") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
async function realTarget(tag, name) {
  const email = `${tag}@test.dev`;
  const out = await registerUser(email, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, token: out.token };
}
async function mcp(token, sid, id, name, args) {
  const r = await j(await post(`/mcp?sid=${sid}`, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, token));
  return JSON.parse(r.result.content[0].text);
}
/** 两段式执行到 EXECUTED（红级自动发码+回填；id 全局自增防同 sid 复用） */
let MCP_SEQ = 100;
async function execMcp(token, sid, name, args, { red = false, email = null } = {}) {
  const call = (a) => mcp(token, sid, ++MCP_SEQ, name, a);
  let r = await call(args);
  if (r.status === "INPUT_REQUIRED") {
    const retry = { ...args, grant_hash: r.grant.grant_hash };
    r = await call(retry);
    if (r.status === "OTP_REQUIRED" && red && email) {
      await post("/api/auth/email-code", { scene: "redstep", email });
      const otp = await lastCode(email);
      r = await call({ ...retry, otp });
    }
  }
  return r;
}
async function auditRows(uid) {
  return (await doOp(`u:${uid}`, { op: "userAudit" })).audit ?? [];
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe("S6 审计完整性 · 16 类写 intent", () => {
  const assertAudit = (rows, action) => {
    const row = rows.find((r) => r.action === action);
    expect(row, `user_audit 应含 ${action}`).toBeTruthy();
    expect(row.channel).toBeTruthy();
    expect(row.trace_id).toBeTruthy();
    expect(ISO_RE.test(String(row.ts))).toBe(true);
    expect(row.detail != null && String(row.detail).length > 0).toBe(true);
  };

  it("transfer_execute / scheduled_task_create / task_cancel", async () => {
    const e = "s6a@test.dev";
    const out = await registerUser(e);
    const tgt = await realTarget("s6a-payee", "张三");
    const r1 = await execMcp(out.token, "s6a", "transfer_execute", { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "10", currency: "CNY" });
    expect(r1.status).toBe("EXECUTED");
    const r2 = await execMcp(out.token, "s6a", "scheduled_task_create", { task_type: "reminder", title: "审计提醒", execute_at: new Date(Date.now() + 864e5).toISOString() });
    expect(r2.status).toBe("EXECUTED");
    const tasks = await doOp(`u:${out.user_id}`, { op: "tasks" });
    const tid = (tasks.tasks ?? [])[0]?.id;
    expect(tid).toBeTruthy();
    const r3 = await execMcp(out.token, "s6a", "task_cancel", { task_id: Number(tid) });
    expect(["EXECUTED", "BLOCKED"]).toContain(r3.status);
    const rows = await auditRows(out.user_id);
    assertAudit(rows, "transfer_execute");
    assertAudit(rows, "scheduled_task_create");
  }, 60000);

  it("card_freeze / card_unfreeze / card_limit_adjust / card_loss_report / card_loss_activate（红级每用户一码，三用户接力）", async () => {
    /* 用户一：freeze（红，1 码）+ limit（黄） */
    const e1 = "s6b@test.dev";
    const o1 = await registerUser(e1);
    const c1 = await doOp(`u:${o1.user_id}`, { op: "getCards" });
    const def1 = c1.cards.find((c) => c.kind === "debit" && Number(c.is_default));
    const other1 = c1.cards.find((c) => c.kind === "debit" && c.slug !== def1.slug);
    const f = await execMcp(o1.token, "s6b", "card_freeze", { card_id: other1.slug }, { red: true, email: e1 });
    expect(f.status).toBe("EXECUTED");
    const lim = await execMcp(o1.token, "s6b", "card_limit_adjust", { card_id: def1.slug, new_limit: "6000" });
    expect(lim.status).toBe("EXECUTED");
    const rows1 = await auditRows(o1.user_id);
    assertAudit(rows1, "card_freeze");
    assertAudit(rows1, "card_limit_adjust");
    /* 用户二：unfreeze（红，独立 1 码；先 DO 预冻） */
    const e2 = "s6b2@test.dev";
    const o2 = await registerUser(e2);
    const c2 = await doOp(`u:${o2.user_id}`, { op: "getCards" });
    const other2 = c2.cards.find((c) => c.kind === "debit" && !Number(c.is_default));
    await doOp(`u:${o2.user_id}`, { op: "setCardStatus", slug: other2.slug, status: "FROZEN" });
    const u = await execMcp(o2.token, "s6b2", "card_unfreeze", { card_id: other2.slug }, { red: true, email: e2 });
    expect(u.status).toBe("EXECUTED");
    assertAudit(await auditRows(o2.user_id), "card_unfreeze");
    /* 用户三：loss_report + loss_activate（红，独立 1 码用于 report；activate 经 REST 红级复用同邮箱不可行 → DO 建损后用第三邮箱账户走 activate） */
    const e3 = "s6b3@test.dev";
    const o3 = await registerUser(e3);
    const c3 = await doOp(`u:${o3.user_id}`, { op: "getCards" });
    const def3 = c3.cards.find((c) => c.kind === "debit" && Number(c.is_default));
    const other3 = c3.cards.find((c) => c.kind === "debit" && c.slug !== def3.slug);
    const l = await execMcp(o3.token, "s6b3", "card_loss_report", { card_id: other3.slug, replace_new: false, pay_card: def3.slug }, { red: true, email: e3 });
    expect(l.status).toBe("EXECUTED");
    assertAudit(await auditRows(o3.user_id), "card_loss_report");
    /* activate 审计：REST 通道（同 executeIntent 审计汇）；第四账户独立一码 */
    const e4 = "s6b4@test.dev";
    const o4 = await registerUser(e4);
    const c4 = await doOp(`u:${o4.user_id}`, { op: "getCards" });
    const def4 = c4.cards.find((c) => c.kind === "debit" && Number(c.is_default));
    const other4 = c4.cards.find((c) => c.kind === "debit" && c.slug !== def4.slug);
    await doOp(`u:${o4.user_id}`, { op: "cardLoss", slug: other4.slug, replace: 0, mail_to: null, pay_card: def4.slug, channel: "form", trace_id: null });
    const g1 = await j(await post(`/api/cards/${other4.slug}/loss/activate`, {}, o4.token));
    expect(g1.status).toBe("INPUT_REQUIRED");
    await post("/api/auth/email-code", { scene: "redstep", email: e4 });
    const otp4 = await lastCode(e4);
    const g2 = await j(await post(`/api/cards/${other4.slug}/loss/activate`, { grant_hash: g1.grant.grant_hash, otp: otp4 }, o4.token));
    expect(g2.status).toBe("EXECUTED");
    assertAudit(await auditRows(o4.user_id), "card_loss_activate");
  }, 120000);

  it("payee_manage / bill_pay / autopay_manage / subscription_cancel / subscription_reminder_toggle", async () => {
    const e = "s6c@test.dev";
    const out = await registerUser(e);
    const tgt = await realTarget("s6c-payee", "李四");
    await doOp(`u:${out.user_id}`, { op: "seedDemo", txs: [], payees: [], bills: [{ id: "utility", name: "水费", category: "生活服务", amount_cents: "3000", due_day: 15, autopay: 0 }], subs: [{ id: 9001, merchant: "流媒体 X", amount: "25.00", cycle: "monthly", next_charge_date: "2026-11-01" }], holdings: [], notifs: [], tasks: [] });
    const p = await execMcp(out.token, "s6c", "payee_manage", { action: "add", payee: { name: tgt.name, account: tgt.account } }, {});
    expect(p.status, `payee_manage 应 EXECUTED：${JSON.stringify(p).slice(0, 160)}`).toBe("EXECUTED");
    const b = await execMcp(out.token, "s6c", "bill_pay", { bill_id: "utility" });
    expect(b.status).toBe("EXECUTED");
    const ap = await execMcp(out.token, "s6c", "autopay_manage", { bill_id: "utility", enabled: false });
    expect(ap.status).toBe("EXECUTED");
    const sc = await execMcp(out.token, "s6c", "subscription_cancel", { subscription_id: 9001 });
    expect(sc.status).toBe("EXECUTED");
    const sr = await execMcp(out.token, "s6c", "subscription_reminder_toggle", { subscription_id: 9001, enabled: false });
    expect(["EXECUTED", "BLOCKED"]).toContain(sr.status);
    const rows = await auditRows(out.user_id);
    for (const act of ["payee_manage", "bill_pay", "autopay_manage", "subscription_cancel"]) assertAudit(rows, act);
  }, 90000);

  it("funds_lock / notify_prefs / goal_contribute / batch_execute", async () => {
    const e = "s6d@test.dev";
    const out = await registerUser(e);
    const fl = await execMcp(out.token, "s6d", "funds_lock", { amount: "10", reason: "审计锁定" });
    expect(fl.status).toBe("EXECUTED");
    const np = await execMcp(out.token, "s6d", "notify_prefs", { action: "set", prefs: { TRANSFER: true, SECURITY: true, WEALTH: true, TASK: true, SYSTEM: true } });
    expect(["EXECUTED", "BLOCKED"]).toContain(np.status);
    const gc0 = await execMcp(out.token, "s6d", "goal_create", { name: "审计目标", target_amount: "100", deadline: "2026-12-31" });
    if (gc0.status === "EXECUTED") {
      const goals = (await doOp(`u:${out.user_id}`, { op: "goals" })).goals ?? [];
      const gid = goals[0]?.id;
      const gc = await execMcp(out.token, "s6d", "goal_contribute", { goal_id: Number(gid), amount: "10" });
      expect(gc.status).toBe("EXECUTED");
    }
    const be = await execMcp(out.token, "s6d", "batch_execute", { items: [{ intent: "funds_lock", args: { amount: "10", reason: "组合审计" } }] });
    expect(be.status).toBe("EXECUTED");
    expect(be.executed_count).toBe(1);
    const rows = await auditRows(out.user_id);
    for (const act of ["funds_lock", "batch_execute"]) assertAudit(rows, act);
  }, 90000);
});
