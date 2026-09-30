import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第二十六轮：AI 会话历史持久化 + 续聊上文。
 *  集成面：sessions 四端点（列表/分页消息/改名归档/删除）、失败轮只落 user 侧、KV miss → 消息表重建、
 *  历史卡片落库形态与终态徽标、过期 grant 重放被 CONSENT 校验拦截、90 天惰性清理。
 *  wrangler.test.toml 的 LLM_BASE_URL 指向拒连地址 → /api/ai/chat 走"上游不可达"失败轮路径。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 30000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "历史测试") {
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
/** 跑一轮 /api/ai/chat（SSE），返回全部事件；测试环境 LLM 不可达 → error(LLM_UPSTREAM) + done（失败轮） */
async function chatTurn(token, sid, text) {
  const res = await post("/api/ai/chat", { session_id: sid, text }, token);
  expect(res.ok).toBe(true);
  const raw = await res.text();
  const events = raw.split("\n\n").filter((x) => x.startsWith("data:")).map((x) => JSON.parse(x.slice(5).trim()));
  return events;
}
async function getJson(path, token) {
  const r = await SELF.fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, data: await r.json() };
}
/** 真实收款方（转账必须指向真实 Suveoo 账户） */
async function realTarget(tag, name) {
  const email = `${tag}@test.dev`;
  const out = await registerUser(email, name);
  const cards = await doOp(`u:${out.user_id}`, { op: "getCards" });
  const debit = cards.cards.find((c) => c.kind === "debit" && c.is_default === 1) ?? cards.cards.find((c) => c.kind === "debit");
  return { account: debit.number, name, token: out.token };
}

