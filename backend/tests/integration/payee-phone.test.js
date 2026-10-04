import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第四期任务 D：收款人手机号闭环——手动添加收款人可带手机号（^1\d{10}$ 可选校验），
 *  contacts_search 按手机号（全号/尾号）命中，payee:<id> 转账可用。 */
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
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return j(r);
}
const cardsOf = async (uid) => (await env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify({ op: "getCards" }),
}).then((r) => r.json())).cards;

describe("收款人手机号闭环", () => {
  it("带手机号添加（REST 两段式）→ contacts_search 手机号命中 → payee 转账 EXECUTED", async () => {
    const out = await registerUser("pp1@test.dev", "手机号甲");
    const to = await registerUser("pp1to@test.dev", "手机号乙");
    const H = { authorization: `Bearer ${out.token}` };
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const PHONE = "13800001234";
    /* 第一百一十轮：联系方式从属门控——目标用户先绑定该手机号（DO 直写模拟绑定） */
    await env.LEDGER.get(env.LEDGER.idFromName(`u:${to.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "setPhone", phone: PHONE }),
    });

    /* 1. REST 添加收款人带手机号：黄级两段式 */
    const body = { name: "手机号乙", account: toDebit.number, group_label: "朋友", phone: PHONE };
    const s1 = await j(await post("/api/payees", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    expect(s1.tier).toBe("YELLOW");
    const s2 = await j(await post("/api/payees", { ...body, grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");

    /* 2. DO 落库含 phone；/api/payees 返回该字段。第一百一十七轮：contact_ok 落库——
       写时计算（门控通过即 MATCHED）→ GET 直读列（不再每次全量反查 owner DO） */
    const payees = (await j(await SELF.fetch(BASE + "/api/payees", { headers: H }))).payees;
    const added = payees.find((p) => p.name === "手机号乙");
    expect(added?.phone).toBe(PHONE);
    expect(added?.verified).toBe(true);
    expect(added?.contact_ok).toBe(true);

    /* 3. contacts_search 手机号命中（全号与尾号）——AI"给手机号 xxx 转 1 元"的解析入口 */
    const call = async (id, params) => j(await SELF.fetch(`${BASE}/mcp?sid=pp1`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params }) }));
    const full = JSON.parse((await call(1, { name: "contacts_search", arguments: { name: PHONE } })).result.content[0].text);
    expect(full.payees.some((p) => p.name === "手机号乙")).toBe(true);
    const tail = JSON.parse((await call(2, { name: "contacts_search", arguments: { name: "01234" } })).result.content[0].text);
    expect(tail.payees.some((p) => p.name === "手机号乙")).toBe(true);

    /* 4. 命中的 payee 可转账（MCP 通道 recipient=payee:<id>，¥1 黄级） */
    const t1 = JSON.parse((await call(3, { name: "transfer_execute", arguments: { recipient: `payee:${added.id}`, amount: "1.00" } })).result.content[0].text);
    expect(t1.status).toBe("INPUT_REQUIRED");
    const t2 = JSON.parse((await call(4, { name: t1.card.action, arguments: { ...t1.card.params, grant_hash: t1.card.grant_hash } })).result.content[0].text);
    expect(t2.status).toBe("EXECUTED");

    /* 5. 清理：删除该收款人（DELETE 同为黄级两段式） */
    const d1 = await j(await SELF.fetch(`${BASE}/api/payees/${added.id}`, { method: "DELETE", headers: { ...H, "content-type": "application/json" }, body: "{}" }));
    expect(d1.status).toBe("INPUT_REQUIRED");
    const d2 = await j(await SELF.fetch(`${BASE}/api/payees/${added.id}`, { method: "DELETE", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ grant_hash: d1.grant.grant_hash }) }));
    expect(d2.status).toBe("EXECUTED");
  }, 30000);

  it("非法手机号被拒：INVALID_PHONE（前后置同口径，不出确认卡）", async () => {
    const out = await registerUser("pp2@test.dev", "手机号丙");
    const to = await registerUser("pp2to@test.dev", "手机号丁");
    const toDebit = (await cardsOf(to.user_id)).find((c) => c.kind === "debit");
    const r = await j(await post("/api/payees", { name: "手机号丁", account: toDebit.number, phone: "12345" }, out.token));
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("INVALID_PHONE");
    /* 合法格式但不合规（0 开头 / 12 位）同样拒绝 */
    const r2 = await j(await post("/api/payees", { name: "手机号丁", account: toDebit.number, phone: "02380000123" }, out.token));
    expect(r2.reason).toBe("INVALID_PHONE");
    /* 不填手机号不受影响（可选字段） */
    const ok1 = await j(await post("/api/payees", { name: "手机号丁", account: toDebit.number }, out.token));
    expect(ok1.status).toBe("INPUT_REQUIRED");
  }, 30000);
});
