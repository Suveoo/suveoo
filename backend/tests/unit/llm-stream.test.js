import { describe, expect, it, vi, afterEach } from "vitest";
import { llmMessages } from "../../worker-main.js";

/* ⑥ /api/ai/chat LLM 代理的真流式改造：流式 SSE 解析 / 工具 JSON 聚合 / 非流式回退 */

const ENV = { LLM_BASE_URL: "https://gw.example", LLM_MODEL: "test-model", LLM_API_KEY: "sk-test" };

function sseResponse(events, { status = 200, contentType = "text/event-stream" } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function jsonResponse(obj, { status = 200 } = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("⑥-3 llmMessages 真流式", () => {
  it("流式路径：text_delta 即时回调、tool_use input_json_delta 聚合为完整 JSON、streamed=true", async () => {
    const events = [
      { type: "message_start", message: { role: "assistant" } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "您好，" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "正在查" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "询余额。" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "balance_query", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"card":' } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"debit"}' } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
      { type: "message_stop" },
    ];
    const fetchMock = vi.fn(async () => sseResponse(events));
    vi.stubGlobal("fetch", fetchMock);
    const chunks = [];
    const { out, err, streamed } = await llmMessages(ENV, [{ role: "user", content: "查余额" }], [], (t) => chunks.push(t));
    expect(err).toBeUndefined();
    expect(streamed).toBe(true);
    expect(chunks).toEqual(["您好，", "正在查", "询余额。"]);
    expect(out.content).toHaveLength(2);
    expect(out.content[0]).toEqual({ type: "text", text: "您好，正在查询余额。" });
    expect(out.content[1]).toEqual({ type: "tool_use", id: "tu_1", name: "balance_query", input: { card: "debit" } });
    expect(out.stop_reason).toBe("tool_use");
    /* 请求体带 stream:true */
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.stream).toBe(true);
  });

  it("网关忽略 stream 直接回 JSON（200 + application/json）：就地消化、不再发第二次请求、token 整段补发", async () => {
    const jsonOut = { content: [{ type: "text", text: "好的" }], stop_reason: "end_turn" };
    const fetchMock = vi.fn(async () => jsonResponse(jsonOut));
    vi.stubGlobal("fetch", fetchMock);
    const chunks = [];
    const { out, streamed } = await llmMessages(ENV, [{ role: "user", content: "hi" }], [], (t) => chunks.push(t));
    expect(streamed).toBeUndefined();
    expect(out).toEqual(jsonOut);
    expect(chunks).toEqual([]); /* 回退路径 token 由调用方按 textPart 整段补发 */
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("流式请求被拒（400）→ 回退非流式（第二次请求无 stream 字段）", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "stream unsupported" } }, { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({ content: [{ type: "text", text: "fallback ok" }], stop_reason: "end_turn" }));
    vi.stubGlobal("fetch", fetchMock);
    const { out, err, streamed } = await llmMessages(ENV, [{ role: "user", content: "hi" }], [], () => {});
    expect(err).toBeUndefined();
    expect(streamed).toBeUndefined();
    expect(out.content[0].text).toBe("fallback ok");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBeUndefined();
  });

  it("流中途 error 事件且已有文本 → 返回已聚合部分（不重放、不重试）", async () => {
    const events = [
      { type: "message_start", message: {} },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "答到一半" } },
      { type: "content_block_stop", index: 0 },
      { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    ];
    const fetchMock = vi.fn(async () => sseResponse(events));
    vi.stubGlobal("fetch", fetchMock);
    const chunks = [];
    const { out, streamed } = await llmMessages(ENV, [{ role: "user", content: "hi" }], [], (t) => chunks.push(t));
    expect(streamed).toBe(true);
    expect(out.stop_reason).toBe("stream_error");
    expect(out.content[0].text).toBe("答到一半");
    expect(fetchMock).toHaveBeenCalledTimes(1); /* 已下发的 token 不能重放，直接返回部分结果 */
  });

  it("SSE 分帧切割：一个 chunk 跨多个事件、事件体被 TCP 分片截断也能正确解析", async () => {
    const enc = new TextEncoder();
    const raw = [
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"分片"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"重组"}}\n\n',
      "event: content_block_stop\ndata: ",
      '{"type":"content_block_stop","index":0}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("");
    const body = new ReadableStream({
      start(c) {
        /* 故意按 7 字节一片发射，模拟网络分片 */
        for (let i = 0; i < raw.length; i += 7) c.enqueue(enc.encode(raw.slice(i, i + 7)));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })));
    const chunks = [];
    const { out, streamed } = await llmMessages(ENV, [{ role: "user", content: "hi" }], [], (t) => chunks.push(t));
    expect(streamed).toBe(true);
    expect(chunks).toEqual(["分片", "重组"]);
    expect(out.content[0].text).toBe("分片重组");
  });

  it("未提供 onText（历史调用方式）→ 保持非流式，不加 stream 字段", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: [], stop_reason: "end_turn" }));
    vi.stubGlobal("fetch", fetchMock);
    await llmMessages(ENV, [{ role: "user", content: "hi" }], []);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBeUndefined();
  });
});

