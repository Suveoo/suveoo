import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import { SELF, env } from "cloudflare:test";

/** 第一百二十六轮：卡片挂失全链路。
 * 覆盖：红级 REST 全链（INPUT_REQUIRED → OTP → EXECUTED：扣费/tx/冻结/loss 行/通知）；
 * 守卫（重复挂失、同卡支付、缺地址、挂失中解冻 LOSS_ACTIVE）；激活恢复（DO 直调，规避 redstep 60s 冷却）。 */
const BASE = "https://suveoo.com";
const PASSWORD = TEST_PASSWORD;

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 20000);
}
const j = (r) => r.json();
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const mails = JSON.parse((await env.MAIL_OUTBOX.get("outbox:" + email)) ?? "[]");
  const code = (mails.at(-1)?.text ?? "").match(/\b\d{6}\b/)?.[0] ?? null;
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
const cardsOf = async (uid) => (await doOp("u:" + uid, { op: "getCards" })).cards;
const lossesOf = async (uid) => (await doOp("u:" + uid, { op: "getLosses" })).losses;
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get("outbox:" + email)) ?? "[]");
  return (mails.at(-1)?.text ?? "").match(/\b\d{6}\b/)?.[0] ?? null;
}

describe("卡片挂失全链路", () => {
  it("补办挂失红级全链：扣 ¥53 + tx(生活服务) + 卡冻结 + loss 行 + 通知；激活后一切恢复", async () => {
    const a = await registerUser("loss1@test.dev", "挂失甲");
    const uid = a.user_id, email = "loss1@test.dev";
    const cards = await cardsOf(uid);
    const def = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const target = cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    /* ① 红级第一段：INPUT_REQUIRED（确认卡快照含补办/地址/付款卡展示） */
    const r1 = await j(await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: true, mailTo: "上海市静安区南京西路 100 号 张三 13800001111", payCard: def.slug }, a.token));
    expect(r1.status).toBe("INPUT_REQUIRED");
    expect(r1.grant.snapshot.params.replace_new).toBe(true);
    expect(r1.grant.snapshot.params.pay_card).toBe(def.slug);
    /* ② grant 重试 → OTP_REQUIRED（红级）→ 发码带 otp → EXECUTED */
    const r2 = await j(await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: true, mailTo: "上海市静安区南京西路 100 号 张三 13800001111", payCard: def.slug, grant_hash: r1.grant.grant_hash }, a.token));
    expect(r2.status).toBe("OTP_REQUIRED");
    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    expect(otp).toBeTruthy();
    const r3 = await j(await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: true, mailTo: "上海市静安区南京西路 100 号 张三 13800001111", payCard: def.slug, grant_hash: r1.grant.grant_hash, otp }, a.token));
    expect(r3.status).toBe("EXECUTED");
    expect(r3.result.total).toBe("53.00");
    expect(r3.result.tx_id).toMatch(/^TXL/);
    /* ③ DO 断言：付款卡扣 ¥53、目标卡冻结、loss 行 requested、tx 归类生活服务挂目标付款卡 */
    const after = await cardsOf(uid);
    expect(after.find((c) => c.slug === def.slug).balance_cents).toBe(String(BigInt(def.balance_cents) - 5300n));
    expect(after.find((c) => c.slug === target.slug).status).toBe("FROZEN");
    const lossRow = (await lossesOf(uid)).find((l) => l.card_slug === target.slug && l.status === "requested");
    expect(lossRow).toBeTruthy();
    expect(Number(lossRow.fee_report)).toBe(2000);
    expect(Number(lossRow.fee_reissue) + Number(lossRow.fee_ship)).toBe(3300);
    expect(lossRow.mail_to).toContain("南京西路");
    const hist = await j(await SELF.fetch(BASE + "/api/transfers?scope=all", { headers: { authorization: `Bearer ${a.token}` } }));
    const feeTx = hist.txs.find((t) => t.counterparty === "Suveoo 卡片服务");
    expect(feeTx?.category).toBe("生活服务");
    expect(feeTx?.card).toBe(def.slug);
    expect(feeTx?.amount_cents).toBe("5300");
    const notifs = (await doOp("u:" + uid, { op: "notifications" })).notifications ?? [];
    expect(notifs.some((n) => n.title === "卡片挂失已受理" && n.body.includes(target.slug))).toBe(true);
    /* ④ 挂失中解冻被拒（LOSS_ACTIVE，须走挂失页签收激活） */
    const unf = await doOp("u:" + uid, { op: "setCardStatus", slug: target.slug, status: "ACTIVE" });
    expect(unf.ok).toBe(false);
    expect(unf.error).toBe("LOSS_ACTIVE");
    /* ⑤ 重复挂失被拒（BIZ_REJECT ALREADY_LOST，不出确认卡） */
    const dup = await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: false, payCard: def.slug }, a.token);
    expect(dup.status).toBe(400);
    expect((await j(dup)).reason).toBe("ALREADY_LOST");
    /* ⑥ 激活恢复（DO 直调：redstep 同邮箱 60s 冷却，REST 红级链路已在①-②验证） */
    const act = await doOp("u:" + uid, { op: "cardLossActivate", slug: target.slug });
    expect(act.ok).toBe(true);
    const restored = await cardsOf(uid);
    expect(restored.find((c) => c.slug === target.slug).status).toBe("ACTIVE");
    const row2 = (await lossesOf(uid)).find((l) => l.card_slug === target.slug);
    expect(row2.status).toBe("activated");
    expect(row2.activated_at).toBeTruthy();
  }, 30000);

  it("守卫矩阵：缺补办地址 / 付款卡=挂失卡 / 付款卡不可用 / 无挂失激活", async () => {
    const a = await registerUser("loss2@test.dev", "挂失乙");
    const uid = a.user_id;
    const cards = await cardsOf(uid);
    const def = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const target = cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    /* 补办但缺地址 → ADDRESS_REQUIRED（AI 通道将据此反问用户，不代编地址） */
    const noAddr = await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: true, payCard: def.slug }, a.token);
    expect(noAddr.status).toBe(400);
    expect((await j(noAddr)).reason).toBe("ADDRESS_REQUIRED");
    /* 付款卡=挂失卡 → PAY_CARD_SAME（显式传目标卡；缺省回落默认借记卡不会撞目标） */
    const same = await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: false, payCard: target.slug }, a.token);
    expect((await j(same)).reason).toBe("PAY_CARD_SAME");
    /* 付款卡冻结 → PAY_CARD_UNAVAILABLE */
    await doOp("u:" + uid, { op: "setCardStatus", slug: def.slug, status: "FROZEN" });
    const frozen = await post(`/api/cards/${target.slug}/loss/report`, { replaceNew: false, payCard: def.slug }, a.token);
    expect((await j(frozen)).reason).toBe("PAY_CARD_UNAVAILABLE");
    /* 无挂失的卡激活 → LOSS_NOT_FOUND */
    const act = await doOp("u:" + uid, { op: "cardLossActivate", slug: target.slug });
    expect(act.error).toBe("LOSS_NOT_FOUND");
  }, 30000);

  /* 第一百二十八轮：冻结/解冻状态前置守卫（重复冻结白烧 OTP 修复） */
  it("重复冻结已冻结卡 → ALREADY_FROZEN；解冻正常卡 → ALREADY_ACTIVE；解冻挂失中卡 → LOSS_ACTIVE（OTP 前拦截）", async () => {
    const a = await registerUser("loss3@test.dev", "挂失丙");
    const uid = a.user_id;
    const cards = await cardsOf(uid);
    const def = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const other = cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    /* 正常卡解冻 → ALREADY_ACTIVE（BIZ_REJECT，不出确认卡） */
    const r1 = await post(`/api/cards/${other.slug}/unfreeze`, {}, a.token);
    expect(r1.status).toBe(400);
    expect((await j(r1)).reason).toBe("ALREADY_ACTIVE");
    /* DO 冻结后重复冻结 → ALREADY_FROZEN */
    await doOp("u:" + uid, { op: "setCardStatus", slug: other.slug, status: "FROZEN" });
    const r2 = await post(`/api/cards/${other.slug}/freeze`, {}, a.token);
    expect((await j(r2)).reason).toBe("ALREADY_FROZEN");
    /* 挂失中的卡解冻 → LOSS_ACTIVE（preValidate 即拦，不进入红级流程）；付款卡用未冻结的第三张 */
    const third0 = cards.find((c) => c.kind === "debit" && c.slug !== def.slug && c.slug !== other.slug);
    const loss = await doOp("u:" + uid, { op: "cardLoss", slug: def.slug, replace: 0, mail_to: null, pay_card: third0.slug, channel: "form", trace_id: null });
    expect(loss.ok).toBe(true);
    const r3 = await post(`/api/cards/${def.slug}/unfreeze`, {}, a.token);
    const r3j = await j(r3);
    expect(r3j.reason).toBe("LOSS_ACTIVE");
    expect(r3j.error.message).toContain("report-loss");
    /* 挂失中的卡重复冻结 → ALREADY_LOST（引导去挂失页） */
    const r4 = await post(`/api/cards/${def.slug}/freeze`, {}, a.token);
    expect((await j(r4)).reason).toBe("ALREADY_LOST");
  }, 30000);

  /* 第一百二十八轮：交叉场景组合（转账+挂失 / 冻结+挂失）——batch 链挂失适配 */
  it("batch_execute：冻结一张卡 + 挂失另一张（补办+地址）同卡组红级一次 OTP 全执行", async () => {
    const a = await registerUser("loss4@test.dev", "挂失丁");
    const uid = a.user_id, email = "loss4@test.dev";
    const cards = await cardsOf(uid);
    const def = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const target = cards.find((c) => c.kind === "debit" && c.slug !== def.slug);
    const third = cards.find((c) => c.kind === "debit" && c.slug !== def.slug && c.slug !== target.slug);
    const items = [
      { intent: "card_freeze", args: { card_id: third.slug } },
      { intent: "card_loss_report", args: { card_id: target.slug, replace_new: true, mail_to: "北京市海淀区中关村 1 号 组合测试 13800002222", pay_card: def.slug } },
    ];
    /* batch_execute 为 AI/MCP 通道工具（无 REST 路由）——按 ai.js attachConfirm 同协议直调 /mcp */
    const mcp = async (args) => {
      const r = await post("/mcp?sid=test-batch", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "batch_execute", arguments: args } }, a.token);
      const raw = (await j(r)).result?.content?.[0]?.text ?? "{}";
      return JSON.parse(raw);
    };
    const r1 = await mcp({ items });
    expect(r1.status).toBe("INPUT_REQUIRED");
    const grant = r1.grant_hash ?? r1.grant?.grant_hash;
    const r2 = await mcp({ items, grant_hash: grant });
    expect(r2.status).toBe("OTP_REQUIRED"); /* 整卡=最高项 RED，一次 OTP */
    await post("/api/auth/email-code", { scene: "redstep", email });
    const otp = await lastCode(email);
    const r3 = await mcp({ items, grant_hash: grant, otp });
    expect(r3.status).toBe("EXECUTED");
    expect(r3.executed_count).toBe(2);
    const after = await cardsOf(uid);
    expect(after.find((c) => c.slug === third.slug).status).toBe("FROZEN");
    expect(after.find((c) => c.slug === target.slug).status).toBe("FROZEN");
    const lossRow = (await lossesOf(uid)).find((l) => l.card_slug === target.slug && l.status === "requested");
    expect(lossRow?.mail_to).toContain("中关村");
    /* 收尾恢复 */
    await doOp("u:" + uid, { op: "setCardStatus", slug: third.slug, status: "ACTIVE" });
    await doOp("u:" + uid, { op: "cardLossActivate", slug: target.slug });
  }, 30000);
});
