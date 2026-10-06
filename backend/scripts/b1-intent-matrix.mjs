#!/usr/bin/env node
/* b1-intent-matrix.mjs — B1 意图识别+分级准确率（第一百三十一轮 · 板块一 Phase 2 L1）
 * 10 intent × 5 变体（直接/口语/倒装/敬语省略/中英混合），只到出卡不确认——零副作用零 OTP。
 * 判定：green=直接数字回答且无卡；yellow/red=genui_event 卡 action 匹配且 tier 匹配；
 *       组合=operations_package 组件。分级错记 2 倍权重。
 * 用法：node scripts/b1-intent-matrix.mjs --session-token <JWT> --out ../for_developer/bench-results/20261006/b1-intent.json */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const a = process.argv.slice(2);
const args = { "session-token": null, "transfer-token": null, out: null, base: "https://suveoo.com", only: null, delay: "0" };
for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) args[a[i].slice(2)] = a[i + 1];
const DELAY_MS = Number(args.delay) || 0; /* kimi 等有速率限制的模型加间隔 */
const token = args["session-token"];
if (!token) { console.error("需要 --session-token"); process.exit(1); }
const transferToken = args["transfer-token"] ?? token; /* 转账类可换账户（规避 AI 日累计上限，U100001 demo 已满） */

/* 变体模板：{intent} 会被替换为各 intent 的核心语义片段 */
const MATRIX = [
  { id: "余额查询", expect: { kind: "green" }, core: ["我默认卡还有多少余额", "帮我看下卡里还剩多少钱", "余额多少我那默认的卡", "麻烦告诉下我卡上还有多少", "check my default card balance"] },
  { id: "账单分析", expect: { kind: "green" }, core: ["上个月钱花哪了", "帮我看看上月消费都花在哪了", "消费分析一下上个月的", "麻烦给我讲讲上月支出情况", "analyze my last month spending"] },
  { id: "小额转账(黄)", expect: { kind: "card", action: "transfer_execute", tier: "YELLOW" }, core: ["给赵砚秋转 50 元", "帮我付给赵砚秋五十块", "转账五十元给赵砚秋", "麻烦让赵砚秋收到五十", "transfer 50 to 赵砚秋"] },
  { id: "大额转账(红)", expect: { kind: "card", action: "transfer_execute", tier: "RED" }, core: ["给赵砚秋转 2000 元", "帮我付给赵砚秋两千块", "转账两千元给赵砚秋", "麻烦让赵砚秋收到两千", "transfer 2000 to 赵砚秋"] },
  { id: "预约转账(黄)", expect: { kind: "card", action: "scheduled_task_create", tier: "YELLOW" }, core: ["明天上午 9 点给赵砚秋转 50 元", "帮我明天早上九点付给赵砚秋五十块", "转账五十元给赵砚秋明天上午九点", "麻烦明早九点让赵砚秋收到五十", "schedule 50 to 赵砚秋 tomorrow 9am"] },
  { id: "理财申购(红)", expect: { kind: "card", action: "wealth_product_purchase", tier: "RED" }, core: ["买 1000 元 global-money-1 基金", "帮我申购一千块那个货币基金 global-money-1", "一千元申购 global-money-1", "麻烦帮我把一千块放进 global-money-1", "buy 1000 of global-money-1"] },
  { id: "冻结卡片(红)", expect: { kind: "card", action: "card_freeze", tier: "RED" }, core: ["冻结尾号 6330 的卡", "帮我把尾号 6330 那张卡冻一下", "冻结我的卡尾号 6330", "麻烦冻结尾号六三三零的卡", "freeze my card ending 6330"] },
  { id: "订阅取消(黄)", expect: { kind: "card", action: "subscription_cancel", tier: "YELLOW" }, core: ["取消 Keep 的订阅", "帮我把 Keep 会员退了", "订阅取消那个 Keep 的", "麻烦退订 Keep", "cancel my Keep subscription"] },
  { id: "卡片挂失(红)", expect: { kind: "loss-clarify" }, core: ["挂失尾号 5025 的卡", "我尾号 5025 的卡丢了帮我挂失", "挂失我的卡尾号 5025 的", "麻烦把尾号五零二五的卡挂失一下", "report loss for card ending 5025"] },
  { id: "组合操作", expect: { kind: "single-write-plus-green" }, core: ["冻结尾号 2917 的卡，同时查一下我的余额", "帮我冻结 2917 那张卡，顺便看看余额", "冻结 2917 顺便查余额", "麻烦冻一下尾号 2917 的卡再告诉我余额", "freeze 2917 and check my balance"] },
];

async function ask(q, tok) {
  return new Promise((resolve) => {
    const cards = [];
    let acc = "";
    const fin = () => resolve({ text: acc, cards });
    const timer = setTimeout(fin, 150000);
    fetch(args.base + "/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}`, accept: "text/event-stream" }, body: JSON.stringify({ text: q }) })
      .then(async (r) => {
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "token" && evt.text) acc += evt.text;
              if (evt.type === "genui_event" && evt.card) cards.push(evt.card);
              if (evt.type === "done" || evt.type === "error") { clearTimeout(timer); return fin(); }
            } catch { /* 跨片 */ }
          }
        }
        clearTimeout(timer); fin();
      }).catch(() => { clearTimeout(timer); fin(); });
  });
}

