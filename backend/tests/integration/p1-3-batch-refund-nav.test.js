import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { compileToIR, executeIntent, toCents } from "../../worker-main.js";

/** P1-3：组合卡失败回退必须按服务端净值结算——提交参数里的 nav 不得影响回退金额。
 *  直接驱动 executeIntent（绕过 MCP 对 RED 的"禁止携带 otp"限制），这正是 UI 确认卡执行时走的同一条路径。 */
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
async function registerUser(email, name = "回退测试") {
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
const balanceOf = async (uid) => (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1).balance_cents;

describe("P1-3 组合回退净额", () => {
  it("申购时塞 nav=9999 → 回退按服务端净值结算，余额不被放大", async () => {
    const u = await registerUser("rv1@test.dev");
    const before = BigInt(await balanceOf(u.user_id));
    const ir = compileToIR("batch_execute", {
      items: [
        { intent: "wealth_product_purchase", args: { product_id: "global-short-bond", amount: "100.00", nav: "9999.00" } },
        /* 第二项在执行层失败（无持仓）→ 触发第一项回退 */
        { intent: "wealth_product_redeem", args: { product_id: "esg-bond", amount: "10.00" } },
      ],
    }, { userId: u.user_id, channel: "form" });
    const out = await executeIntent(env, ir);
    expect(out.ok).toBe(false); /* 第二项失败 → 部分完成 */
    expect(out.refunded).toContain("global-short-bond");
    const after = BigInt(await balanceOf(u.user_id));
    const delta = after - before;
    /* 正常回退 ≈ 本金（净值同源）；若仍采信 nav=9999，余额会放大到约 ¥88 万 */
    expect(delta <= toCents("20")).toBe(true);
    expect(delta >= toCents("-20")).toBe(true);
  }, 60000);

  it("DO 兜底：赎回入参 nav 偏离成本净值 5 倍以上 → 按成本净值结算", async () => {
    const u = await registerUser("rv2@test.dev");
    /* 直接建一笔持仓：成本净值 = 服务端行情 */
    const buy = await doOp(`u:${u.user_id}`, { op: "wealthPurchase", fund: "global-short-bond", amount_cents: "10000", nav: "1.1301", risk_level: 1 });
    expect(buy.ok).toBe(true);
    const r = await doOp(`u:${u.user_id}`, { op: "wealthRedeem", fund: "global-short-bond", amount_cents: null, nav: "9999.00" });
    expect(r.ok).toBe(true);
    /* 异常净值被夹到成本净值：回款≈本金 ¥100（而不是 100×9999/1.1301 ≈ ¥88 万） */
    expect(toCents(String(r.amount))).toBeLessThanOrEqual(toCents("101"));
    expect(toCents(String(r.amount))).toBeGreaterThanOrEqual(toCents("99"));
  }, 60000);
});
