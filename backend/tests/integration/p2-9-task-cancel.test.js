import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** P2-9：任务取消只对 PENDING 生效，且解锁只发生一次（重复点取消不得反复释放 held 池）。 */
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
async function registerUser(email, name = "取消测试") {
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
const heldOf = async (uid) => (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1).held_cents;

describe("P2-9 任务取消幂等", () => {
  it("取消一次成功解锁；再取消 → 409，held 不再变化；DO 直调同样拒绝", async () => {
    const u = await registerUser("tc1@test.dev");
    const args = {
      task_type: "birthday_flowers", title: "生日鲜花", item: "鲜花礼盒", amount: "600.00",
      execute_at: new Date(Date.now() + 2 * 86400000).toISOString(), repeat: "once",
    };
    const s1 = await mcp("tc1", u.token, "scheduled_task_create", args);
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await mcp("tc1", u.token, "scheduled_task_create", { ...args, grant_hash: s1.grant.grant_hash });
    expect(s2.status).toBe("EXECUTED");

    const task = (await doOp(`u:${u.user_id}`, { op: "tasks" })).tasks.find((t) => String(t.type).includes("birthday"));
    expect(task).toBeTruthy();
    const heldBefore = BigInt(await heldOf(u.user_id));
    expect(heldBefore).toBeGreaterThanOrEqual(60000n);

    const c1 = await j(await post(`/api/tasks/${task.id}/cancel`, {}, u.token));
    expect(c1.ok).toBe(true);
    expect(c1.compensated).toBe(true);
    const heldAfter1 = BigInt(await heldOf(u.user_id));
    expect(heldBefore - heldAfter1).toBe(60000n);

    const c2 = await post(`/api/tasks/${task.id}/cancel`, {}, u.token);
    expect(c2.status).toBe(409);
    expect((await j(c2)).error).toBe("TASK_NOT_PENDING");
    expect(BigInt(await heldOf(u.user_id))).toBe(heldAfter1);

    const direct = await doOp(`u:${u.user_id}`, { op: "taskCancel", id: task.id });
    expect(direct.ok).toBe(false);
    expect(direct.error).toBe("TASK_NOT_PENDING");
    expect(BigInt(await heldOf(u.user_id))).toBe(heldAfter1);
  }, 60000);
});
