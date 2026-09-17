import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { newCardNumber, toCents } from "../../worker-main.js";

/** 预约转账：建立（黄级两段式 + 收款人真实性校验）→ SagaDO alarm 唤醒执行 → 状态/余额/付款卡核对。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

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
async function registerUser(email, name = "定时测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return j(r);
}
const cardsOf = async (uid) => (await env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify({ op: "getCards" }),
}).then((r) => r.json())).cards;
const cardBal = async (uid, slug) => (await cardsOf(uid)).find((c) => c.slug === slug).balance_cents;

describe("预约转账（长程任务）", () => {
  it("建立（真实对手方+指定付款卡）→ 到点执行 → 指定卡余额扣减", async () => {
    const out = await registerUser("st1@test.dev", "定时甲");
    const to = await registerUser("st1to@test.dev", "收款丙");
    const H = { authorization: `Bearer ${out.token}` };
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const myCards = await cardsOf(out.user_id);
    const def = myCards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const other = myCards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    const before = await cardBal(out.user_id, other.slug);

    const body = {
      recipient_account: toDebit.number, recipient_name: "收款丙",
      amount: "200", memo: "生活费", from_card: other.slug,
      execute_at: new Date(Date.now() + 2500).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await j(await post("/api/schedules", { ...body, grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");

    let task = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const tasks = await j(await SELF.fetch(BASE + "/api/tasks", { headers: H }));
      task = tasks.tasks.find((t) => t.type === "scheduled_transfer");
      if (task && task.status !== "PENDING") break;
    }
    expect(task).toBeTruthy();
    expect(task.status).toBe("DONE");
    /* 指定付款卡扣款（from_card 生效），而非默认卡 */
    expect(BigInt(await cardBal(out.user_id, other.slug))).toBe(BigInt(before) - toCents("200"));
  }, 30000);

  it("编造收款卡号 → 建单即拦（与即时转账同一真实性口径）", async () => {
    const out = await registerUser("st3@test.dev", "定时乙");
    const body = {
      recipient_account: newCardNumber({ bin: "622288" }), recipient_name: "不存在的人",
      amount: "100", execute_at: new Date(Date.now() + 20000).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, out.token));
    expect(s1.status).toBe("BLOCKED"); /* BIZ_REJECT 在 HTTP 层映射为 BLOCKED + 结构化 reason */
    expect(["ACCOUNT_NOT_FOUND", "NAME_MISMATCH"]).toContain(s1.reason);
  });

  it("MCP 通道（AI 确认卡路径）：顶层字段归一 → transfer_confirmation 确认卡（含收款人/付款卡/备注/执行时间）→ grant 确认建立任务", async () => {
    const out = await registerUser("st4@test.dev", "定时己");
    const to = await registerUser("st4to@test.dev", "收款庚");
    const H = { authorization: `Bearer ${out.token}`, "content-type": "application/json" };
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const myCards = await cardsOf(out.user_id);
    const other = myCards.find((c) => c.kind === "debit" && Number(c.is_default) !== 1);

    /* 模型把收款人放顶层（无 transfer 子对象）——服务端归一 */
    const c1 = await j(await SELF.fetch(`${BASE}/mcp?sid=st4`, { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "scheduled_task_create", arguments: {
        task_type: "scheduled_transfer", title: "预约转账 · 收款庚", amount: "66.60",
        execute_at: new Date(Date.now() + 3600_000).toISOString(), repeat: "once",
        recipient_name: "收款庚", recipient_account: toDebit.number, memo: "MCP 卡片验证", from_card: other.slug,
      } },
    }) }));
    const inner1 = JSON.parse(c1.result.content[0].text);
    expect(inner1.status).toBe("INPUT_REQUIRED");
    /* 确认卡路由修复：不再落到 card_setting_confirm（无确认操作的错卡） */
    expect(inner1.card.component).toBe("transfer_confirmation");
    expect(inner1.card.action).toBe("scheduled_task_create");
    expect(inner1.card.params.recipient_display).toContain("收款庚");
    expect(inner1.card.params.from_card_display).toContain(String(other.number).slice(-4));
    expect(inner1.card.params.memo).toBe("MCP 卡片验证");
    expect(inner1.grant.grant_hash).toBeTruthy();

    const c2 = await j(await SELF.fetch(`${BASE}/mcp?sid=st4`, { method: "POST", headers: H, body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "scheduled_task_create", arguments: {
        task_type: "scheduled_transfer", title: "预约转账 · 收款庚", amount: "66.60",
        execute_at: new Date(Date.now() + 3600_000).toISOString(), repeat: "once", transfer: { recipient_name: "收款庚", recipient_account: toDebit.number, amount: "66.60", memo: "MCP 卡片验证", from_card: other.slug },
        grant_hash: inner1.grant.grant_hash,
      } },
    }) }));
    const inner2 = JSON.parse(c2.result.content[0].text);
    expect(inner2.status).toBe("EXECUTED");
    const tasks = await j(await SELF.fetch(BASE + "/api/tasks", { headers: { authorization: `Bearer ${out.token}` } }));
    const t = tasks.tasks.find((x) => x.type === "scheduled_transfer");
    expect(t).toBeTruthy();
    expect(t.status).toBe("PENDING");
  });

  it("过去时间建预约 → INVALID_SCHEDULE_TIME（模型把'后天'算成过去日期时立即执行违背预约语义）", async () => {
    const out = await registerUser("st5@test.dev", "定时辛");
    const to = await registerUser("st5to@test.dev", "收款壬");
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const body = {
      recipient_account: toDebit.number, recipient_name: "收款壬", amount: "50",
      execute_at: new Date(Date.now() - 3600_000).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, out.token));
    expect(s1.status).toBe("BLOCKED");
    expect(s1.reason).toBe("INVALID_SCHEDULE_TIME");
  });

  it("到期前取消 → CANCELLED，不执行", async () => {
    const out = await registerUser("st2@test.dev", "定时丁");
    const to = await registerUser("st2to@test.dev", "收款戊");
    const H = { authorization: `Bearer ${out.token}` };
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const body = {
      recipient_account: toDebit.number, recipient_name: "收款戊", amount: "100",
      execute_at: new Date(Date.now() + 20000).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, out.token));
    await post("/api/schedules", { ...body, grant_hash: s1.grant.grant_hash }, out.token);
    const tasks = await j(await SELF.fetch(BASE + "/api/tasks", { headers: H }));
    const id = tasks.tasks.find((t) => t.type === "scheduled_transfer").id;
    const cancel = await post(`/api/tasks/${id}/cancel`, {}, out.token);
    expect((await j(cancel)).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1200));
    const after = await j(await SELF.fetch(BASE + "/api/tasks", { headers: H }));
    expect(after.tasks.find((t) => t.id === id).status).toBe("CANCELLED");
  });
});
