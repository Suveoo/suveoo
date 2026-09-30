import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";
import { toCents } from "../../worker-main.js";

/** 第二十二期：目标陪伴全链 —— MCP 两段式建目标/存入/调整/放弃 + 月度自动存入 taskDue +
 *  里程碑邮件 + badge 6h 节流扫描（遗留①）+ 战报"自动打理"计数。 */
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
async function registerUser(email, name) {
  await post("/api/auth/email-code", { scene: "register", email });
  const r = await j(await post("/api/auth/register", { email, code: await lastCode(email), name, password: PASSWORD, risk_answers: [3, 3, 3, 3, 3], aml_consented: true }));
  return { ...r, email };
}
const doOp = (uid, input) => env.LEDGER.get(env.LEDGER.idFromName(`u:${uid}`)).fetch("https://x/", {
  method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
  body: JSON.stringify(input),
}).then((r) => r.json());
const defCard = async (uid) => (await doOp(uid, { op: "getCards" })).cards.find((c) => Number(c.is_default) === 1 && c.kind === "debit");
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const mailOf = (tag) => `${tag}-${RUN}@test.dev`;

async function mcpCall(sid, token, id, params) {
  return j(await SELF.fetch(`${BASE}/mcp?sid=${sid}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params }),
  }));
}
const goalDeadline = () => new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

describe("目标陪伴全链（第二十二期）", () => {
  it("① 建目标（两段式）→ 存入跨 25% 里程碑（通知+邮件）→ goal_query 进度富化", async () => {
    const out = await registerUser(mailOf("gl1"), "目标甲");
    const uid = out.user_id, token = out.token;
    const dl = goalDeadline();
    const args1 = { name: "日本旅行", target_amount: "20000.00", deadline: dl };
    const c1 = await mcpCall("gl1", token, 1, { name: "goal_create", arguments: args1 });
    const inner1 = JSON.parse(c1.result.content[0].text);
    expect(inner1.status).toBe("INPUT_REQUIRED");
    expect(inner1.card.action).toBe("goal_create");
    expect(inner1.card.params.monthly_plan).toBeTruthy();
    const c2 = await mcpCall("gl1", token, 2, { name: "goal_create", arguments: { ...args1, grant_hash: inner1.grant.grant_hash } });
    const inner2 = JSON.parse(c2.result.content[0].text);
    expect(inner2.status).toBe("EXECUTED");
    expect(inner2.goal_id).toBeTruthy();
    expect(inner2.summary).toContain("每月");
    /* goal_query（GREEN 自动执行）：0% 进度 */
    const q = JSON.parse((await mcpCall("gl1", token, 3, { name: "goal_query", arguments: {} })).result.content[0].text);
    expect(q.goals).toHaveLength(1);
    expect(q.goals[0].pct).toBe(0);
    expect(q.goals[0].on_track).toBe(true);
    /* 第一笔 ¥900 黄级（日累计未超）；确认执行 */
    const y1 = await mcpCall("gl1", token, 4, { name: "goal_contribute", arguments: { goal_id: inner2.goal_id, amount: "900.00" } });
    const y1i = JSON.parse(y1.result.content[0].text);
    expect(y1i.status).toBe("INPUT_REQUIRED");
    expect(y1i.card.tier).toBe("YELLOW");
    const y2 = await mcpCall("gl1", token, 5, { name: "goal_contribute", arguments: { goal_id: inner2.goal_id, amount: "900.00", grant_hash: y1i.grant.grant_hash } });
    expect(JSON.parse(y2.result.content[0].text).status).toBe("EXECUTED");
    /* 第二笔 ¥900：todayOutCents 已计入第一笔 goal_event（日累计 ¥1800>¥1000）→ 动态升红；
       红级 OTP 全链：拿验证码 → grant+otp 确认 */
    const red = await mcpCall("gl1", token, 6, { name: "goal_contribute", arguments: { goal_id: inner2.goal_id, amount: "900.00" } });
    const redInner = JSON.parse(red.result.content[0].text);
    expect(redInner.status).toBe("INPUT_REQUIRED");
    expect(redInner.card.tier).toBe("RED");
    await post("/api/auth/email-code", { scene: "redstep", email: out.email });
    const code = await lastCode(out.email);
    const red2 = await mcpCall("gl1", token, 7, { name: "goal_contribute", arguments: { goal_id: inner2.goal_id, amount: "900.00", grant_hash: redInner.grant.grant_hash, otp: code } });
    expect(JSON.parse(red2.result.content[0].text).status).toBe("EXECUTED");
    /* held 累计 ¥1800（只锁不消费——余额不变）；存入通知落站内（红级 60s 验证码冷却：本测只用一次 OTP，
       里程碑邮件断言移至 ④ taskDue 自动路径） */
    const card = await defCard(uid);
    expect(BigInt(card.held_cents)).toBe(toCents("1800.00"));
    const notifs = await j(await SELF.fetch(BASE + "/api/notifications", { headers: { authorization: `Bearer ${token}` } }));
    expect((notifs.notifications ?? []).some((n) => (n.title ?? "").includes("目标存入成功"))).toBe(true);
    const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${out.email}`)) ?? "[]");
    expect(mails.some((m) => (m.subject ?? "").includes("目标已建立"))).toBe(true);
  }, 30000);

  it("② 存满 → ACHIEVED 解锁回可用余额（held 清、余额复原）+ 达成邮件", async () => {
    const out = await registerUser(mailOf("gl2"), "目标乙");
    const uid = out.user_id, token = out.token;
    const gArgs = { name: "新电脑", target_amount: "5000.00", deadline: goalDeadline() };
    const c1 = await mcpCall("gl2", token, 1, { name: "goal_create", arguments: gArgs });
    const i1 = JSON.parse(c1.result.content[0].text);
    expect(i1.status).toBe("INPUT_REQUIRED");
    const c1b = await mcpCall("gl2", token, 2, { name: "goal_create", arguments: { ...gArgs, grant_hash: i1.grant.grant_hash } });
    expect(JSON.parse(c1b.result.content[0].text).status).toBe("EXECUTED");
    const gid = (await doOp(uid, { op: "goals" })).goals[0].id;
    const before = await defCard(uid);
    const c2 = await mcpCall("gl2", token, 3, { name: "goal_contribute", arguments: { goal_id: gid, amount: "5000.00" } });
    const i2 = JSON.parse(c2.result.content[0].text);
    expect(i2.card.tier).toBe("RED"); /* ¥5000 单笔即红 */
    await post("/api/auth/email-code", { scene: "redstep", email: out.email });
    const c3 = await mcpCall("gl2", token, 4, { name: "goal_contribute", arguments: { goal_id: gid, amount: "5000.00", grant_hash: i2.grant.grant_hash, otp: await lastCode(out.email) } });
    const i3 = JSON.parse(c3.result.content[0].text);
    expect(i3.status).toBe("EXECUTED");
    expect(i3.achieved).toBe(true); /* MCP EXECUTED 响应字段在顶层（...g.result 展开） */
    const after = await defCard(uid);
    expect(BigInt(after.held_cents)).toBe(0n); /* 达成解锁 */
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents)); /* 只锁不解不消费——余额不变 */
    const g = (await doOp(uid, { op: "goals" })).goals[0];
    expect(g.status).toBe("ACHIEVED");
    expect(g.pct).toBe(100);
    const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${out.email}`)) ?? "[]");
    expect(mails.some((m) => (m.subject ?? "").includes("目标达成"))).toBe(true);
  }, 30000);

  it("③ goal_abandon → 精确解锁退回（其他锁定不动）；调整重算月计划", async () => {
    const out = await registerUser(mailOf("gl3"), "目标丙");
    const uid = out.user_id, token = out.token;
    /* 预置他项锁定 ¥500 */
    await doOp(uid, { op: "fundsLock", amount_cents: String(toCents("500.00")), reason: "other" });
    const gArgs = { name: "婚礼基金", target_amount: "8000.00", deadline: goalDeadline() };
    const c1 = await mcpCall("gl3", token, 1, { name: "goal_create", arguments: gArgs });
    const i1 = JSON.parse(c1.result.content[0].text);
    await mcpCall("gl3", token, 10, { name: "goal_create", arguments: { ...gArgs, grant_hash: i1.grant.grant_hash } });
    const gid = (await doOp(uid, { op: "goals" })).goals[0].id;
    const c2 = await mcpCall("gl3", token, 2, { name: "goal_contribute", arguments: { goal_id: gid, amount: "2000.00" } });
    const i2 = JSON.parse(c2.result.content[0].text);
    expect(i2.card.tier).toBe("RED"); /* ¥2000>¥1000 单笔升红 */
    await post("/api/auth/email-code", { scene: "redstep", email: out.email });
    const c3 = await mcpCall("gl3", token, 3, { name: "goal_contribute", arguments: { goal_id: gid, amount: "2000.00", grant_hash: i2.grant.grant_hash, otp: await lastCode(out.email) } });
    expect(JSON.parse(c3.result.content[0].text).status).toBe("EXECUTED");
    const mid = await defCard(uid);
    expect(BigInt(mid.held_cents)).toBe(toCents("2500.00"));
    /* 调整：目标 8000→10000 → 月计划按原时间线重算（REST PATCH 两段式）*/
    const a1 = await j(await SELF.fetch(BASE + `/api/goals/${gid}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ target_amount: "10000.00" }) }));
    expect(a1.status).toBe("INPUT_REQUIRED");
    const a2 = await j(await SELF.fetch(BASE + `/api/goals/${gid}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ target_amount: "10000.00", grant_hash: a1.grant.grant_hash }) }));
    expect(a2.status).toBe("EXECUTED");
    const gAdj = (await doOp(uid, { op: "goals" })).goals[0];
    expect(gAdj.target).toBe("10000.00");
    /* 放弃：解锁 2000（他项 500 保留）*/
    const b1 = await mcpCall("gl3", token, 4, { name: "goal_abandon", arguments: { goal_id: gid } });
    const i4 = JSON.parse(b1.result.content[0].text);
    expect(i4.card.params.goal_name).toBe("婚礼基金");
    const b2 = await mcpCall("gl3", token, 5, { name: "goal_abandon", arguments: { goal_id: gid, grant_hash: i4.grant.grant_hash } });
    const i5 = JSON.parse(b2.result.content[0].text);
    expect(i5.status).toBe("EXECUTED");
    expect(i5.unlocked).toBe("2000.00");
    const after = await defCard(uid);
    expect(BigInt(after.held_cents)).toBe(toCents("500.00")); /* 他项锁定原封 */
    expect((await doOp(uid, { op: "goals" })).goals[0].status).toBe("ABANDONED");
  }, 30000);

  it("④ 月度自动存入：scheduled_task_create(goal_contribution) → taskDue → 锁定+事件+completed_at+战报自动打理+1", async () => {
    const out = await registerUser(mailOf("gl4"), "目标丁");
    const uid = out.user_id, token = out.token;
    const gArgs = { name: "应急金", target_amount: "6000.00", deadline: goalDeadline() };
    const c1 = await mcpCall("gl4", token, 1, { name: "goal_create", arguments: gArgs });
    const i1 = JSON.parse(c1.result.content[0].text);
    await mcpCall("gl4", token, 10, { name: "goal_create", arguments: { ...gArgs, grant_hash: i1.grant.grant_hash } });
    const gid = (await doOp(uid, { op: "goals" })).goals[0].id;
    const tArgs = { task_type: "goal_contribution", goal_id: gid, amount: "1500.00", execute_at: new Date(Date.now() + 3600_000).toISOString(), repeat: "monthly" };
    const t1 = await mcpCall("gl4", token, 2, { name: "scheduled_task_create", arguments: tArgs });
    const it1 = JSON.parse(t1.result.content[0].text);
    expect(it1.status).toBe("INPUT_REQUIRED");
    expect(it1.card.params.goal_name).toBe("应急金");
    const before = await defCard(uid);
    expect(it1.card.tier).toBe("RED"); /* ¥1500>¥1000 且当日执行（执行日口径计今日累计）→ 红 */
    await post("/api/auth/email-code", { scene: "redstep", email: out.email });
    const t2 = await mcpCall("gl4", token, 3, { name: "scheduled_task_create", arguments: { ...tArgs, grant_hash: it1.grant.grant_hash, otp: await lastCode(out.email) } });
    expect(JSON.parse(t2.result.content[0].text).status).toBe("EXECUTED");
    expect(BigInt((await defCard(uid)).held_cents)).toBe(0n); /* 建单不预锁 */
    const tasks = await doOp(uid, { op: "tasks" });
    const task = tasks.tasks.find((t) => t.type === "goal_contribution" && t.status === "PENDING");
    expect(task).toBeTruthy();
    /* 到期执行：锁 1500 + 事件 + monthly RESCHEDULED + completed_at 戳 */
    const due = await doOp(uid, { op: "taskDue", id: task.id });
    expect(due.outcome).toBe("RESCHEDULED");
    const after = await defCard(uid);
    expect(BigInt(after.held_cents)).toBe(toCents("1500.00"));
    expect(BigInt(after.balance_cents)).toBe(BigInt(before.balance_cents)); /* 只锁不消费 */
    const g = (await doOp(uid, { op: "goals" })).goals[0];
    expect(g.saved).toBe("1500.00");
    expect(g.pct).toBe(25); /* 跨第一档里程碑 → 站内+邮件+TG（#goalTouch auto 路径） */
    const mails4 = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${out.email}`)) ?? "[]");
    expect(mails4.some((m) => (m.subject ?? "").includes("25%") && (m.text ?? "").includes("月度自动存入"))).toBe(true);
    const tAfter = (await doOp(uid, { op: "tasks" })).tasks.find((t) => t.id === task.id);
    expect(tAfter.completed_at).toBeTruthy();
    expect(tAfter.status).toBe("PENDING"); /* monthly 轮转 */
    /* 战报 routine_count 纳入目标月度自动存入 */
    const pp = await doOp(uid, { op: "proposalPage", force: true });
    expect(Number(pp.report.routine_count ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(pp.report.goal_auto_count ?? 0)).toBe(1);
    /* 取消任务：无预锁资金 → held 不变 */
    await doOp(uid, { op: "taskCancel", id: task.id });
    expect(BigInt((await defCard(uid)).held_cents)).toBe(toCents("1500.00"));
  }, 30000);

  it("⑤ badge 6h 节流扫描（遗留①）：stale 触发扫描出新提议、6h 内不重复", async () => {
    const out = await registerUser(mailOf("gl5"), "目标戊");
    const uid = out.user_id;
    /* 构造 off-track：建目标后回拨 created_at 40 天（DEMO_MODE 测试亲和 op，同 taskInjectFailure 先例）*/
    const dl = new Date(Date.now() + 140 * 86400000).toISOString().slice(0, 10);
    await doOp(uid, { op: "goalCreate", name: "购房首付", target_cents: "3000000", deadline: dl });
    const g = (await doOp(uid, { op: "goals" })).goals[0];
    await doOp(uid, { op: "goalBackdate", id: g.id, days: 40 });
    /* prop_scan_at 老化 7h → badge 触发扫描 → goal_offtrack 提议落库 */
    await doOp(uid, { op: "propScanAge", hours: 7 });
    const b1 = await doOp(uid, { op: "proposalBadge", since: "" });
    expect(b1.added).toBeGreaterThanOrEqual(1);
    expect(b1.top?.rule).toBe("goal_offtrack");
    /* 6h 内再拉：不再扫描（added=0，扫描戳未动）*/
    const b2 = await doOp(uid, { op: "proposalBadge", since: "" });
    expect(b2.added).toBe(0);
    expect(b2.scanned_at).toBe(b1.scanned_at);
  }, 30000);

  it("⑥ 提议 settle 事实核验：goal_offtrack 须有提议后新存入；REST 通道建目标（表单通道同守卫）", async () => {
    const out = await registerUser(mailOf("gl6"), "目标己");
    const uid = out.user_id, token = out.token;
    /* REST 建目标（表单通道） */
    const r1 = await j(await post("/api/goals", { name: "旅行", target_amount: "12000.00", deadline: goalDeadline() }, token));
    expect(r1.status).toBe("INPUT_REQUIRED");
    const r2 = await j(await post("/api/goals", { name: "旅行", target_amount: "12000.00", deadline: goalDeadline(), grant_hash: r1.grant.grant_hash }, token));
    expect(r2.status).toBe("EXECUTED");
    const gid = (await doOp(uid, { op: "goals" })).goals[0].id;
    /* 回拨 40 天 + 强扫 → off-track 提议 */
    await doOp(uid, { op: "goalBackdate", id: gid, days: 40 });
    const pp = await doOp(uid, { op: "proposalPage", force: true });
    const prop = (pp.proposals ?? []).find((p) => p.rule === "goal_offtrack");
    expect(prop).toBeTruthy();
    /* settle 前置核验：无新存入 → NOT_EXECUTED */
    const s1r = await post(`/api/proposals/${prop.id}/settle`, {}, token);
    expect(s1r.status).toBe(409);
    expect((await j(s1r)).error.code).toBe("NOT_EXECUTED");
    /* REST 存入后再 settle → EXECUTED（金额进 catchup） */
    const cArgs = { amount: prop.params.catchup };
    const c1 = await j(await post(`/api/goals/${gid}/contribute`, cArgs, token));
    expect(c1.status).toBe("INPUT_REQUIRED");
    expect(c1.tier).toBe("RED"); /* catchup>¥1000 升红 */
    await post("/api/auth/email-code", { scene: "redstep", email: out.email });
    const c2 = await j(await post(`/api/goals/${gid}/contribute`, { ...cArgs, grant_hash: c1.grant.grant_hash, otp: await lastCode(out.email) }, token));
    expect(c2.status).toBe("EXECUTED");
    const s2 = await j(await post(`/api/proposals/${prop.id}/settle`, {}, token));
    expect(s2.ok).toBe(true);
    expect((s2.proposal ?? {}).status).toBe("EXECUTED");
  }, 30000);
});