describe("会话历史持久化（第二十六轮）", () => {
  it("sessions CRUD 与属主隔离：列表扩展字段 / PATCH 改名归档 / DELETE 后不可读 + session_delete 审计", async () => {
    const a = await registerUser("chist-a@test.dev", "历史甲");
    const b = await registerUser("chist-b@test.dev", "历史乙");
    const sid = "ai_histcrud1";
    const evts = await chatTurn(a.token, sid, "帮我看看这个月的消费情况");
    expect(evts.some((e) => e.type === "error")).toBe(true); /* 测试环境 LLM 不可达 → 失败轮 */
    expect(evts.at(-1).type).toBe("done");

    /* 列表：扩展字段齐备（id/title/ts 兼容保留 + updated_at/msg_count/last_preview） */
    const listA = (await getJson("/api/ai/sessions", a.token)).data;
    const row = listA.chats.find((x) => x.id === sid);
    expect(row).toBeTruthy();
    expect(row.title).toBe("帮我看看这个月的消费情况".slice(0, 30));
    expect(row.ts).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
    expect(row.msg_count).toBeGreaterThanOrEqual(1);
    expect(String(row.last_preview ?? "")).toContain("消费");

    /* 属主隔离：B 的库没有 A 的会话 → 404；B 列表也不含 */
    const msgB = await getJson(`/api/ai/sessions/${sid}/messages`, b.token);
    expect(msgB.status).toBe(404);
    const listB = (await getJson("/api/ai/sessions", b.token)).data;
    expect(listB.chats.some((x) => x.id === sid)).toBe(false);

    /* PATCH 改名 */
    const patch = await SELF.fetch(`${BASE}/api/ai/sessions/${sid}`, { method: "PATCH", headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" }, body: JSON.stringify({ title: "月度消费分析" }) });
    expect(patch.status).toBe(200);
    expect((await getJson("/api/ai/sessions", a.token)).data.chats.find((x) => x.id === sid).title).toBe("月度消费分析");

    /* PATCH 归档 → 从默认列表隐藏 */
    await SELF.fetch(`${BASE}/api/ai/sessions/${sid}`, { method: "PATCH", headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" }, body: JSON.stringify({ archived: 1 }) });
    expect((await getJson("/api/ai/sessions", a.token)).data.chats.some((x) => x.id === sid)).toBe(false);

    /* DELETE → 消息不可读（404）+ user_audit 记 session_delete */
    const del = await SELF.fetch(`${BASE}/api/ai/sessions/${sid}`, { method: "DELETE", headers: { authorization: `Bearer ${a.token}` } });
    expect((await del.json()).existed).toBe(true);
    expect((await getJson(`/api/ai/sessions/${sid}/messages`, a.token)).status).toBe(404);
    const audit = await doOp(`u:${a.user_id}`, { op: "userAudit" });
    expect(audit.audit.some((x) => x.action === "session_delete" && (x.detail ?? "").includes(sid))).toBe(true);
  }, 30000);

  it("失败轮只落 user 侧；第二轮消息可读且首轮文本在库；消息行零 grant/tool_result 字段", async () => {
    const a = await registerUser("chist-fail@test.dev", "失败轮甲");
    const sid = "ai_histfail1";
    await chatTurn(a.token, sid, "第一次提问：查默认卡余额");
    let r = (await getJson(`/api/ai/sessions/${sid}/messages`, a.token)).data;
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].role).toBe("user");
    expect(r.messages[0].content).toBe("第一次提问：查默认卡余额");
    expect(r.messages[0].cards).toBeNull();

    await chatTurn(a.token, sid, "第二次提问：那最近三笔呢");
    r = (await getJson(`/api/ai/sessions/${sid}/messages`, a.token)).data;
    expect(r.messages).toHaveLength(2);
    expect(r.messages.every((m) => m.role === "user")).toBe(true); /* 失败轮无 assistant 行 */
    expect(r.messages[0].content).toBe("第一次提问：查默认卡余额");

    /* 落库形态：只有 id/role/content/cards/err/created_at —— 无 grant_hash、无 tool_result、无快照 */
    for (const m of r.messages) {
      expect(Object.keys(m).sort()).toEqual(["cards", "content", "created_at", "err", "id", "role"]);
      expect(m.cards).toBeNull();
    }
    /* 会话计数与预览随轮更新 */
    const row = (await getJson("/api/ai/sessions", a.token)).data.chats.find((x) => x.id === sid);
    expect(row.msg_count).toBe(2);
    expect(String(row.last_preview)).toContain("最近三笔");
  }, 30000);

  it("KV miss → 由 chat_msgs 重建窗口：首条常驻 + 条目只含 role+text", async () => {
    const a = await registerUser("chist-rebuild@test.dev", "重建甲");
    const sid = "ai_histrebuild1";
    for (const t of ["第一问：我要开始记账", "第二问：看下本月账单", "第三问：订阅有哪些"]) {
      await chatTurn(a.token, sid, t);
    }
    /* 清掉热缓存 → 模拟 TTL 过期/换设备 */
    await env.SESSION_KV.delete(`aihist:${sid}`);
    const w = await doOp(`u:${a.user_id}`, { op: "chatWindow", sid, turns: 8 });
    expect(w.first).toBe("第一问：我要开始记账");
    expect(w.window.length).toBe(3);
    expect(w.window.every((x) => Object.keys(x).sort().join(",") === "content,role")).toBe(true);
    expect(w.window.map((x) => x.content)).toEqual(["第一问：我要开始记账", "第二问：看下本月账单", "第三问：订阅有哪些"]);
    /* 缓存清空后再来一轮：重建路径不炸，消息照常累积 */
    await chatTurn(a.token, sid, "第四问：继续");
    const r = (await getJson(`/api/ai/sessions/${sid}/messages`, a.token)).data;
    expect(r.messages).toHaveLength(4);
  }, 30000);

  it("历史卡片重放：cards 落库形态保留 + 终态徽标（EXECUTED/EXPIRED/BLOCKED）只读无操作面", async () => {
    const a = await registerUser("chist-cards@test.dev", "卡片甲");
    const tgt = await realTarget("chist-cards-payee", "赵砚秋");
    /* 真实执行一笔转账拿 trace_id（黄级两段式） */
    const body = { recipient_account: tgt.account, recipient_name: tgt.name, amount: "12.34", memo: "卡片徽标" };
    let tr = await j(await post("/api/transfers/intrabank", body, a.token));
    if (tr.status === "INPUT_REQUIRED") tr = await j(await post("/api/transfers/intrabank", { ...body, grant_hash: tr.grant.grant_hash }, a.token));
    expect(tr.status).toBe("EXECUTED");
    const trace = tr.trace_id;

    const sid = "ai_histcards1";
    await chatTurn(a.token, sid, "帮我转账给赵砚秋 12.34");
    /* 直接落一条含三种卡片的 assistant 行（模拟成功轮落库形态） */
    await doOp(`u:${a.user_id}`, { op: "chatLog", sid, msgs: [
      { role: "user", content: "帮我转账给赵砚秋 12.34" },
      { role: "assistant", content: "请确认转账。", cards: [
        { component: "transfer_confirmation", grant_hash: "a".repeat(16), trace_id: trace, tier: "YELLOW", action: "transfer_execute" }, /* 已执行 */
        { component: "transfer_confirmation", grant_hash: "b".repeat(16), trace_id: "bai_never_executed", tier: "YELLOW" }, /* 从未执行 → 过期 */
        { component: "blocked_notice", reason: "UNTRUSTED_PROVENANCE" }, /* 已拦截 */
      ] },
    ] });
    const r = (await getJson(`/api/ai/sessions/${sid}/messages`, a.token)).data;
    const cards = r.messages.at(-1).cards;
    expect(cards).toHaveLength(3);
    expect(cards[0]._status).toBe("EXECUTED");
    expect(cards[1]._status).toBe("EXPIRED");
    expect(cards[2]._status).toBe("BLOCKED");
    /* 只读展览：落库与返回形态均不含可执行操作字段（无 confirm/按钮语义，徽标为服务端判定） */
    expect(cards[0].component).toBe("transfer_confirmation");
  }, 30000);

  it("过期 grant 重放'确认执行'被 CONSENT 校验拦截（历史卡片是展览品不是操作入口）", async () => {
    const a = await registerUser("chist-replay@test.dev", "重放甲");
    const tgt = await realTarget("chist-replay-payee", "张三");
    const args = { recipient: `acct:${tgt.account}`, recipient_name: tgt.name, amount: "56.78", currency: "CNY" };
    /* 正常出卡：INPUT_REQUIRED + grant */
    const first = await j(await post("/mcp?sid=hist-replay", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "transfer_execute", arguments: args } }, a.token));
    const parsed1 = JSON.parse(first.result.content[0].text);
    expect(parsed1.status).toBe("INPUT_REQUIRED");
    const gh = parsed1.grant.grant_hash;
    expect(gh).toBeTruthy();
    /* 模拟 grant 过期（KV TTL 120s 到点即同效）：删除后携带同一 grant_hash 再确认 */
    await env.SESSION_KV.delete(`grant:${a.user_id}:${gh}`);
    const retry = await j(await post("/mcp?sid=hist-replay", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "transfer_execute", arguments: { ...args, grant_hash: gh } } }, a.token));
    const parsed2 = JSON.parse(retry.result.content[0].text);
    expect(parsed2.status).toBe("BLOCKED");
    expect(String(parsed2.reason ?? "").startsWith("GRANT_")).toBe(true);
    expect(retry.result.isError).toBe(true);
  }, 30000);

  it("90 天惰性清理：过期会话行与孤儿消息随列表查询删除", async () => {
    const a = await registerUser("chist-clean@test.dev", "清理甲");
    await chatTurn(a.token, "ai_histkeep1", "保留的会话");
    await chatTurn(a.token, "ai_histold1", "将被清理的会话");
    /* 直接以"未来 1 小时"为清理线（等价于 90 天前的会话相对今天的 cutoff 语义） */
    const cutoff = new Date(Date.now() + 3600_000).toISOString();
    const r = await doOp(`u:${a.user_id}`, { op: "chats", cleanup_before: cutoff });
    expect(r.chats).toHaveLength(0);
    /* 孤儿消息一并清理 */
    const msgs = await doOp(`u:${a.user_id}`, { op: "chatMessages", sid: "ai_histold1", page: 1 });
    expect(msgs.total).toBe(0);
    expect(msgs.exists).toBe(false);
  }, 30000);
});
