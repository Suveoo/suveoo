/* 第七期 idle i18n 迁移：主题一（假 AI 文案大扫除）+ 主题二（提议凸显）
   ADD 20 / MODIFY 3 / DELETE 9 → 1090 + 11 = 1101 键 ×4 文件。
   运行：node scripts/i18n-r7-update.mjs（幂等：ADD 跳过已有，DELETE 跳过缺失，MODIFY 断言旧值防误改） */
import { readFileSync, writeFileSync } from "node:fs";

const DIR = new URL("../frontend/i18n/", import.meta.url);

/* [key, zhCN, zhTW, enUS] */
const ADD = [
  // —— 主题一：/pay 快捷条（真实收款人驱动 + 中性能力句，按日轮换） ——
  ["pay.tryPrefix", "试试：{0}", "試試：{0}", "Try: {0}"],
  ["pay.tryPayee", "看看最近三个月给{0}转了多少", "看看最近三個月給{0}轉了多少", "How much have I transferred to {0} in the past 3 months?"],
  ["pay.trySpend", "帮我看看这个月钱都花哪儿了", "幫我看看這個月錢都花哪兒了", "Where did my money go this month?"],
  ["pay.tryCards", "查一下我名下卡片的可用余额", "查一下我名下卡片的可用餘額", "Check the available balance on my cards"],
  // —— 主题一：/wealth 快捷条 ——
  ["wealth.askPrefix", "问问 AI：{0}", "問問 AI：{0}", "Ask AI: {0}"],
  ["wealth.askHold", "分析一下我当前的持仓配置", "分析一下我目前的持倉配置", "Review my current portfolio allocation"],
  ["wealth.askIdle", "货币基金和定期存款，怎么选", "貨幣基金和定期存款，怎麼選", "Money market fund or fixed deposit — how to choose?"],
  ["wealth.askRisk", "帮我讲讲 R1 到 R3 的产品有什么区别", "幫我講講 R1 到 R3 的產品有什麼區別", "Explain the differences between R1 and R3 products"],
  // —— 主题一：转账页 AI 入口重做（问/核/补，非替我办） ——
  ["transfer.aiAsk", "问问 AI", "問問 AI", "Ask AI"],
  ["transfer.aiCheck", "AI 帮我核对", "AI 幫我核對", "AI check"],
  ["transfer.aiQEmpty", "我想办一笔转账，需要准备哪些信息？", "我想辦一筆轉帳，需要準備哪些資訊？", "I'd like to make a transfer — what information do I need to prepare?"],
  ["transfer.aiQFilled", "我想转一笔账，表单里已填：收款人 {0}；账号尾号 {1}；金额 ¥{2}；备注 {3}；付款卡 {4}。请帮我核对这些信息，再引导我完成转账。", "我想轉一筆帳，表單裡已填：收款人 {0}；帳號尾號 {1}；金額 ¥{2}；備註 {3}；付款卡 {4}。請幫我核對這些資訊，再引導我完成轉帳。", "I'd like to make a transfer. Already filled in the form: recipient {0}; account ending {1}; amount ¥{2}; memo {3}; pay-from card {4}. Please verify these details and guide me through the next steps."],
  // —— 主题一：订阅页 AI 洞察钮（真实沉睡清单驱动） ——
  ["subs.aiList", "我的订阅里低使用的有：{0}。帮我分析这些是否值得退订", "我的訂閱裡低使用的有：{0}。幫我分析這些是否值得退訂", "Some of my subscriptions are barely used: {0}. Help me review whether they are worth cancelling"],
  ["subs.aiGeneral", "帮我分析我的订阅使用情况，哪些值得退订", "幫我分析我的訂閱使用情況，哪些值得退訂", "Analyze my subscription usage — which ones are worth cancelling?"],
  ["subs.aiItem", "{0}（{1} 分）", "{0}（{1} 分）", "{0} (score {1})"],
  ["subs.aiSep", "、", "、", ", "],
  // —— 主题二：提议凸显徽标/气泡/胶囊 ——
  ["pp.bubble", "AI 发现 {0} 条可办提议 · 本月已省 ¥{1}", "AI 發現 {0} 條可辦提議 · 本月已省 ¥{1}", "AI found {0} proposals to act on · ¥{1} saved this month"],
  ["pp.bubblePlain", "AI 发现 {0} 条可办提议", "AI 發現 {0} 條可辦提議", "AI found {0} proposals to act on"],
  ["pp.badgeAria", "{0} 条新提议", "{0} 條新提議", "{0} new proposals"],
  ["ai.ppPill", "有 {0} 条新提议待查看", "有 {0} 條新提議待查看", "{0} new proposals to review"],
];

/* [key, zhCNOld, zhCnNew, zhTWNew, enNew]（断言旧值，防误改） */
const MODIFY = [
  ["transfer.namePh", "张三", "收款人姓名", "收款人姓名", "Recipient name"],
  ["cards.aiPrompt", "帮我管理 {0} 这张卡", "帮我看看尾号 {0} 这张卡：状态、限额和最近消费，有什么要注意的", "幫我看看尾號 {0} 這張卡：狀態、限額和最近消費，有什麼要注意的", "Review my card ending {0}: status, limits and recent spending — anything I should know?"],
  ["deps.askBest", "我有 X 元存哪家划算", "存哪家更划算", "存哪家更划算", "Which option pays better?"],
];

const DELETE = [
  "pay.aiTry", "wealth.aiAsk", "prompt.transferFill", "prompt.hotpotAA", "prompt.carFund",
  "prompt.subsCleanup", "transfer.aiFill", "fx.aiTiming", "prompt.retest",
];

const FILES = [
  ["zh-CN.json", (r) => r[1]],
  ["zh-TW.json", (r) => r[2]],
  ["en-US.json", (r) => r[3]],
  ["fallback.json", (r) => r[1]], /* fallback = zh-CN 值 */
];

for (const [file, pick] of FILES) {
  const obj = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
  const before = Object.keys(obj).length;
  let added = 0, modded = 0, deleted = 0;
  for (const row of ADD) {
    if (row[0] in obj) continue;
    obj[row[0]] = pick(row);
    added++;
  }
  for (const [k, oldV, ...vals] of MODIFY) {
    const v = file === "zh-CN.json" || file === "fallback.json" ? vals[0] : file === "zh-TW.json" ? vals[1] : vals[2];
    if (!(k in obj)) throw new Error(`${file}: MODIFY 目标缺失 ${k}`);
    if (obj[k] === v) continue; /* 已是新值（重跑幂等） */
    if (file === "zh-CN.json" && obj[k] !== oldV) throw new Error(`${file}: MODIFY 旧值不符 ${k}=${obj[k]}`);
    obj[k] = v;
    modded++;
  }
  for (const k of DELETE) { if (k in obj) { delete obj[k]; deleted++; } }
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  writeFileSync(new URL(file, DIR), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`${file}: ${before} -> ${Object.keys(sorted).length} (+${added} ~${modded} -${deleted})`);
}

/* 四文件键集一致性校验 */
const sets = FILES.map(([f]) => Object.keys(JSON.parse(readFileSync(new URL(f, DIR), "utf8"))));
const same = sets.every((s) => s.join("\u0000") === sets[0].join("\u0000"));
console.log(same ? `KEYSET OK: ${sets[0].length} keys x4 identical` : "KEYSET MISMATCH!");
process.exit(same ? 0 : 1);
