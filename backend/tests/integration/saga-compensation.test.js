import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

/** Saga 补偿：生日订花 T1✓ → 注入失败 → taskDue 触发 T2✗ → C1✓ 资金解锁。 */
const BASE = "https://suveoo.com";

async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

describe("Saga 补偿链（故障注入）", () => {
  it("seed → 锁定 ¥600 → 注入失败 → taskDue → COMPENSATED 且资金解锁", async () => {
    const seed = await (await SELF.fetch(BASE + "/api/demo/seed", { method: "POST", headers: { "x-admin-token": env.ADMIN_TOKEN } })).json();
    expect(seed.ok).toBe(true);
    const uid = seed.user_id;

    const tasks = await doOp(`u:${uid}`, { op: "tasks" });
    const birthday = tasks.tasks.find((t) => t.type === "birthday_flowers");
    expect(birthday).toBeTruthy();
    expect(birthday.status).toBe("PENDING");

    const cards1 = await doOp(`u:${uid}`, { op: "getCards" });
    const def1 = cards1.cards.find((c) => Number(c.is_default) === 1);
    expect(def1.held_cents).toBe("60000"); // T1 ✓ 已锁 ¥600

    // 注入故障（决赛演示第三幕的开关）
    await doOp(`u:${uid}`, { op: "taskInjectFailure", id: birthday.id });
    const due = await doOp(`u:${uid}`, { op: "taskDue", id: birthday.id });
    expect(due.outcome).toBe("COMPENSATED");
    expect(due.steps).toEqual(["T1 ✓ LockFunds", "T2 ✗ MerchantOrder", "C1 ✓ UnlockFunds"]);

    const cards2 = await doOp(`u:${uid}`, { op: "getCards" });
    const def2 = cards2.cards.find((c) => Number(c.is_default) === 1);
    expect(def2.held_cents).toBe("0"); // C1 ✓ 解锁
    const bal1 = BigInt(def1.balance_cents), bal2 = BigInt(def2.balance_cents);
    expect(bal2).toBe(bal1); // 余额未受失败影响（守恒）
  }, 30000);

  it("未注入故障：taskDue → DONE，锁定资金转为支付", async () => {
    const seed = await (await SELF.fetch(BASE + "/api/demo/seed", { method: "POST", headers: { "x-admin-token": env.ADMIN_TOKEN } })).json();
    const uid = seed.user_id;
    const tasks = await doOp(`u:${uid}`, { op: "tasks" });
    const birthday = tasks.tasks.find((t) => t.type === "birthday_flowers");

    const before = (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => Number(c.is_default) === 1);
    const due = await doOp(`u:${uid}`, { op: "taskDue", id: birthday.id });
    expect(due.outcome).toBe("DONE");

    const after = (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => Number(c.is_default) === 1);
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents) - 60000n);
    expect(after.held_cents).toBe("0");
    const status = (await doOp(`u:${uid}`, { op: "tasks" })).tasks.find((t) => t.id === birthday.id).status;
    expect(status).toBe("DONE");
  }, 30000);

  it("手动取消任务 → CANCELLED 并补偿（演示 P13 取消按钮）", async () => {
    const seed = await (await SELF.fetch(BASE + "/api/demo/seed", { method: "POST", headers: { "x-admin-token": env.ADMIN_TOKEN } })).json();
    const uid = seed.user_id;
    const tasks = await doOp(`u:${uid}`, { op: "tasks" });
    const birthday = tasks.tasks.find((t) => t.type === "birthday_flowers");
    const r = await doOp(`u:${uid}`, { op: "taskCancel", id: birthday.id });
    expect(r.ok).toBe(true);
    expect(r.compensated).toBe(true);
    const def = (await doOp(`u:${uid}`, { op: "getCards" })).cards.find((c) => Number(c.is_default) === 1);
    expect(def.held_cents).toBe("0");
  }, 30000);
});
