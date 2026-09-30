import { describe, expect, it } from "vitest";
import { compileToIR, verify, VERDICT, checkInvariants, toCents } from "../../worker-main.js";

const NOW = 1760000000000;
const CTX = { userId: "U19382", channel: "ai", now: NOW };

class FakeKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k)?.value ?? null; }
  async put(k, v) { this.map.set(k, { value: v }); }
  async delete(k) { this.map.delete(k); }
}
class FakeNonceStore {
  constructor() { this.set = new Set(); }
  async has(n) { return this.set.has(n); }
  async record(n) { this.set.add(n); }
}

/** 走完 Consent 两段式，拿到带 grantHash 的上下文。 */
async function armed(ir, kv, extraCtx = {}) {
  const s1 = await verify(ir, extraCtx, { kv, now: NOW, nonceStore: new FakeNonceStore() });
  if (s1.status !== VERDICT.INPUT_REQUIRED) throw new Error(`setup failed: ${s1.status}/${s1.blockReason}`);
  return { grantHash: s1.grant.grant_hash };
}

describe("④ Financial Invariants", () => {
  it("余额不足 → INVARIANT_BALANCE 阻断", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("transfer_execute", { recipient: "U88111", amount: "500", currency: "CNY" }, CTX);
    const { grantHash } = await armed(ir, kv);
    const r = await verify(ir, { grantHash, ledgerBalanceCents: toCents("300") },
      { kv, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(r.status).toBe(VERDICT.BLOCKED);
    expect(r.blockReason).toBe("INVARIANT_BALANCE");
    expect(r.stages.find((s) => s.stage === "INVARIANTS").ok).toBe(false);
  });

  it("余额恰好等于金额 → 通过（≥ 语义）", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("transfer_execute", { recipient: "U88111", amount: "500", currency: "CNY" }, CTX);
    const { grantHash } = await armed(ir, kv);
    const r = await verify(ir, { grantHash, ledgerBalanceCents: toCents("500") },
      { kv, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(r.status).toBe(VERDICT.VERIFIED);
  });

  it("严格模式下余额数据缺失 → 阻断；非严格 → 放行并留注记", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("transfer_execute", { recipient: "U88111", amount: "500", currency: "CNY" }, CTX);
    const { grantHash } = await armed(ir, kv);
    const strict = await verify(ir, { grantHash }, { kv, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(strict.blockReason).toBe("INVARIANT_DATA_MISSING");

    const kv2 = new FakeKV();
    const ir2 = compileToIR("transfer_execute", { recipient: "U88111", amount: "500", currency: "CNY" }, CTX);
    const { grantHash: g2 } = await armed(ir2, kv2);
    const lax = await verify(ir2, { grantHash: g2, strict: false }, { kv: kv2, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(lax.status).toBe(VERDICT.VERIFIED);
  });

  it("理财适当性：产品 R5 > 用户 PR3 → INVARIANT_PR_MISMATCH（防违规销售）", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("wealth_product_purchase", { product_id: "apac-tech", amount: "50000", product_risk_level: 5 }, CTX);
    const { grantHash } = await armed(ir, kv);
    const r = await verify(ir, { grantHash, userPrLevel: 3 }, { kv, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(r.blockReason).toBe("INVARIANT_PR_MISMATCH");
  });

  it("适当性匹配（R2 ≤ PR3）→ 放行", async () => {
    const kv = new FakeKV();
    const ir = compileToIR("wealth_product_purchase", { product_id: "esg-bond", amount: "10000", product_risk_level: 2 }, CTX);
    const { grantHash } = await armed(ir, kv);
    const r = await verify(ir, { grantHash, userPrLevel: 3 }, { kv, now: NOW + 1000, nonceStore: new FakeNonceStore() });
    expect(r.status).toBe(VERDICT.VERIFIED);
  });

  it("直接调用 checkInvariants：长程任务必须声明补偿（Saga 配对断言）", () => {
    const bad = { intent: "scheduled_task_create", steps: [{ op: "scheduled_task_create", params: { amount: "600", task_type: "birthday_flowers" } }], compensation: [] };
    expect(checkInvariants(bad, { strict: false }).ok).toBe(false);
    expect(checkInvariants(bad, { strict: false }).violations[0].code).toBe("INVARIANT_COMPENSATION_PAIRING");
  });
});
