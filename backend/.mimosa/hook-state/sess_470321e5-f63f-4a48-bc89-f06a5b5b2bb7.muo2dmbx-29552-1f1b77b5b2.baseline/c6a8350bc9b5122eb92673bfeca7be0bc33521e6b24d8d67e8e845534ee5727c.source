import { describe, expect, it } from "vitest";
import {
  compileToIR, createConsentGrant, verifyAndConsumeGrant, verify, VERDICT, computeGrantHash, newNonce,
} from "../../worker-main.js";

class FakeKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k)?.value ?? null; }
  async put(k, v, opts = {}) { this.map.set(k, { value: v }); void opts; }
  async delete(k) { this.map.delete(k); }
}

const NOW = 1760000000000;
const CTX = { userId: "U19382", channel: "ai", now: NOW };
const ARGS = { recipient: "U88111", amount: "500", currency: "CNY" };

function makeIR(overrides = {}) {
  return compileToIR("transfer_execute", { ...ARGS, ...overrides.args }, { ...CTX, ...overrides.ctx });
}

describe("② Consent Binding：创建", () => {
  it("生成 64 位 hex grant_hash，快照含 action 与授权字段，KV 键绑定 user_id", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const g = await createConsentGrant(kv, ir, { ttlSeconds: 120, now: NOW });

    expect(g.grant_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(g.snapshot).toEqual({ action: "transfer_execute", params: { recipient: "U88111", amount: "500", currency: "CNY" } });
    expect(g.expires_at).toBe(new Date(NOW + 120_000).toISOString());
    expect(kv.map.has(`grant:U19382:${g.grant_hash}`)).toBe(true);
  });

  it("哈希公式确定性：同输入重算一致，nonce 变化则不同", async () => {
    const ir = makeIR();
    const exp = "2026-09-12T00:02:00.000Z";
    const nonce = newNonce();
    expect(await computeGrantHash(ir, exp, nonce)).toBe(await computeGrantHash(ir, exp, nonce));
    expect(await computeGrantHash(ir, exp, nonce)).not.toBe(await computeGrantHash(ir, exp, newNonce()));
  });
});

describe("② Consent Binding：校验与消费（安全边界）", () => {
  it("正确路径：校验通过并一次性消费", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const g = await createConsentGrant(kv, ir, { now: NOW });
    const r1 = await verifyAndConsumeGrant(kv, { userId: "U19382", grantHash: g.grant_hash, ir, now: NOW + 1000 });
    expect(r1.ok).toBe(true);
    const r2 = await verifyAndConsumeGrant(kv, { userId: "U19382", grantHash: g.grant_hash, ir, now: NOW + 2000 });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("GRANT_ALREADY_USED");
  });

  it("过期拒绝（TTL 由服务端时间判定）", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const g = await createConsentGrant(kv, ir, { ttlSeconds: 120, now: NOW });
    const r = await verifyAndConsumeGrant(kv, { userId: "U19382", grantHash: g.grant_hash, ir, now: NOW + 121_000 });
    expect(r.reason).toBe("GRANT_EXPIRED");
  });

  it("条目内部 user_id 与发起会话不符 → 拒绝（存储级双重绑定）", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const g = await createConsentGrant(kv, ir, { now: NOW });
    // 篡改存储：把条目挪到另一用户命名空间下
    const raw = kv.map.get(`grant:U19382:${g.grant_hash}`).value;
    kv.map.set(`grant:U99999:${g.grant_hash}`, { value: raw });
    const r = await verifyAndConsumeGrant(kv, { userId: "U99999", grantHash: g.grant_hash, ir, now: NOW + 1000 });
    expect(r.reason).toBe("GRANT_USER_MISMATCH");
  });

  it("凭空捏造的 hash 查无此条 → 拒绝（绝不重算比对）", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const r = await verifyAndConsumeGrant(kv, { userId: "U19382", grantHash: "f".repeat(64), ir, now: NOW });
    expect(r.reason).toBe("GRANT_NOT_FOUND");
  });

  it("核心演示场景：确认前金额 500 → 5000，原授权立即失效", async () => {
    const kv = new FakeKV();
    const ir500 = makeIR();
    const g = await createConsentGrant(kv, ir500, { now: NOW });
    const ir5000 = makeIR({ args: { amount: "5000" } });
    const r = await verifyAndConsumeGrant(kv, { userId: "U19382", grantHash: g.grant_hash, ir: ir5000, now: NOW + 1000 });
    expect(r.reason).toBe("CONSENT_INVALIDATED");
  });
});

describe("② verify() 的两段式流程", () => {
  it("无 grant → INPUT_REQUIRED 并落库；带 grant_hash 重试 → VERIFIED", async () => {
    const kv = new FakeKV();
    const ir = makeIR();
    const step1 = await verify(ir, {}, { kv, now: NOW, nonceStore: { has: async () => false } });
    expect(step1.status).toBe(VERDICT.INPUT_REQUIRED);
    expect(step1.grant.grant_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(step1.stages.find((s) => s.stage === "CONSENT").ok).toBe("input_required");

    const step2 = await verify(ir, { grantHash: step1.grant.grant_hash, ledgerBalanceCents: 1_000_00n },
      { kv, now: NOW + 1000, nonceStore: { has: async () => false } });
    expect(step2.status).toBe(VERDICT.VERIFIED);
  });
});
