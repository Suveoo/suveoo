import { describe, expect, it } from "vitest";
import {
  compileToIR, createConsentGrant, verifyAndConsumeGrant, grantSnapshotParams,
  stableAuthJson, TOOL_REGISTRY, TOOL_SCHEMA, VERDICT, RISK, verify,
} from "../../worker-main.js";

/** 授权字段覆盖契约：每个非绿工具的每一个 authFields 字段，确认后被改写都必须 CONSENT_INVALIDATED。
 *  这一层是"用户确认的是参数快照"的实现底线——漏一个字段，就等于该字段可以静默改写。 */

class FakeKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k)?.value ?? null; }
  async put(k, v) { this.map.set(k, { value: v }); }
}
const NOW = 1760000000000;
const CTX = { userId: "U1", channel: "form", now: NOW };

const BASE = {
  transfer_execute: { recipient: "payee:1", amount: "100.00", currency: "CNY", from_card: "card-a", memo: "测试" },
  fx_exchange: { direction: "cny2usd", currency: "USD", amount_cny: "1000.00", amount_foreign: "140.00", from_card: "card-a" },
  card_limit_adjust: { card_id: "card-a", new_limit: "5000.00", new_daily_limit: "10000.00" },
  subscription_cancel: { subscription_id: "sub-1" },
  payee_manage: { action: "add", payee: { name: "张三", account: "6222020000000001" } },
  autopay_manage: { bill_id: "bill-1", enabled: true },
  bill_pay: { bill_id: "bill-1", amount: "88.00" },
  funds_lock: { amount: "500.00", reason: "task" },
  scheduled_task_create: {
    task_type: "scheduled_transfer", amount: "100.00", execute_at: "2026-11-01T09:00:00+08:00", repeat: "once",
    transfer: { recipient_name: "张三", recipient_account: "6222020000000001", amount: "100.00" },
  },
  wealth_product_purchase: { product_id: "fund-1", amount: "1000.00" },
  wealth_product_redeem: { product_id: "fund-1", amount: "500.00" },
  card_freeze: { card_id: "card-a" },
  card_unfreeze: { card_id: "card-a" },
  card_loss_report: { card_id: "card-a", replace_new: false, mail_to: null, pay_card: "card-b" },
  card_loss_activate: { card_id: "card-a" },
  task_cancel: { task_id: 12 },
  subscription_reminder_toggle: { subscription_id: "sub-1", enabled: true },
  deposit_open: { product_id: "term-3m", amount: "10000.00" },
  ecommerce_order_mock: { item: "coffee", amount: "30.00" },
  goal_create: { name: "旅行", target_amount: "10000.00", deadline: "2027-06-30", auto_monthly: "500.00" },
  goal_adjust: { goal_id: 3, auto_monthly: "600.00" },
  goal_contribute: { goal_id: 3, amount: "300.00" },
  goal_abandon: { goal_id: 3 },
  phone_manage: { action: "bind", phone: "13800000000" },
  notify_prefs: { action: "set", prefs: { WEALTH: false } },
  batch_execute: { items: [{ intent: "card_limit_adjust", args: { card_id: "card-a", new_limit: "100.00" } }] },
  solution_package_purchase: { items_json: "[{\"product_id\":\"fund-1\",\"amount\":\"100.00\"}]", total_amount: "100.00" },
};

/** 把某个绑定字段改成"另一个值"：类型无关的通用变异 */
function mutateField(args, field) {
  const out = JSON.parse(JSON.stringify(args));
  const v = out[field];
  if (v === null || v === undefined) out[field] = "__changed__";
  else if (typeof v === "string") out[field] = v + "X";
  else if (typeof v === "number") out[field] = v + 1;
  else if (typeof v === "boolean") out[field] = !v;
  else if (Array.isArray(v)) out[field] = [...v, { intent: "task_cancel", args: { task_id: 99 } }];
  else out[field] = { ...v, __changed: true };
  return out;
}

async function grantThenVerify(intent, baseArgs, mutatedArgs) {
  const kv = new FakeKV();
  const g = await createConsentGrant(kv, compileToIR(intent, baseArgs, CTX), { now: NOW });
  return verifyAndConsumeGrant(kv, { userId: "U1", grantHash: g.grant_hash, ir: compileToIR(intent, mutatedArgs, CTX), now: NOW + 1000 });
}

