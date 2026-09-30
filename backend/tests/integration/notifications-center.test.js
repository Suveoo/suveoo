import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第二十九轮通知中心：cursor 分页（50/页）+ byType 分类未读计数 + 单条已读/清空已读删除。 */
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
async function registerUser(email, name = "通知测试") {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return j(r);
}
const notify = async (uid, type, title) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify({ op: "notify", type, title, body: `自动测试 ${title}` }),
}).then((r) => r.json());

describe("通知中心（第二十九轮）", () => {
  it("cursor 分页：默认 50 条 + byType 分类未读 + 加载更多", async () => {
    const u = await registerUser("nc1@test.dev");
    const H = { authorization: `Bearer ${u.token}` };
    /* 注册自带 1 条 SYSTEM 欢迎通知；再补 55 条（五类各 11）→ 共 56 */
    for (const t of ["TRANSFER", "SECURITY", "WEALTH", "TASK", "SYSTEM"]) {
      for (let i = 0; i < 11; i++) await notify(u.user_id, t, `${t}-${i}`);
    }
    const p1 = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    expect(p1.notifications).toHaveLength(50);
    expect(p1.nextCursor).toBe(50);
    expect(p1.unread).toBe(56);
    expect(p1.byType).toMatchObject({ TRANSFER: 11, SECURITY: 11, WEALTH: 11, TASK: 11, SYSTEM: 12 });
    const p2 = await j(await SELF.fetch(BASE + "/api/notifications?cursor=50", { headers: H }));
    expect(p2.notifications).toHaveLength(6);
    expect(p2.nextCursor).toBeNull();
    /* 两页拼合无重复（id 全异） */
    const ids = [...p1.notifications, ...p2.notifications].map((n) => n.id);
    expect(new Set(ids).size).toBe(56);
  });

  it("单条已读 → 分类计数联动；全部已读 → 清零；清空已读 → 只剩未读", async () => {
    const u = await registerUser("nc2@test.dev");
    const H = { authorization: `Bearer ${u.token}` };
    await notify(u.user_id, "TRANSFER", "T1");
    await notify(u.user_id, "TRANSFER", "T2");
    await notify(u.user_id, "SECURITY", "S1");
    const before = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    const firstId = before.notifications[0].id; /* SECURITY S1（id 最大） */
    /* 单条已读：unread -1，SECURITY 分类徽章同步减 */
    const r1 = await j(await post("/api/notifications/read", { ids: [firstId] }, u.token));
    expect(r1.ok).toBe(true);
    const mid = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    expect(mid.unread).toBe(before.unread - 1);
    expect(mid.byType.SECURITY ?? 0).toBe(0); /* byType 只含未读>0 的类 */
    /* 全部已读 */
    await post("/api/notifications/read", { ids: "all" }, u.token);
    const allRead = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    expect(allRead.unread).toBe(0);
    expect(allRead.byType).toEqual({});
    /* 清空已读：全部为已读 → 全删；session 未读数仍 0 */
    const rd = await j(await post("/api/notifications/delete", { ids: "read" }, u.token));
    expect(rd.ok).toBe(true);
    const after = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    expect(after.notifications).toHaveLength(0);
    expect(after.unread).toBe(0);
  });

  it("单条删除：未读删除同时扣减 unread 与 byType", async () => {
    const u = await registerUser("nc3@test.dev");
    const H = { authorization: `Bearer ${u.token}` };
    await notify(u.user_id, "WEALTH", "W1");
    const before = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    const wealthId = before.notifications.find((n) => n.type === "WEALTH").id;
    const del = await j(await post("/api/notifications/delete", { ids: [wealthId] }, u.token));
    expect(del.ok).toBe(true);
    const after = await j(await SELF.fetch(BASE + "/api/notifications", { headers: H }));
    expect(after.notifications.some((n) => n.id === wealthId)).toBe(false);
    expect(after.byType.WEALTH ?? 0).toBe(0);
    expect(after.unread).toBe(before.unread - 1);
  });

});