function judge(r, expect) {
  if (expect.kind === "green") {
    const hasNum = /\d/.test(r.text);
    const noCard = !r.cards.some((c) => c.grant_hash || c.component === "transfer_confirmation");
    return { pass: hasNum && noCard, got: `text${hasNum ? "含数值" : "无数值"}+${noCard ? "无卡" : "有卡"}` };
  }
  if (expect.kind === "loss-clarify") {
    /* 挂失正确行为（127 轮队长验收）：先反问补办意愿（+补办时邮寄地址）——文字澄清、无未授权卡。
     * 允许出 card_loss_report 卡（用户语义已明确含补办时）与反问并存。 */
    const asks = /补办|新卡|邮寄|地址/.test(r.text);
    const unauthorized = r.cards.some((c) => c.grant_hash && c.action !== "card_loss_report");
    return { pass: asks && !unauthorized, got: asks ? "反问补办意愿（正确澄清）" : `未反问(${r.text.slice(0, 30)})` };
  }
  if (expect.kind === "single-write-plus-green") {
    /* 单写+查询组合：正确行为=写项出确认卡（card_freeze/RED）+ 查询项文字直答（含数值）——
     * GREEN 不进组合卡（规则 12：多项写操作才 plan_preview）；首试被拒后自我纠正（Plan Repair）也计过。 */
    const freeze = r.cards.find((c) => c.action === "card_freeze" && c.tier === "RED");
    const num = /\d/.test(r.text);
    return { pass: !!freeze && num, got: freeze ? `card_freeze/RED+文字答余额` : `无冻结卡(${r.cards.map((c) => c.action).join(",")})` };
  }
  if (expect.kind === "package") {
    const pkg = r.cards.find((c) => c.component === "operations_package");
    const gotCard = r.cards[0];
    return { pass: !!pkg, got: pkg ? "operations_package" : (gotCard ? gotCard.component ?? gotCard.action : "无卡") };
  }
  /* card 类：action 匹配 + tier 匹配（分级错=2 倍权重记录）；取最终卡（模型可能先出修正前小额卡再自我纠正） */
  const matching = r.cards.filter((c) => c.action === expect.action);
  const hit = matching.length ? matching[matching.length - 1] : null; /* 取最后一张（自我纠正后的终态） */
  if (!hit) {
    const alt = r.cards.find((c) => c.grant_hash || c.component === "transfer_confirmation" || c.component === "blocked_notice");
    return { pass: false, got: alt ? `${alt.component ?? ""}:${alt.action ?? alt.reason ?? ""}` : `无卡(text=${r.text.slice(0, 40)})`, intent_ok: false, tier_ok: false };
  }
  const intentOk = true;
  const tierOk = hit.tier === expect.tier;
  return { pass: intentOk && tierOk, got: `${hit.action}/${hit.tier}`, intent_ok: intentOk, tier_ok: tierOk, double_weight_miss: intentOk && !tierOk };
}

(async () => {
  const rows = [];
  const only = args.only ? new Set(args.only.split(",")) : null;
  for (const m of MATRIX) {
    if (only && !only.has(m.id)) continue;
    for (let v = 0; v < m.core.length; v++) {
      const q = m.core[v];
      const t0 = Date.now();
      const isTransfer = ["小额转账(黄)", "大额转账(红)", "预约转账(黄)"].includes(m.id);
      const r = await ask(q, isTransfer ? transferToken : token);
      const verdict = judge(r, m.expect);
      rows.push({ intent: m.id, variant: v, q, expect: m.expect.kind === "card" ? `${m.expect.action}/${m.expect.tier}` : m.expect.kind, ...verdict, ms: Date.now() - t0, cards: r.cards.map((c) => `${c.component ?? ""}:${c.action ?? c.reason ?? ""}:${c.tier ?? ""}`), text: r.text });
      console.log(`${verdict.pass ? "✓" : "✗"} [${m.id}#${v + 1}] got=${verdict.got} ${Date.now() - t0}ms  ${q}`);
      if (DELAY_MS) await new Promise((r2) => setTimeout(r2, DELAY_MS));
    }
  }
  const passed = rows.filter((r) => r.pass).length;
  const tierMiss = rows.filter((r) => r.double_weight_miss).length;
  const weightedScore = passed - tierMiss; /* 分级错 2 倍权重 */
  const summary = { date: new Date().toISOString(), model: "glm-5.3-flash", total: rows.length, passed, rate: +(passed / rows.length * 100).toFixed(1), tier_miss_double_weight: tierMiss, weighted: `${weightedScore}/${rows.length}`, byIntent: MATRIX.map((m) => ({ id: m.id, pass: rows.filter((r) => r.intent === m.id && r.pass).length, n: rows.filter((r) => r.intent === m.id).length })), rows };
  const dest = args.out ?? "../for_developer/bench-results/20261006/b1-intent.json";
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(summary, null, 2));
  console.log(`\nB1：${passed}/${rows.length}（${summary.rate}%）｜分级错(2倍权重) ${tierMiss} → 加权 ${weightedScore}/${rows.length} → ${dest}`);
})();