describe("授权字段覆盖契约", () => {
  it("每个非绿工具都声明了非空 authFields（新增工具不得留空快照）", () => {
    const missing = Object.entries(TOOL_REGISTRY)
      .filter(([, v]) => v.tier && v.tier !== RISK.GREEN)
      .filter(([k]) => !(TOOL_SCHEMA[k]?.authFields ?? []).length)
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  for (const [intent, baseArgs] of Object.entries(BASE)) {
    const fields = TOOL_SCHEMA[intent]?.authFields ?? [];
    it(`${intent}：逐个绑定字段被改写均失效（${fields.join(" / ")}）`, async () => {
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        const r = await grantThenVerify(intent, baseArgs, mutateField(baseArgs, f));
        expect(r.ok, `${intent}.${f} 被改写后仍放行`).toBe(false);
        expect(r.reason).toBe("CONSENT_INVALIDATED");
      }
      /* 对照组：原样重放必须通过（证明上面的红不是"任何请求都拒"引起的假阳性） */
      const ok = await grantThenVerify(intent, baseArgs, baseArgs);
      expect(ok.ok).toBe(true);
    });
  }
});

describe("复杂字段的确定性序列化", () => {
  it("对象键顺序不同不算篡改（规范化后同值）", async () => {
    const a = { action: "add", payee: { name: "张三", account: "6222020000000001" } };
    const b = { action: "add", payee: { account: "6222020000000001", name: "张三" } };
    expect(stableAuthJson(a.payee)).toBe(stableAuthJson(b.payee));
    const r = await grantThenVerify("payee_manage", a, b);
    expect(r.ok).toBe(true);
  });

  it("对象内容被换掉即失效（旧实现在哈希里塌缩成 [object Object]）", async () => {
    const a = { action: "add", payee: { name: "张三", account: "6222020000000001" } };
    const b = { action: "add", payee: { name: "李四", account: "6222020000000002" } };
    const r = await grantThenVerify("payee_manage", a, b);
    expect(r.reason).toBe("CONSENT_INVALIDATED");
  });

  it("组合卡：整份计划被替换、增删项、换序均失效", async () => {
    const plan = [
      { intent: "card_limit_adjust", args: { card_id: "card-a", new_limit: "100.00" } },
      { intent: "card_limit_adjust", args: { card_id: "card-a", new_daily_limit: "1000.00" } },
    ];
    const replaced = [
      { intent: "card_limit_adjust", args: { card_id: "card-a", new_limit: "900.00" } },
      { intent: "card_limit_adjust", args: { card_id: "card-a", new_daily_limit: "9000.00" } },
    ];
    const added = [...plan, { intent: "task_cancel", args: { task_id: 9 } }];
    const reordered = [plan[1], plan[0]];
    for (const [label, mutated] of [["替换", replaced], ["增项", added], ["换序", reordered]]) {
      const r = await grantThenVerify("batch_execute", { items: plan }, { items: mutated });
      expect(r.reason, `组合卡${label}后仍放行`).toBe("CONSENT_INVALIDATED");
    }
    const ok = await grantThenVerify("batch_execute", { items: plan }, { items: plan });
    expect(ok.ok).toBe(true);
  });
});

describe("判级绑定：授权不得升红复用", () => {
  const args = { recipient: "payee:1", amount: "900.00", currency: "CNY" };
  const yellow = compileToIR("transfer_execute", args, { ...CTX, dailyAccumulatedCents: 0n });
  const red = compileToIR("transfer_execute", args, { ...CTX, dailyAccumulatedCents: 200000n });

  it("签发时黄卡、执行时已升红 → CONSENT_TIER_ESCALATED（参数未变也拒）", async () => {
    expect(yellow.risk.tier).toBe(RISK.YELLOW);
    expect(red.risk.tier).toBe(RISK.RED);
    const kv = new FakeKV();
    const g = await createConsentGrant(kv, yellow, { now: NOW });
    const r = await verifyAndConsumeGrant(kv, { userId: "U1", grantHash: g.grant_hash, ir: red, now: NOW + 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("CONSENT_TIER_ESCALATED");
  });

  it("红卡降级为黄动作仍按原授权放行（OTP 已在首次执行校验）", async () => {
    const kv = new FakeKV();
    const g = await createConsentGrant(kv, red, { now: NOW });
    const r = await verifyAndConsumeGrant(kv, { userId: "U1", grantHash: g.grant_hash, ir: yellow, now: NOW + 1000 });
    expect(r.ok).toBe(true);
  });
});

describe("快照形状", () => {
  it("对象字段以稳定 JSON 入快照（无 [object Object]）", () => {
    const ir = compileToIR("payee_manage", BASE.payee_manage, CTX);
    const snap = grantSnapshotParams(ir);
    expect(snap.payee).toBe(stableAuthJson(BASE.payee_manage.payee));
    expect(snap.payee).not.toContain("[object Object]");
  });

  it("verify() 与 grant 的输入一致时给出 INPUT_REQUIRED（不误伤首段）", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("batch_execute", { items: BASE.batch_execute.items }, CTX);
    const step1 = await verify(ir, {}, { kv, now: NOW, nonceStore: { has: async () => false } });
    expect(step1.status).toBe(VERDICT.INPUT_REQUIRED);
    expect(step1.grant.snapshot.params.items).toBe(stableAuthJson(BASE.batch_execute.items));
  });
});
