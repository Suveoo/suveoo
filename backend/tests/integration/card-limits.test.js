import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { toCents } from "../../worker-main.js";

/** 卡片限额（单笔 / 日累计）执行层验证。
 *  限额是卡属性、在账本执行层强制：表单、AI、组合卡、预约到点执行四条通道都汇到 DO 的 transfer case，
 *  因此这里既验 REST 全链（含出卡前早失败），也直接打 DO 证明"绕过 REST 也拦得住"。 */
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
  const hit = String(mails.at(-1)?.text ?? "").match(/\b[0-9]{6}\b/);
  return hit ? hit[0] : null;
}
async function registerUser(email, name = "限额测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email);
  const r = await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true });
  return j(r);
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
async function realTarget(tag, name) {
  const out = await registerUser(`${tag}@test.dev`, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, user_id: out.user_id };
}
async function defaultDebit(token) {
  const r = await j(await SELF.fetch(BASE + "/api/cards", { headers: { authorization: `Bearer ${token}` } }));
  return r.cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1) ?? r.cards.find((c) => c.kind === "debit");
}
/** 走两段式调整限额（card_limit_adjust 恒为黄级） */
async function setLimits(token, slug, single, daily) {
  const body = { limit_single: single, limit_daily: daily };
  const s1 = await j(await post(`/api/cards/${slug}/limits`, body, token));
  if (s1.status !== "INPUT_REQUIRED") return s1;
  return j(await post(`/api/cards/${slug}/limits`, { ...body, grant_hash: s1.grant.grant_hash }, token));
}

describe("卡片限额：单笔", () => {
  it("单笔限额 ¥100：转 ¥200 在出卡前被拒，转 ¥50 正常执行", async () => {
    const out = await registerUser("cl1@test.dev");
    const tgt = await realTarget("cl1-payee", "张三");
    const card = await defaultDebit(out.token);

    const set = await setLimits(out.token, card.slug, "100.00", "100000.00");
    expect(set.status).toBe("EXECUTED");

    const over = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "200" }, out.token);
    expect(over.status).toBe(400);
    const overBody = await j(over);
    expect(overBody.status).toBe("BLOCKED");
    expect(overBody.reason).toBe("CARD_SINGLE_LIMIT_EXCEEDED");
    expect(overBody.error.message).toContain("单笔限额");

    const ok = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "50" }, out.token);
    const s1 = await j(ok);
    expect(s1.status).toBe("INPUT_REQUIRED");
    const done = await j(await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "50", grant_hash: s1.grant.grant_hash }, out.token));
    expect(done.status).toBe("EXECUTED");
  }, 30000);
});

describe("卡片限额：日累计", () => {
  it("日累计 ¥60：已转 ¥50 后再转 ¥20 被拒，转 ¥10 恰好到顶通过", async () => {
    const out = await registerUser("cl2@test.dev");
    const tgt = await realTarget("cl2-payee", "李四");
    const card = await defaultDebit(out.token);

    expect((await setLimits(out.token, card.slug, "100000.00", "60.00")).status).toBe("EXECUTED");

    const first = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "50" }, out.token);
    const s1 = await j(first);
    expect(s1.status).toBe("INPUT_REQUIRED");
    const firstDone = await j(await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "50", grant_hash: s1.grant.grant_hash }, out.token));
    expect(firstDone.status).toBe("EXECUTED");

    const over = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "20" }, out.token);
    expect(over.status).toBe(400);
    const overBody = await j(over);
    expect(overBody.reason).toBe("CARD_DAILY_LIMIT_EXCEEDED");
    expect(overBody.error.message).toContain("日累计限额");

    const exact = await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "10" }, out.token);
    const s2 = await j(exact);
    expect(s2.status).toBe("INPUT_REQUIRED");
    const exactDone = await j(await post("/api/transfers/intrabank", { recipient_account: tgt.account, recipient_name: tgt.name, amount: "10", grant_hash: s2.grant.grant_hash }, out.token));
    expect(exactDone.status).toBe("EXECUTED");
  }, 40000);
});

describe("卡片限额：执行层兜底（绕过 REST 预检）", () => {
  it("直接调用 DO transfer：超单笔限额即 CARD_SINGLE_LIMIT_EXCEEDED", async () => {
    const out = await registerUser("cl3@test.dev");
    const card = await defaultDebit(out.token);
    expect((await setLimits(out.token, card.slug, "100.00", "100000.00")).status).toBe("EXECUTED");

    const r = await doOp(`u:${out.user_id}`, {
      op: "transfer", from_card: card.slug, recipient: "acct:6222020000000009", recipient_name: "张三",
      amount_cents: "20000", trace_id: "bai_direct_probe", channel: "form",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("CARD_SINGLE_LIMIT_EXCEEDED");
  }, 30000);

  it("余额校验与限额校验独立：限额放到很高时，余额不足仍按 INSUFFICIENT_BALANCE 拒", async () => {
    const out = await registerUser("cl4@test.dev");
    const card = await defaultDebit(out.token);
    expect((await setLimits(out.token, card.slug, "9999999.00", "9999999.00")).status).toBe("EXECUTED");
    const r = await doOp(`u:${out.user_id}`, {
      op: "transfer", from_card: card.slug, recipient: "acct:6222020000000009", recipient_name: "张三",
      amount_cents: String(toCents("5000000")), trace_id: "bai_direct_probe2", channel: "form",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("INSUFFICIENT_BALANCE");
  }, 30000);
});
