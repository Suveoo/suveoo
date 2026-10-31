import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { centsToStr, toCents } from "../../worker-main.js";

/** P1-4 / P1-5：长程任务的到点执行必须与即时转账同一扣款守卫（限额 + 锁定资金 + 余额），
 *  且生日订花到期绝不能把余额扣成负数。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  const hit = String(mails.at(-1)?.text ?? "").match(/\b[0-9]{6}\b/);
  return hit ? hit[0] : null;
}
async function registerUser(email, name = "守卫测试") {
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
const mcp = (sid, token, name, args) => SELF.fetch(`${BASE}/mcp?sid=${sid}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
}, 30000).then((r) => r.json()).then((d) => JSON.parse(d.result.content[0].text));

async function myCards(token) {
  return (await j(await SELF.fetch(BASE + "/api/cards", { headers: { authorization: `Bearer ${token}` } }))).cards;
}
async function setLimits(token, slug, single, daily) {
  const body = { limit_single: single, limit_daily: daily };
  const s1 = await j(await post(`/api/cards/${slug}/limits`, body, token));
  if (s1.status !== "INPUT_REQUIRED") return s1;
  return j(await post(`/api/cards/${slug}/limits`, { ...body, grant_hash: s1.grant.grant_hash }, token));
}
async function realTarget(tag, name) {
  const out = await registerUser(`${tag}@test.dev`, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name };
}
async function transfer(token, body) {
  const s1 = await j(await post("/api/transfers/intrabank", body, token));
  if (s1.status !== "INPUT_REQUIRED") return s1;
  return j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, token));
}

describe("P1-4 预约转账：限额在建单与到点执行两侧都生效", () => {
  it("限额 ¥100 时建 ¥10,000 预约 → 建单即拒", async () => {
    const u = await registerUser("ag1@test.dev");
    const tgt = await realTarget("ag1-payee", "张三");
    const card = (await myCards(u.token)).find((c) => c.kind === "debit");
    expect((await setLimits(u.token, card.slug, "100.00", "100000.00")).status).toBe("EXECUTED");

    const r = await post("/api/schedules", {
      recipient_name: tgt.name, recipient_account: tgt.account, amount: "10000",
      execute_at: new Date(Date.now() + 86400000).toISOString(), repeat: "once",
    }, u.token);
    expect(r.status).toBe(400);
    const b = await j(r);
    expect(b.reason).toBe("CARD_SINGLE_LIMIT_EXCEEDED");
    expect(String(b.error.message)).toContain("单笔限额");
  }, 30000);

  it("先建单（¥50）再降额到 ¥10 → 到点执行被拒，余额不变、任务 FAILED", async () => {
    const u = await registerUser("ag2@test.dev");
    const tgt = await realTarget("ag2-payee", "李四");
    const card = (await myCards(u.token)).find((c) => c.kind === "debit");
    expect((await setLimits(u.token, card.slug, "50000.00", "100000.00")).status).toBe("EXECUTED");

    const body = {
      recipient_name: tgt.name, recipient_account: tgt.account, amount: "50",
      execute_at: new Date(Date.now() + 86400000).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, u.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    expect((await j(await post("/api/schedules", { ...body, grant_hash: s1.grant.grant_hash }, u.token))).status).toBe("EXECUTED");

    const tasks = (await j(await SELF.fetch(BASE + "/api/tasks", { headers: { authorization: `Bearer ${u.token}` } }))).tasks;
    const task = tasks.find((t) => t.type === "scheduled_transfer" && t.status === "PENDING");
    expect(task).toBeTruthy();

    /* 降额后到点执行：必须被守卫拦住（历史上这段自写扣款完全绕过限额） */
    expect((await setLimits(u.token, card.slug, "10.00", "100000.00")).status).toBe("EXECUTED");
    const balBefore = (await doOp(`u:${u.user_id}`, { op: "getCards" })).cards.find((c) => c.slug === card.slug).balance_cents;
    const due = await doOp(`u:${u.user_id}`, { op: "taskDue", id: task.id });
    expect(due.ok).toBe(false);
    expect(due.error).toBe("CARD_SINGLE_LIMIT_EXCEEDED");
    const after = (await doOp(`u:${u.user_id}`, { op: "getCards" })).cards.find((c) => c.slug === card.slug);
    expect(after.balance_cents).toBe(balBefore);
    expect((await doOp(`u:${u.user_id}`, { op: "tasks" })).tasks.find((t) => t.id === task.id).status).toBe("FAILED");
  }, 60000);
});

