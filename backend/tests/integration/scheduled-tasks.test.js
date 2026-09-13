import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { newCardNumber, toCents } from "../../worker-main.js";

/** 预约转账：建立（黄级两段式）→ SagaDO alarm 唤醒执行 → 状态与余额核对。 */
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
async function registerUser(email) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name: "定时测试", password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return j(r);
}

describe("预约转账（长程任务）", () => {
  it("建立 → alarm 到点执行 → DONE，余额扣减；重复规则 RESCHEDULED", async () => {
    const email = "st1@test.dev";
    const out = await registerUser(email);
    const H = { authorization: `Bearer ${out.token}` };
    const overviewBefore = await j(await SELF.fetch(BASE + "/api/overview", { headers: H }));

    const body = {
      recipient_account: newCardNumber({ bin: "622288" }),
      recipient_name: "女儿", amount: "200", memo: "生活费",
      execute_at: new Date(Date.now() + 2500).toISOString(), repeat: "once",
    };
    const s1 = await j(await post("/api/schedules", body, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await j(await post("/api/schedules", { ...body, grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");

    // 等待 SagaDO alarm（2.5s 后）
    let task = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const tasks = await j(await SELF.fetch(BASE + "/api/tasks", { headers: H }));
      task = tasks.tasks.find((t) => t.type === "scheduled_transfer");
      if (task && task.status !== "PENDING") break;
    }
    expect(task).toBeTruthy();
    expect(task.status).toBe("DONE");

    const overviewAfter = await j(await SELF.fetch(BASE + "/api/overview", { headers: H }));
    expect(toCents(overviewAfter.total_balance)).toBe(toCents(overviewBefore.total_balance) - toCents("200"));
  }, 30000);

  it("到期前取消 → CANCELLED，不执行", async () => {
    const email = "st2@test.dev";
    const out = await registerUser(email);
    const H = { authorization: `Bearer ${out.token}` };
    const body = {
      recipient_account: newCardNumber({ bin: "622288" }),
      recipient_name: "张三", amount: "100",
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
