import { describe, expect, it } from "vitest";
import {
  compileToIR, verify, recordNonce, createConsentGrant, VERDICT,
} from "../../worker-main.js";

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

describe("⑤ Replay / Idempotency Check", () => {
  it("同一 nonce 已登记后再提交 → REPLAY_DETECTED（网络重试不重复扣款）", async () => {
    const kv = new FakeKV();
    const store = new FakeNonceStore();
    const ir = compileToIR("transfer_execute", { recipient: "U88111", amount: "500", currency: "CNY" }, CTX);

    // 第一次完整成功并落 nonce
    const s1 = await verify(ir, {}, { kv, now: NOW, nonceStore: store });
    expect(s1.status).toBe(VERDICT.INPUT_REQUIRED);
    const s2 = await verify(ir, { grantHash: s1.grant.grant_hash, ledgerBalanceCents: 100000n }, { kv, now: NOW + 1000, nonceStore: store });
    expect(s2.status).toBe(VERDICT.VERIFIED);
    await recordNonce(store, ir.nonce);

    // 客户端重试同一 IR：换一份新 consent（模拟重新确认），仍应被 nonce 拦截
    const g2 = await createConsentGrant(kv, ir, { now: NOW + 2000 });
    const s3 = await verify(ir, { grantHash: g2.grant_hash, ledgerBalanceCents: 100000n }, { kv, now: NOW + 3000, nonceStore: store });
    expect(s3.status).toBe(VERDICT.BLOCKED);
    expect(s3.blockReason).toBe("REPLAY_DETECTED");
    expect(s3.stages.find((s) => s.stage === "REPLAY").ok).toBe(false);
  });

  it("stages 恒为五道、按框架编号顺序汇报", async () => {
    const ir = compileToIR("account_query", {}, CTX);
    const r = await verify(ir, {}, { kv: new FakeKV(), now: NOW, nonceStore: new FakeNonceStore() });
    expect(r.stages.map((s) => s.stage)).toEqual(["POLICY", "CONSENT", "PROVENANCE", "INVARIANTS", "REPLAY"]);
  });

  it("绿色轻量通道：Consent/Invariants/Replay 标记 skipped", async () => {
    const store = new FakeNonceStore();
    const ir = compileToIR("split_bill_calculate", { total: "860", participants: ["me", "张三", "李四"] }, CTX);
    await recordNonce(store, ir.nonce); // 即便 nonce 已存在，只读操作也不受影响
    const r = await verify(ir, {}, { kv: new FakeKV(), now: NOW, nonceStore: store });
    expect(r.status).toBe(VERDICT.VERIFIED);
    expect(r.stages.find((s) => s.stage === "REPLAY").ok).toBe("skipped");
  });
});