describe("P1-5 生日订花：到期扣款不得把余额扣成负数", () => {
  it("余额被转走后到期 → 任务 FAILED，余额保持 ¥1.00 不为负", async () => {
    const u = await registerUser("ag3@test.dev");
    const cards = await myCards(u.token);
    const main = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.find((c) => c.kind === "debit");
    const other = cards.find((c) => c.kind === "debit" && c.slug !== main.slug);
    expect(other).toBeTruthy();
    expect((await setLimits(u.token, main.slug, "9999999.00", "9999999.00")).status).toBe("EXECUTED");

    /* 建生日任务（¥600，建单即锁定同额资金） */
    const exAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const args = { task_type: "birthday_flowers", title: "生日鲜花", item: "鲜花礼盒", amount: "600.00", execute_at: exAt, repeat: "once" };
    const step1 = await mcp("ag3", u.token, "scheduled_task_create", args);
    expect(step1.status).toBe("INPUT_REQUIRED");
    const step2 = await mcp("ag3", u.token, "scheduled_task_create", { ...args, grant_hash: step1.grant.grant_hash });
    expect(step2.status).toBe("EXECUTED");

    const task = (await doOp(`u:${u.user_id}`, { op: "tasks" })).tasks.find((t) => String(t.type).includes("birthday"));
    expect(task).toBeTruthy();

    /* 模拟"存量任务未锁资金"：释放锁定，再把余额几乎转空，只留 ¥1.00 */
    expect((await doOp(`u:${u.user_id}`, { op: "fundsUnlock", amount_cents: "60000" })).ok).toBe(true);
    const cardsNow = (await doOp(`u:${u.user_id}`, { op: "getCards" })).cards;
    const bal = BigInt(cardsNow.find((c) => c.slug === main.slug).balance_cents);
    const sweep = bal - 100n;
    expect(sweep > 0n).toBe(true);
    /* 直接走 DO 搬运余额（大额走 API 会升红要 OTP，与本题无关）——只把状态摆成"余额仅剩 ¥1" */
    const moved = await doOp(`u:${u.user_id}`, {
      op: "transfer", from_card: main.slug, recipient: `acct:${other.number}`, recipient_name: "本人",
      amount_cents: String(sweep), trace_id: "probe-drain", channel: "form",
    });
    expect(moved.ok).toBe(true);
    expect(BigInt((await doOp(`u:${u.user_id}`, { op: "getCards" })).cards.find((c) => c.slug === main.slug).balance_cents)).toBe(100n);

    /* 到期执行：¥600 > 余额 ¥1 → 必须失败且不动账 */
    const due = await doOp(`u:${u.user_id}`, { op: "taskDue", id: task.id });
    expect(due.ok).toBe(false);
    expect(due.error).toBe("INSUFFICIENT_BALANCE");
    const after = (await doOp(`u:${u.user_id}`, { op: "getCards" })).cards.find((c) => c.slug === main.slug);
    expect(BigInt(after.balance_cents)).toBe(100n);
    expect(BigInt(after.balance_cents) >= 0n).toBe(true);
    expect((await doOp(`u:${u.user_id}`, { op: "tasks" })).tasks.find((t) => t.id === task.id).status).toBe("FAILED");
  }, 90000);
});
