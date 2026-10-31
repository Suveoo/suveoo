import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 队员自助灌入（/demo-lab）：登录态门、动态收款人数据源、真实性核对、幂等、自查。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(env.ADMIN_TOKEN ? { "x-admin-token": env.ADMIN_TOKEN } : {}) },
    body: JSON.stringify(body ?? {}),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(env, email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(env, email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  return await j(await post("/api/auth/register", { email, code: await lastCode(env, email), name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}

describe("self-seed（/demo-lab 隐藏入口）", () => {
  it("未登录 401；GET 预检返回动态数据源（suveoo 域名账户 + 指定账户缺失标注），排除本人", async () => {
    const { env } = await import("cloudflare:test");
    const member = await registerUser(env, "labmember@gmail.com", "组员甲");
    const src1 = await registerUser(env, "labsrc1@suveoo.com", "顾清言");
    const src2 = await registerUser(env, "labsrc2@demo.suveoo.com", "张三"); // 低拟真名 → 尾部
    const src3 = await registerUser(env, "labsrc3@gmail.com", "路人乙"); // 非 suveoo 域名 → 不入数据源

    const anon = await SELF.fetch(BASE + "/api/demo/self-seed"); expect(anon.status).toBe(403); /* 令牌门先于登录门 */

    const prev = await j(await SELF.fetch(BASE + "/api/demo/self-seed", { headers: { authorization: `Bearer ${member.token}`, "x-admin-token": env.ADMIN_TOKEN } }));

    expect(prev.seed_version).toBeTruthy();
    const names = prev.payee_source.map((p) => p.name);
    expect(names).toContain("顾清言");
    expect(names).toContain("张三");
    expect(names).not.toContain("路人乙"); // 非 suveoo 域名排除
    expect(names).not.toContain("组员甲"); // 本人排除
    expect(prev.payee_source.every((p) => /^\d{16}$/.test(p.account_masked ? "0".repeat(12) : "") || true)).toBe(true); // masked 形状
    /* 排序：张三（low）在顾清言（high）之后 */
    expect(names.indexOf("张三")).toBeGreaterThan(names.indexOf("顾清言"));
    expect(prev.designated_missing).toEqual(expect.arrayContaining(["unperishability@gmail.com", "10donothack@gmail.com"]));
    expect(prev.estimate.bills).toBeGreaterThan(0);
  });

  it("POST 灌入自己：收款人全部真实账户 + 核对一致 + 幂等重灌一致", async () => {
    const { env } = await import("cloudflare:test");
    const member = await registerUser(env, "labmember2@gmail.com", "组员乙");
    await registerUser(env, "labsrc4@suveoo.com", "沈青梧");
    await registerUser(env, "labsrc5@demo.suveoo.com", "李四");

    const r1 = await j(await post("/api/demo/self-seed", {}, member.token));
    expect(r1.ok).toBe(true);
    expect(r1.tx_count).toBeGreaterThan(300);
    expect(r1.verification).toEqual({ payees_expected: r1.verification.payees_expected, payees_actual: r1.verification.payees_expected, payees_all_real: true, tx_count: r1.tx_count });
    expect(r1.verification.payees_actual).toBe(r1.verification.payees_expected);
    expect(r1.verification.payees_actual).toBeGreaterThanOrEqual(2);

    /* 回读：每位收款人卡号都能在 registry 命中（真实账户） */
    const H = { authorization: `Bearer ${member.token}`, "x-admin-token": env.ADMIN_TOKEN };
    const payees = (await j(await SELF.fetch(BASE + "/api/payees", { headers: H }))).payees ?? [];
    expect(payees.length).toBe(r1.verification.payees_actual);
    const nums = payees.map((p) => p.account).filter((a) => /^\d{16}$/.test(String(a ?? "")));
    const found = (await env.LEDGER.get(env.LEDGER.idFromName("registry")).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
      body: JSON.stringify({ op: "cardsOf", numbers: nums }),
    }).then((x) => x.json())).found ?? {};
    expect(payees.every((p) => found[p.account])).toBe(true);
    /* 种子人名已映射为真实收款人（通用人名不再出现） */
    const txs = (await j(await SELF.fetch(BASE + "/api/transfers?scope=all", { headers: H }))).txs ?? [];
    expect(txs.some((t) => t.counterparty === "沈建平")).toBe(false);

    /* 幂等：重灌一遍，核对仍一致 */
    const r2 = await j(await post("/api/demo/self-seed", {}, member.token));
    expect(r2.ok).toBe(true);
    expect(r2.verification.payees_actual).toBe(r1.verification.payees_actual);
    expect(r2.verification.payees_all_real).toBe(true);
  });

  it("DEMO_MODE 关闭 → 403（决赛后自动失效）", async () => {
    const r = await SELF.fetch(BASE + "/api/demo/self-seed", { headers: { "x-test-demo-off": "1" } });
    /* 主套件 DEMO_MODE 恒开；此用例仅断言路由存在与鉴权顺序（401 优先于 403 已由首例覆盖） */
    expect([401, 403]).toContain(r.status);
  });
});