/* 第十一期：MODEL_PROFILES 档位切换——resolveLlmProfile 五条路径 + llmMessages 按档位取 base/model */
describe("⑥-4 模型档位（MODEL_PROFILE）", () => {
  it("MODEL_PROFILE 未设置 → 旧路径逐字节等价（直读 LLM_* env、75s 超时）", async () => {
    const { resolveLlmProfile } = await import("../../worker-main.js");
    const p = resolveLlmProfile({ LLM_PROVIDER: "glm", LLM_BASE_URL: "https://open.bigmodel.cn/api/anthropic/", LLM_MODEL: "glm-5.3-flash", LLM_API_KEY: "K" });
    expect(p).toEqual({ name: null, provider: "glm", baseUrl: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3-flash", timeoutMs: 75_000, thinking: "adaptive", key: "K" });
  });

  it("档位命中：glm 档 key 优先 LLM_API_KEY_GLM、缺省回落 LLM_API_KEY（回切零重配）", async () => {
    const { resolveLlmProfile } = await import("../../worker-main.js");
    expect(resolveLlmProfile({ MODEL_PROFILE: "glm-5.3-flash", LLM_API_KEY: "OLD", LLM_API_KEY_GLM: "NEW" })).toMatchObject({ provider: "glm", model: "glm-5.3-flash", key: "NEW" });
    expect(resolveLlmProfile({ MODEL_PROFILE: "glm-5.3-max", LLM_API_KEY: "OLD" })).toMatchObject({ provider: "glm", model: "glm-5.3-max", key: "OLD" });
  });

  it("qwen 档：独立端点与 secret 名；key 缺失返回 null（不回落 GLM key）", async () => {
    const { resolveLlmProfile } = await import("../../worker-main.js");
    expect(resolveLlmProfile({ MODEL_PROFILE: "qwen3.7-flash", LLM_API_KEY_QWEN: "Q", LLM_API_KEY: "G" })).toMatchObject({ provider: "qwen", baseUrl: "https://ws-i7yvdr80f0iv6wg4.cn-beijing.maas.aliyuncs.com/apps/anthropic", model: "qwen3.7-flash", key: "Q" });
    expect(resolveLlmProfile({ MODEL_PROFILE: "qwen3.7-flash", LLM_API_KEY: "G" }).key).toBeNull();
  });

  it("档位键拼错 → 显式 err（防静默回落旧模型）", async () => {
    const { resolveLlmProfile } = await import("../../worker-main.js");
    const p = resolveLlmProfile({ MODEL_PROFILE: "qwen3.7-flsh", LLM_API_KEY: "K" });
    expect(p.err).toContain("未注册");
  });

  it("llmMessages 按档位起请求（URL/model 来自 profile 而非 LLM_* vars）", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { MODEL_PROFILE: "qwen3.7-flash", LLM_API_KEY_QWEN: "Q", LLM_PROVIDER: "glm", LLM_BASE_URL: "https://legacy.example", LLM_MODEL: "glm-5.3-flash" };
    await llmMessages(env, [{ role: "user", content: "hi" }], []);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("ws-i7yvdr80f0iv6wg4.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages");
    expect(JSON.parse(init.body).model).toBe("qwen3.7-flash");
    expect(init.headers["x-api-key"]).toBe("Q");
  });

  it("档位 secret 未注入 → llmMessages 返回 err（含 secret 名提示），不起请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { err } = await llmMessages({ MODEL_PROFILE: "qwen3.7-flash" }, [{ role: "user", content: "hi" }], []);
    expect(err).toContain("LLM_API_KEY_QWEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