/** 第二十三期：auto_monthly 一站式（建目标勾选→月度任务挂上；调整关→任务取消） */
describe("goal auto_monthly（第二十三期）", () => {
  it("create with auto_monthly wires the monthly task in one confirm; adjust off cancels it", async () => {
    const out = await registerUser(mailOf("auto"), "勾选验收");
    const token = out.token, uid = out.user_id;
    const d1 = await j(await post("/api/goals", { name: "婚礼基金", target_amount: "30000.00", deadline: "2027-06-30", auto_monthly: true }, token));
    expect(d1.status).toBe("INPUT_REQUIRED");
    const c1 = await j(await post("/api/goals", { name: "婚礼基金", target_amount: "30000.00", deadline: "2027-06-30", auto_monthly: true, grant_hash: d1.grant.grant_hash }, token));
    expect(c1.status).toBe("EXECUTED");
    expect(c1.result.auto_monthly).toBe(true);
    const gid = c1.result.goal_id;
    const tasks1 = (await doOp(uid, { op: "tasks" })).tasks.filter((t) => t.type === "goal_contribution" && JSON.stringify(t.payload).includes(`"goal_id":${gid}`) && t.status === "PENDING");
    expect(tasks1.length).toBe(1);
    const goals1 = (await doOp(uid, { op: "goals" })).goals.find((g) => g.id === gid);
    expect(goals1.has_monthly_task).toBe(true);
    /* 调整：只关自动（不改金额/日期）→ auto_monthly:false 走 PATCH goal_adjust */
    const a1 = await j(await SELF.fetch(BASE + `/api/goals/${gid}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ auto_monthly: false }) }));
    expect(a1.status).toBe("INPUT_REQUIRED");
    const a2 = await j(await SELF.fetch(BASE + `/api/goals/${gid}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ auto_monthly: false, grant_hash: a1.grant.grant_hash }) }));
    expect(a2.status).toBe("EXECUTED");
    const tasks2 = (await doOp(uid, { op: "tasks" })).tasks.filter((t) => t.type === "goal_contribution" && JSON.stringify(t.payload).includes(`"goal_id":${gid}`) && t.status === "PENDING");
    expect(tasks2.length).toBe(0);
    const goals2 = (await doOp(uid, { op: "goals" })).goals.find((g) => g.id === gid);
    expect(goals2.has_monthly_task).toBe(false);
  }, 30000);
});
