import { describe, expect, it } from "vitest";
import { parseHistCache, buildHistoryContext, advanceHistory, AI_SYSTEM_PROMPT } from "../../worker-main.js";

/* 第二十六轮：会话历史持久化 + 续聊上文——窗口成形纯函数。
 * 三条安全硬规则之一在此固化：历史注入条目只含 role+text，任何 grant/tool_result/卡片字段即使
 * 混进缓存也会被 buildHistoryContext 白名单化丢弃。 */

describe("parseHistCache（KV 热缓存解析，旧数组格式兼容）", () => {
  it("新格式 {f,w} 原样读出", () => {
    expect(parseHistCache(JSON.stringify({ f: "帮我查余额", w: [{ role: "user", content: "帮我查余额" }] })))
      .toEqual({ f: "帮我查余额", w: [{ role: "user", content: "帮我查余额" }] });
  });
  it("旧格式纯数组 → f=null 降级；坏 JSON / 非对象 → null（触发消息表重建）", () => {
    expect(parseHistCache(JSON.stringify([{ role: "user", content: "x" }]))).toEqual({ f: null, w: [{ role: "user", content: "x" }] });
    expect(parseHistCache("not json")).toBeNull();
    expect(parseHistCache(JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parseHistCache(null)).toBeNull();
  });
});

describe("buildHistoryContext（首条常驻 + 字符预算 + 只含 role+text）", () => {
  it("窗口滚动丢掉首条用户消息后补回首条（f 常驻）", () => {
    const hist = { f: "我要存 5000 进货币基金", w: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `第${i}轮内容` })) };
    const ctx = buildHistoryContext(hist);
    expect(ctx[0]).toEqual({ role: "user", content: "我要存 5000 进货币基金" });
    expect(ctx[ctx.length - 1].content).toBe("第7轮内容");
  });
  it("首条已在窗口头部时不重复前置", () => {
    const hist = { f: "第一句", w: [{ role: "user", content: "第一句" }, { role: "assistant", content: "好的" }] };
    expect(buildHistoryContext(hist)).toEqual([{ role: "user", content: "第一句" }, { role: "assistant", content: "好的" }]);
  });
  it("字符预算超限从中段删（保头尾），不超限不动", () => {
    const w = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "字".repeat(400) })); /* 4800 字 */
    const ctx = buildHistoryContext({ f: null, w }, { budget: 1000 });
    expect(ctx.length).toBeLessThan(12);
    expect(ctx.length).toBeGreaterThanOrEqual(2);
    expect(ctx[0].content).toBe(w[0].content); /* 头保留 */
    expect(ctx[ctx.length - 1].content).toBe(w[w.length - 1].content); /* 尾保留 */
    const small = [{ role: "user", content: "短" }, { role: "assistant", content: "答" }];
    expect(buildHistoryContext({ f: null, w: small })).toEqual(small);
  });
  it("条目只含 role+text：混入的 grant_hash/tool_use/cards/嵌套 content 一律白名单化丢弃", () => {
    const dirty = [
      { role: "user", content: "转 100" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", input: { grant_hash: "abc" } }] }, /* 非字符串 content */
      { role: "assistant", content: "已出确认卡", cards: [{ component: "transfer_confirmation", grant_hash: "secret" }] },
      { role: "tool", content: "tool_result 不该出现" }, /* 非法 role */
      null,
    ];
    const ctx = buildHistoryContext({ f: null, w: dirty });
    expect(ctx).toEqual([
      { role: "user", content: "转 100" },
      { role: "assistant", content: "已出确认卡" },
    ]);
    expect(JSON.stringify(ctx)).not.toContain("grant_hash");
    expect(JSON.stringify(ctx)).not.toContain("tool_use");
  });
});

describe("advanceHistory（turn 收尾推进缓存）", () => {
  it("新会话首轮：f=首条用户消息；成功轮 user+assistant 成对入窗", () => {
    const rows = [{ role: "user", content: "你好" }, { role: "assistant", content: "你好，有什么可以帮你？" }];
    const h = advanceHistory(null, rows, 16);
    expect(h.f).toBe("你好");
    expect(h.w).toEqual(rows);
  });
  it("失败轮只落 user 侧（assistant 不进窗口）", () => {
    const h = advanceHistory({ f: "你好", w: [{ role: "user", content: "你好" }] }, [{ role: "user", content: "再问一次" }], 16);
    expect(h.f).toBe("你好");
    expect(h.w).toEqual([{ role: "user", content: "你好" }, { role: "user", content: "再问一次" }]);
  });
  it("窗口滚动截 KEEP 条；空文本条目不进窗口", () => {
    const base = Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    const h = advanceHistory({ f: "first", w: base }, [{ role: "user", content: "new" }, { role: "assistant", content: "" }], 16);
    expect(h.w.length).toBe(16);
    expect(h.w[h.w.length - 1]).toEqual({ role: "user", content: "new" });
    expect(h.f).toBe("first");
  });
});

describe("提示词安全预算", () => {
  it("历史数值过期语义入锁定区且提示词仍在 ≤2050 预算内（第二十七轮 1500→1600；第五期 idle 1600→2050：新增规则 11 对话即方案是赛题创新机制必需项）", () => {
    expect(AI_SYSTEM_PROMPT).toContain("历史对话中的数值仅代表当时");
    expect(AI_SYSTEM_PROMPT.length).toBeLessThanOrEqual(2050);
  });
});
