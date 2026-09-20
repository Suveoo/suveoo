import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { toCents, genDemoSeedRich, seededRng } from "../../worker-main.js";

/** 任务 B：交易挂卡 + 信用卡账本（信用支付 / 还款闭环）+ 单卡明细真过滤真分页。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }, 20000);
}
const j = (r) => r.json();
async function lastCode(email) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  return /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "测试用户") {
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
const cardsOf = async (uid) => (await doOp(`u:${uid}`, { op: "getCards" })).cards;
/** 两段式守卫转账（黄级免 OTP）：INPUT_REQUIRED → grant 重试 */
async function guardedTransfer(token, body) {
  const s1 = await j(await post("/api/transfers/intrabank", body, token));
  if (s1.status !== "INPUT_REQUIRED") return s1;
  return j(await post("/api/transfers/intrabank", { ...body, grant_hash: s1.grant.grant_hash }, token));
}
const CREDIT_SLUG = "credit-card-1";

describe("B2 写流水挂卡", () => {
  it("转账：tx.card = 付款卡 slug（默认卡与指定卡各验一笔）", async () => {
    const a = await registerUser("cl1a@test.dev", "转出甲");
    const b = await registerUser("cl1b@test.dev", "收款乙");
    const bCards = await cardsOf(b.user_id);
    const bDebit = bCards.find((c) => c.kind === "debit");
    const aCards = await cardsOf(a.user_id);
    const def = aCards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const other = aCards.find((c) => c.kind === "debit" && c.slug !== def.slug);

    const r1 = await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "收款乙", amount: "10.00", memo: "默认卡" });
    expect(r1.status).toBe("EXECUTED");
    const r2 = await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "收款乙", amount: "5.00", from_card: other.slug, memo: "指定卡" });
    expect(r2.status).toBe("EXECUTED");

    const hist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${a.token}` } }));
    const t1 = hist.txs.find((t) => t.memo === "默认卡");
    const t2 = hist.txs.find((t) => t.memo === "指定卡");
    expect(t1.card).toBe(def.slug);
    expect(t2.card).toBe(other.slug);
    /* 跨用户入账侧（credit op）：tx.card = 收款方默认借记卡 */
    const bHist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${b.token}` } }));
    expect(bHist.txs.every((t) => t.card === bDebit.slug)).toBe(true);
    expect(bHist.txs.some((t) => t.direction === "IN" && t.amount_cents === "1000")).toBe(true);
  }, 20000);

  it("账单缴费 / 理财申购赎回 / 换汇：各写一条 tx 且 card = 默认借记卡", async () => {
    const out = await registerUser("cl2@test.dev");
    const uid = out.user_id;
    const def = (await cardsOf(uid)).find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    /* 种子一笔账单 + 一笔持仓 + 一点外币（doOp 直灌，聚焦挂卡断言） */
    await doOp(`u:${uid}`, { op: "seedDemo", txs: [], payees: [], bills: [{ id: "power", name: "电费", category: "生活服务", amount_cents: "2000", due_day: 5, autopay: 0 }], subs: [], holdings: [{ fund: "global-money-1", amount_cents: "100000", cost_nav: "1.0012" }], notifs: [], tasks: [] });

    const pay1 = await j(await post(`/api/bills/power/pay`, {}, out.token));
    expect(pay1.status).toBe("INPUT_REQUIRED"); /* 黄级两段式 */
    expect(pay1.grant.snapshot.params.amount).toBe("20.00"); /* 确认卡金额=十进制元（修复按分直传的 100 倍显示） */
    const pay = await j(await post(`/api/bills/power/pay`, { grant_hash: pay1.grant.grant_hash }, out.token));
    expect(pay.status).toBe("EXECUTED");

    const purchase = await j(await post("/api/wealth/purchase", { product_id: "global-money-1", amount: "100" }, out.token));
    if (purchase.status === "INPUT_REQUIRED") {
      const otp = await redstep("cl2@test.dev"); /* 注册响应不含 email 字段，用字面量 */
      const purchase2 = await j(await post("/api/wealth/purchase", { product_id: "global-money-1", amount: "100", grant_hash: purchase.grant.grant_hash, otp }, out.token));
      expect(purchase2.status).toBe("EXECUTED");
    }
    const fx = await j(await post("/api/fx/exchange", { direction: "buy", currency: "USD", amount_cny: "50" }, out.token));
    if (fx.status === "INPUT_REQUIRED") {
      const fx2 = await j(await post("/api/fx/exchange", { direction: "buy", currency: "USD", amount_cny: "50", grant_hash: fx.grant.grant_hash }, out.token));
      expect(fx2.status).toBe("EXECUTED");
    }

    const hist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${out.token}` } }));
    const billTx = hist.txs.find((t) => t.counterparty === "电费");
    const wealthTx = hist.txs.find((t) => t.category === "理财" && t.direction === "OUT");
    const fxTx = hist.txs.find((t) => t.category === "外汇");
    expect(billTx?.card).toBe(def.slug);
    expect(wealthTx?.card).toBe(def.slug);
    expect(fxTx?.card).toBe(def.slug);
  }, 30000);
});

async function redstep(email) {
  await post("/api/auth/email-code", { scene: "redstep", email });
  return lastCode(email);
}

describe("B3 信用卡信用支付", () => {
  it("转账选信用卡：借记余额不动、欠款 += 金额、可用额度减少、tx.card=信用卡", async () => {
    const a = await registerUser("cl3a@test.dev", "信用支付甲");
    const b = await registerUser("cl3b@test.dev", "收款丙");
    const bDebit = (await cardsOf(b.user_id)).find((c) => c.kind === "debit");
    const before = await cardsOf(a.user_id);
    const defBefore = before.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const credBefore = before.find((c) => c.kind === "credit");

    const r = await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "收款丙", amount: "66.60", from_card: CREDIT_SLUG, memo: "信用支付" });
    expect(r.status).toBe("EXECUTED");

    const after = await cardsOf(a.user_id);
    const defAfter = after.find((c) => c.slug === defBefore.slug);
    const credAfter = after.find((c) => c.kind === "credit");
    expect(defAfter.balance_cents).toBe(defBefore.balance_cents);                       // 借记余额不动
    expect(BigInt(credAfter.balance_cents)).toBe(BigInt(credBefore.balance_cents) + 6660n); // 欠款 += 66.60
    expect(BigInt(credAfter.limit_cents) - BigInt(credAfter.balance_cents)).toBe(BigInt(credBefore.limit_cents) - BigInt(credBefore.balance_cents) - 6660n);
    const hist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${a.token}` } }));
    expect(hist.txs.find((t) => t.memo === "信用支付")?.card).toBe(CREDIT_SLUG);
  }, 20000);

  it("超额 → INSUFFICIENT_CREDIT（不产生任何流水与欠款变化）", async () => {
    const a = await registerUser("cl4a@test.dev", "超额甲");
    const b = await registerUser("cl4b@test.dev", "收款丁");
    const bDebit = (await cardsOf(b.user_id)).find((c) => c.kind === "debit");
    const credBefore = (await cardsOf(a.user_id)).find((c) => c.kind === "credit");
    /* 可用额度 = 320000 − 欠款；刷超它（金额巨大走红级 OTP，直接调 DO 断言执行层拒绝） */
    const avail = BigInt(credBefore.limit_cents) - BigInt(credBefore.balance_cents);
    const r = await doOp(`u:${a.user_id}`, { op: "transfer", from_card: CREDIT_SLUG, recipient: `acct:${bDebit.number}`, recipient_name: "收款丁", amount_cents: String(avail + 1n), memo: "超额", trace_id: "cl4-over" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("INSUFFICIENT_CREDIT");
    const credAfter = (await cardsOf(a.user_id)).find((c) => c.kind === "credit");
    expect(credAfter.balance_cents).toBe(credBefore.balance_cents);
    /* cardAvailable 对信用卡按可用额度口径（INVARIANT_BALANCE 守卫同源） */
    const av = await doOp(`u:${a.user_id}`, { op: "cardAvailable", slug: CREDIT_SLUG });
    expect(av.cents).toBe(String(avail));
  }, 20000);

  it("购汇选信用卡：欠款按人民币金额计入、外币到账、借记余额不动", async () => {
    const out = await registerUser("cl5@test.dev");
    const uid = out.user_id;
    const before = await cardsOf(uid);
    const defBefore = before.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const credBefore = before.find((c) => c.kind === "credit");
    const s1 = await j(await post("/api/fx/exchange", { direction: "buy", currency: "USD", amount_cny: "100", from_card: CREDIT_SLUG }, out.token));
    expect(s1.status).toBe("INPUT_REQUIRED");
    const s2 = await j(await post("/api/fx/exchange", { direction: "buy", currency: "USD", amount_cny: "100", from_card: CREDIT_SLUG, grant_hash: s1.grant.grant_hash }, out.token));
    expect(s2.status).toBe("EXECUTED");
    const after = await cardsOf(uid);
    expect(after.find((c) => c.slug === defBefore.slug).balance_cents).toBe(defBefore.balance_cents);
    expect(BigInt(after.find((c) => c.kind === "credit").balance_cents)).toBe(BigInt(credBefore.balance_cents) + 10000n);
    const fxb = await j(await SELF.fetch(BASE + "/api/fx/balances", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(fxb.balances.some((x) => x.currency === "USD" && Number(x.amount) > 0)).toBe(true);
    const hist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${out.token}` } }));
    expect(hist.txs.find((t) => t.category === "外汇")?.card).toBe(CREDIT_SLUG);
    /* 结汇方向选信用卡 → DO 拒绝 CARD_UNAVAILABLE（入账方向仅借记卡） */
    const s3 = await j(await post("/api/fx/exchange", { direction: "sell", currency: "USD", amount_foreign: "1", from_card: CREDIT_SLUG }, out.token));
    if (s3.status === "INPUT_REQUIRED") {
      const s3b = await j(await post("/api/fx/exchange", { direction: "sell", currency: "USD", amount_foreign: "1", from_card: CREDIT_SLUG, grant_hash: s3.grant.grant_hash }, out.token));
      expect(s3b.status).toBe("BLOCKED");
      expect(s3b.reason).toBe("CARD_UNAVAILABLE");
    } else {
      expect(s3.status).toBe("BLOCKED");
    }
  }, 20000);

  it("信用卡不能作为入账/互转目标（防御）", async () => {
    const out = await registerUser("cl6@test.dev");
    const cards = await cardsOf(out.user_id);
    const def = cards.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    const r = await doOp(`u:${out.user_id}`, { op: "transfer", from_card: def.slug, recipient: `self:${CREDIT_SLUG}`, amount_cents: "100", trace_id: "t-cl6" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("CREDIT_TARGET_UNSUPPORTED");
  }, 20000);
});

describe("B4 还款闭环", () => {
  it("先信用消费 ¥80 → credit-repay 全额还款：默认借记 −80、欠款清零、OUT 流水挂借记卡且 memo 含金额", async () => {
    const a = await registerUser("cl7a@test.dev", "还款甲");
    const b = await registerUser("cl7b@test.dev", "收款戊");
    const bDebit = (await cardsOf(b.user_id)).find((c) => c.kind === "debit");
    expect((await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "收款戊", amount: "80.00", from_card: CREDIT_SLUG, memo: "先欠着" })).status).toBe("EXECUTED");

    const before = await cardsOf(a.user_id);
    const def = before.find((c) => c.kind === "debit" && Number(c.is_default) === 1);
    expect(BigInt(before.find((c) => c.kind === "credit").balance_cents)).toBe(8000n);

    /* 账单列表金额动态=当前欠款 80.00；pay 全额还款 */
    const bills = await j(await SELF.fetch(BASE + "/api/bills", { headers: { authorization: `Bearer ${a.token}` } }));
    void bills; /* 新注册用户无 credit-repay 账单（种子才有）——走 doOp 直灌账单后 API 缴费 */
    await doOp(`u:${a.user_id}`, { op: "seedDemo", txs: [], payees: [], bills: [{ id: "credit-repay", name: "信用卡还款（全额）", category: "信用", amount_cents: "0", due_day: 22, autopay: 1 }], subs: [], holdings: [], notifs: [], tasks: [] });
    const pay = await j(await post("/api/bills/credit-repay/pay", {}, a.token));
    expect(pay.status).toBe("INPUT_REQUIRED"); /* 黄级确认卡金额应=80.00 */
    expect(pay.grant.snapshot.params.amount).toBe(centsToStr(8000n));
    const pay2 = await j(await post("/api/bills/credit-repay/pay", { grant_hash: pay.grant.grant_hash }, a.token));
    expect(pay2.status).toBe("EXECUTED");
    expect(pay2.result.repaid).toBe("80.00");

    const after = await cardsOf(a.user_id);
    expect(after.find((c) => c.slug === def.slug).balance_cents).toBe(String(BigInt(def.balance_cents) - 8000n));
    expect(after.find((c) => c.kind === "credit").balance_cents).toBe("0");
    const hist = await j(await SELF.fetch(BASE + "/api/transfers", { headers: { authorization: `Bearer ${a.token}` } }));
    const repayTx = hist.txs.find((t) => t.counterparty === "信用卡还款");
    expect(repayTx.card).toBe(def.slug);
    expect(repayTx.memo).toContain("80.00");

    /* 欠款清零后再还 → NO_DEBT */
    const again = await post("/api/bills/credit-repay/pay", {}, a.token);
    expect(again.status).toBe(409);
    expect((await j(again)).reason).toBe("NO_DEBT");
  }, 30000);

  it("AI 通道 bill_pay 只给 bill_id：credit-repay 金额动态补齐为当前欠款", async () => {
    const a = await registerUser("cl8a@test.dev", "AI还款甲");
    const b = await registerUser("cl8b@test.dev", "收款己");
    const bDebit = (await cardsOf(b.user_id)).find((c) => c.kind === "debit");
    await guardedTransfer(a.token, { recipient_account: bDebit.number, recipient_name: "收款己", amount: "12.34", from_card: CREDIT_SLUG, memo: "AI还款前置" });
    await doOp(`u:${a.user_id}`, { op: "seedDemo", txs: [], payees: [], bills: [{ id: "credit-repay", name: "信用卡还款（全额）", category: "信用", amount_cents: "0", due_day: 22, autopay: 1 }], subs: [], holdings: [], notifs: [], tasks: [] });
    const H = { authorization: `Bearer ${a.token}`, "content-type": "application/json" };
    const call1 = await j(await SELF.fetch(BASE + "/mcp?sid=cl8", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "bill_pay", arguments: { bill_id: "credit-repay" } } }) }));
    const r1 = JSON.parse(call1.result.content[0].text);
    expect(r1.status).toBe("INPUT_REQUIRED");
    expect(r1.grant.snapshot.params.amount).toBe("12.34");
    const call2 = await j(await SELF.fetch(BASE + "/mcp?sid=cl8", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "bill_pay", arguments: { bill_id: "credit-repay", grant_hash: r1.grant.grant_hash } } }) }));
    const r2 = JSON.parse(call2.result.content[0].text);
    expect(r2.status).toBe("EXECUTED");
    expect(r2.repaid).toBe("12.34");
    expect((await cardsOf(a.user_id)).find((c) => c.kind === "credit").balance_cents).toBe("0");
  }, 30000);
});

describe("B5 单卡明细真过滤 + 分页", () => {
  it("25 条挂卡流水翻两页：每行 card 均为该卡、20+5 分页、不存在卡空返回", async () => {
    const out = await registerUser("cl9@test.dev");
    const uid = out.user_id;
    const cards = await cardsOf(uid);
    const target = cards.find((c) => c.slug === "debit-card-2");
    const txs = Array.from({ length: 25 }, (_, i) => ({
      ts: new Date(Date.now() - (i + 1) * 3600000).toISOString(), amount_cents: String(100 + i), direction: "OUT",
      counterparty: `测试商户${i}`, category: "购物", memo: null, status: "SUCCESS", channel: "card", trace_id: null, card: "debit-card-2",
    }));
    await doOp(`u:${uid}`, { op: "seedDemo", txs, payees: [], bills: [], subs: [], holdings: [], notifs: [], tasks: [] });

    const p1 = await j(await SELF.fetch(BASE + `/api/cards/${target.slug}/transactions`, { headers: { authorization: `Bearer ${out.token}` } }));
    expect(p1.txs).toHaveLength(20);
    expect(p1.txs.every((t) => t.card === "debit-card-2")).toBe(true);
    expect(p1.next_cursor).toBe("20");
    const p2 = await j(await SELF.fetch(BASE + `/api/cards/${target.slug}/transactions?cursor=20`, { headers: { authorization: `Bearer ${out.token}` } }));
    expect(p2.txs).toHaveLength(5);
    expect(p2.next_cursor).toBe(null);
    /* 其他卡的明细不含这 25 条（真过滤） */
    const other = await j(await SELF.fetch(BASE + `/api/cards/debit-card-1/transactions`, { headers: { authorization: `Bearer ${out.token}` } }));
    expect(other.txs.some((t) => t.counterparty?.startsWith("测试商户"))).toBe(false);
    const none = await j(await SELF.fetch(BASE + `/api/cards/no-such-card/transactions`, { headers: { authorization: `Bearer ${out.token}` } }));
    expect(none.txs).toEqual([]);
  }, 20000);
});

describe("B4 种子：信用卡初始欠款与全量挂卡", () => {
  it("demo 重灌：信用欠款=信用卡消费合计（动态，账本可复算）；流水全部挂卡（本月抽查无 NULL card）", async () => {
    const seed = await j(await SELF.fetch(BASE + "/api/demo/seed", { method: "POST", headers: { "x-admin-token": env.ADMIN_TOKEN } }));
    expect(seed.ok).toBe(true);
    const cards = await cardsOf(seed.user_id);
    const cred = cards.find((c) => c.kind === "credit");
    /* 第三十轮：欠款不再固定 863247，与种子信用卡消费动态合计一致——用同种子直接计算期望值 */
    const expectDebt = genDemoSeedRich(seededRng(20260916)).txs
      .filter((t) => t.card === "credit-card-1" && t.direction === "OUT")
      .reduce((a, t) => a + Number(t.amount_cents), 0);
    expect(cred.balance_cents).toBe(String(expectDebt));
    expect(BigInt(cred.limit_cents) - BigInt(cred.balance_cents)).toBe(32000000n - BigInt(expectDebt)); // 可用额度 < 320,000
    /* 本月流水全部挂卡（reportData 直查 tx 表） */
    const month = new Date().toISOString().slice(0, 7);
    const rep = await doOp(`u:${seed.user_id}`, { op: "reportData", month });
    expect(rep.txs.length).toBeGreaterThan(20);
    expect(rep.txs.every((t) => t.card != null)).toBe(true);
    /* 单卡查询：demo 的四张借记卡各自有流水且互不串卡 */
    for (const slug of ["debit-card-1", "debit-card-2", "debit-card-3", "debit-card-4"]) {
      const r = await doOp(`u:${seed.user_id}`, { op: "cardTx", slug, cursor: "0" });
      expect(r.txs.every((t) => t.card === slug)).toBe(true);
      expect(r.txs.length).toBeGreaterThan(0);
    }
  }, 30000);
});

const centsToStr = (c) => `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
