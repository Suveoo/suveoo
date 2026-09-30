import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** AI 主动银行（第六期 idle）：提议扫描 → 展示 → 执行（既有 intent 两段式）→ settle 核销 → 战报聚合。
 *  执行通道零新资金动作：订阅退订/预约转账/自动扣款全部走既有守卫与确认卡。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
async function patch(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true });
  return j(r);
}
const DO = (uid, payload) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" }, body: JSON.stringify(payload),
}).then((r) => r.json());

describe("AI 主动银行：提议全链路", () => {
  it("扫描产出提议（dedup 幂等）→ dismiss 挡重生 → 执行退订两段式 → settle 核销 → 战报累计", async () => {
    const me = await registerUser("prop1@test.dev", "提议甲");
    const payee = await registerUser("prop1pay@test.dev", "收款寅");
    const H = { authorization: `Bearer ${me.token}` };
    const uid = me.user_id;
    const payeeCards = (await env.LEDGER.get(env.LEDGER.idFromName(`u:${payee.user_id}`)).fetch("https://x/", {
      method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" }, body: JSON.stringify({ op: "getCards" }),
    }).then((r) => r.json())).cards;
    const payeeDebit = payeeCards.find((c) => c.kind === "debit");

    /* 灌最小账本：沉睡订阅×2、燃气/物业无自动扣款、每月 1 日 ¥100 给收款寅（连续 3 月） */
    const DAY = 86400000;
    const now = Date.now();
    const mIso = (monthsAgo) => new Date(now - monthsAgo * 30 * DAY).toISOString();
    await DO(uid, { op: "seedDemo",
      txs: [0, 1, 2].flatMap((k) => [{ ts: mIso(k), amount_cents: "10000", direction: "OUT", counterparty: "收款寅", memo: "月度惯例", status: "SUCCESS", channel: "form", trace_id: null, category: "转账" }]),
      payees: [{ name: "收款寅", account: payeeDebit.number, group_label: "朋友", email: null }],
      bills: [
        { id: "gas", name: "燃气费", category: "生活服务", amount_cents: "8635", due_day: 9, autopay: 0 },
        { id: "prop", name: "物业费", category: "住房", amount_cents: "41270", due_day: 25, autopay: 0 },
      ],
      subs: [
        { id: "keep", merchant: "Keep", plan: "月卡", amount_cents: "1600", cycle: "月", usage_score: 6, dark_pattern_note: null, reminders: 1 },
        { id: "yt", merchant: "YouTube Premium", plan: "个人版", amount_cents: "6900", cycle: "月", usage_score: 8, dark_pattern_note: null, reminders: 1 },
      ],
      holdings: [], notifs: [], tasks: [],
    });

    /* ① 首访触发扫描：4 类规则命中（SAVE×2 / ROUTINE×1 / GUARD×2）+ 新提议通知邮件 */
    const p1 = await j(await SELF.fetch(BASE + "/api/proposals", { headers: H }));
    expect(p1.ok).toBe(true);
    const pend1 = p1.proposals.filter((p) => p.status === "PENDING");
    expect(p1.added).toBeGreaterThanOrEqual(5);
    expect(pend1.some((p) => p.rule === "dormant_sub" && p.target === "keep")).toBe(true);
    expect(pend1.some((p) => p.rule === "routine_transfer" && p.target === "收款寅")).toBe(true);
    expect(pend1.filter((p) => p.rule === "bill_autopay")).toHaveLength(2);
    const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:prop1@test.dev`)) ?? "[]");
    expect(mails.some((m) => m.subject.includes("AI 为你发现"))).toBe(true);

    /* ② 二次访问：dedup 幂等（不再新增、不重复通知） */
    const p2 = await j(await SELF.fetch(BASE + "/api/proposals", { headers: H }));
    expect(p2.added).toBe(0);

    /* ②b 徽标端点（第七期 idle 凸显机制）：只读不扫描；无 since=全部视为新；since 之后 → 0；
       top 供速览行（rule/params 齐全）；未鉴权 401 */
    const b1 = await j(await SELF.fetch(BASE + "/api/proposals/badge", { headers: H }));
    expect(b1.ok).toBe(true);
    expect(b1.pending).toBeGreaterThanOrEqual(5);
    expect(b1.fresh).toBe(b1.pending);
    expect(b1.top?.rule).toBeTruthy();
    expect(b1.top?.params).toBeTruthy();
    expect(b1.report.month).toBeTruthy();
    const b2 = await j(await SELF.fetch(BASE + "/api/proposals/badge?since=2999-01-01T00:00:00.000Z", { headers: H }));
    expect(b2.fresh).toBe(0);
    expect(b2.pending).toBe(b1.pending);
    const anonB = await SELF.fetch(BASE + "/api/proposals/badge");
    expect(anonB.status).toBe(401);

    /* ③ settle 前置核验：未执行直接 settle → 409 NOT_EXECUTED（防"假装完成"） */
    const keepId = pend1.find((p) => p.rule === "dormant_sub" && p.target === "keep").id;
    const early = await post(`/api/proposals/${keepId}/settle`, {}, me.token);
    expect(early.status).toBe(409);
    expect((await early.json()).error.code).toBe("NOT_EXECUTED");

    /* ④ 执行 Keep 退订（既有 intent 黄级两段式）→ settle 核销 EXECUTED + impact 入战报 */
    const c1 = await j(await post("/api/subscriptions/keep/cancel", {}, me.token));
    expect(c1.status).toBe("INPUT_REQUIRED");
    const c2 = await j(await post("/api/subscriptions/keep/cancel", { grant_hash: c1.grant.grant_hash }, me.token));
    expect(c2.status).toBe("EXECUTED");
    const s1 = await j(await post(`/api/proposals/${keepId}/settle`, {}, me.token));
    expect(s1.ok).toBe(true);
    expect(s1.proposal.status).toBe("EXECUTED");
    expect(s1.proposal.impact_cents).toBe("1600");
    expect(s1.report.saved_cents).toBe("1600");
    expect(s1.report.done_count).toBe(1);

    /* ⑤ dismiss：状态置 DISMISSED，force 重扫不复活（dedup_key 同月挡住） */
    const ytId = pend1.find((p) => p.rule === "dormant_sub" && p.target === "yt").id;
    const d1 = await j(await post(`/api/proposals/${ytId}/dismiss`, {}, me.token));
    expect(d1.ok).toBe(true);
    const rescan = await DO(uid, { op: "proposalPage", force: true });
    expect(rescan.proposals.filter((p) => p.rule === "dormant_sub" && p.target === "yt" && p.status === "PENDING")).toHaveLength(0);
    expect(rescan.proposals.filter((p) => p.rule === "dormant_sub" && p.target === "keep").length).toBe(1); /* EXECUTED 行仍在（战报） */

    /* ⑥ ROUTINE：按提议 exec.args 建预约（¥100 黄级）→ settle 核验任务存在 */
    const rt = pend1.find((p) => p.rule === "routine_transfer");
    const r1 = await j(await post("/api/schedules", rt.params.exec.args, me.token));
    expect(r1.status).toBe("INPUT_REQUIRED");
    const r2 = await j(await post("/api/schedules", { ...rt.params.exec.args, grant_hash: r1.grant.grant_hash }, me.token));
    expect(r2.status).toBe("EXECUTED");
    const s2 = await j(await post(`/api/proposals/${rt.id}/settle`, {}, me.token));
    expect(s2.ok).toBe(true);
    expect(s2.report.routine_count).toBe(1);
    expect(s2.report.done_count).toBe(2);

    /* ⑦ GUARD：开启燃气自动扣款（PATCH 两段式）→ settle */
    const bp = pend1.find((p) => p.rule === "bill_autopay" && p.target === "gas");
    const a1 = await j(await patch("/api/bills/gas/autopay", { enabled: true }, me.token));
    expect(a1.status).toBe("INPUT_REQUIRED");
    const a2 = await j(await patch("/api/bills/gas/autopay", { enabled: true, grant_hash: a1.grant.grant_hash }, me.token));
    expect(a2.status).toBe("EXECUTED");
    const s3 = await j(await post(`/api/proposals/${bp.id}/settle`, {}, me.token));
    expect(s3.ok).toBe(true);
    expect(s3.report.done_count).toBe(3);
    expect(s3.report.saved_cents).toBe("1600"); /* GUARD 不计入"省下" */

    /* ⑧ MCP proposal_list：剩余 PENDING 如实可查（AI 只有查询权） */
    const mcp = await j(await post("/mcp?sid=t1", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "proposal_list", arguments: {} } }, me.token));
    const tool = JSON.parse(mcp.result.content[0].text);
    expect(Array.isArray(tool.proposals)).toBe(true);
    expect(tool.url).toBe("https://suveoo.com/ai/proposals");
    expect(tool.proposals.every((p) => p.status === undefined || p.tier)).toBe(true);
  }, 60000);
});
