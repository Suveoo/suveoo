import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

/** 交易记录口径拆分：scope=transfers（转账记录页）/ scope=all（交易记录页）/ 缺省（历史口径，AI transaction_history 沿用）。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

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
async function guardedTransfer(token, body) {
  const s1 = await j(await post("/api/transfers/intrabank", body, token));
  if (s1.status !== "INPUT_REQUIRED") return s1;
  return j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, token));
}

describe("交易记录三口径（/api/transfers scope）", () => {
  it("scope=transfers 仅转账类；scope=all 全量；缺省保持历史口径", async () => {
    const a = await registerUser("txscope1@test.dev", "口径甲");
    const b = await registerUser("txscope2@test.dev", "口径乙");
    const { env } = await import("cloudflare:test");
    const bCards = (await env.LEDGER.get(env.LEDGER.idFromName(`u:${b.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "getCards" }),
    }).then((r) => r.json())).cards;
    const bDebit = bCards.find((c) => c.kind === "debit");

    const r = await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "口径乙", amount: "12.34", memo: "口径样本" });
    expect(r.status).toBe("EXECUTED");

    const getScope = async (token, qs) => (await j(await SELF.fetch(`${BASE}/api/transfers${qs}`, { headers: { authorization: `Bearer ${token}` } }))).txs ?? [];

    const only = await getScope(a.token, "?scope=transfers");
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((t) => t.category === "转账")).toBe(true);
    expect(only.some((t) => t.memo === "口径样本")).toBe(true);

    const all = await getScope(a.token, "?scope=all");
    expect(all.length).toBeGreaterThanOrEqual(only.length);
    expect(all.some((t) => t.memo === "口径样本")).toBe(true);

    const legacy = await getScope(a.token, "");
    expect(legacy.some((t) => t.memo === "口径样本")).toBe(true); /* 转账在历史口径内 */

    /* 收款方视角：跨用户入账同为 '转账' 类，出现在其转账记录 */
    const bOnly = await getScope(b.token, "?scope=transfers");
    expect(bOnly.some((t) => t.direction === "IN" && t.counterparty?.includes("口径甲"))).toBe(true);
  });
});
