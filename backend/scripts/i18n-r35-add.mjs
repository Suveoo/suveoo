/* i18n-r35-add.mjs — 第三十五轮：demo-lab 维度化注入 65 键 ×4 文件（字典序插入 demoLab.* 段） */
import { readFileSync, writeFileSync } from "node:fs";

const KEYS = {
  "demoLab.block.bills": ["账单", "賬單", "Bills", "账单"],
  "demoLab.block.credit": ["信用卡消费", "信用卡消費", "Credit card spends", "信用卡消费"],
  "demoLab.block.fx": ["外币余额", "外幣餘額", "FX balances", "外币余额"],
  "demoLab.block.holdings": ["理财持仓", "理財持倉", "Holdings", "理财持仓"],
  "demoLab.block.notifs": ["通知", "通知", "Notifications", "通知"],
  "demoLab.block.payees": ["收款人", "收款人", "Payees", "收款人"],
  "demoLab.block.subs": ["订阅", "訂閱", "Subscriptions", "订阅"],
  "demoLab.block.tasks": ["长程任务", "長程任務", "Scheduled tasks", "长程任务"],
  "demoLab.block.txs": ["流水", "流水", "Transactions", "流水"],
  "demoLab.blockLabel": ["勾选要处理的块（未勾选不动）", "勾選要處理的塊（未勾選不動）", "Pick blocks to process (unchecked stay untouched)", "勾选要处理的块（未勾选不动）"],
  "demoLab.curTitle": ["当前库状态", "當前庫狀態", "Current store", "当前库状态"],
  "demoLab.dimSub": ["四维正交 · 数据确定性可复现", "四維正交 · 數據確定性可重現", "4 orthogonal dimensions · deterministic", "四维正交 · 数据确定性可复现"],
  "demoLab.dimTitle": ["调整注入维度", "調整注入維度", "Injection dimensions", "调整注入维度"],
  "demoLab.ent.corporate": ["集团分红与资金归集、企业年金、商务宴请与公务出行", "集團分紅與資金歸集、企業年金、商務宴請與公務出行", "Group dividends, cash pooling, annuity, executive dining & travel", "集团分红与资金归集、企业年金、商务宴请与公务出行"],
  "demoLab.ent.institution": ["财政统发工资、工会费、党校培训、公务卡消费与零星报销", "財政統發工資、工會費、黨校培訓、公務卡消費與零星報銷", "Fiscal payroll, union fees, party-school training, official-card spends", "财政统发工资、工会费、党校培训、公务卡消费与零星报销"],
  "demoLab.ent.micro": ["3-8 人工资发放、对公货款转入、个体户核定征收税单", "3-8 人工資發放、對公貨款轉入、個體戶核定徵收稅單", "3-8 staff payroll, B2B inflows, lump-sum tax bills", "3-8 人工资发放、对公货款转入、个体户核定征收税单"],
  "demoLab.ent.sme": ["20-80 人薪资批量代发（备注工号段）、增值税、办公租金与差旅集中报销", "20-80 人薪資批量代發（備註工號段）、增值稅、辦公租金與差旅集中報銷", "20-80 staff payroll batches, VAT, office rent & travel", "20-80 人薪资批量代发（备注工号段）、增值税、办公租金与差旅集中报销"],
  "demoLab.entLabel": ["企业数据（可选附加）", "企業數據（可選附加）", "Enterprise data (optional)", "企业数据（可选附加）"],
  "demoLab.entNone": ["不添加", "不添加", "None", "不添加"],
  "demoLab.entNoneDesc": ["只保留个人职业剖面", "只保留個人職業剖面", "Personal profile only", "只保留个人职业剖面"],
  "demoLab.execClassic": ["经典注入（不选维度）", "經典注入（不選維度）", "Classic (no dimensions)", "经典注入（不选维度）"],
  "demoLab.execDim": ["运行维度化注入", "運行維度化注入", "Run dimensional injection", "运行维度化注入"],
  "demoLab.income.business": ["无固定月薪：对公转入波动 ±40%、季度分红、货款往来、税费社保代缴", "無固定月薪：對公轉入波動 ±40%、季度分紅、貨款往來、稅費社保代繳", "No fixed salary: corporate inflows ±40%, quarterly dividends, B2B flows", "无固定月薪：对公转入波动 ±40%、季度分红、货款往来、税费社保代缴"],
  "demoLab.income.investor": ["高薪月薪 + 期权行权（限制性股票解禁）+ 季度投资收益 + 董事/咨询费", "高薪月薪 + 期權行權（限制性股票解禁）+ 季度投資收益 + 董事/諮詢費", "High salary + RSU vesting + quarterly returns + board fees", "高薪月薪 + 期权行权（限制性股票解禁）+ 季度投资收益 + 董事/咨询费"],
  "demoLab.income.salaried": ["每月固定日同名公司月薪 + 12 月年终奖 + 偶发报销", "每月固定日同名公司月薪 + 12 月年終獎 + 偶發報銷", "Fixed-day monthly salary + December bonus + reimbursements", "每月固定日同名公司月薪 + 12 月年终奖 + 偶发报销"],
  "demoLab.incomeLabel": ["薪资来源（必选）", "薪資來源（必選）", "Income source", "薪资来源（必选）"],
  "demoLab.mode.custom.d": ["勾选块级范围，勾选块按所选语义处理", "勾選塊級範圍，勾選塊按所選語義處理", "Pick block-level scope", "勾选块级范围，勾选块按所选语义处理"],
  "demoLab.mode.custom.t": ["自定义范围", "自定義範圍", "Custom scope", "自定义范围"],
  "demoLab.mode.merge.d": ["读取-合并-重写：既有数据按自然键去重保留，信用欠款重算", "讀取-合併-重寫：既有數據按自然鍵去重保留，信用欠款重算", "Read-merge-write: dedupe by natural keys, recompute debt", "读取-合并-重写：既有数据按自然键去重保留，信用欠款重算"],
  "demoLab.mode.merge.t": ["不覆盖原始数据（合并）", "不覆蓋原始數據（合併）", "Merge (keep existing)", "不覆盖原始数据（合并）"],
  "demoLab.mode.overwrite.d": ["整段重灌（现行为）：最干净，卡片余额与额度按财富档位调整", "整段重灌（現行為）：最乾淨，卡片餘額與額度按財富檔位調整", "Full re-seed (current behavior); balances follow tier", "整段重灌（现行为）：最干净，卡片余额与额度按财富档位调整"],
  "demoLab.mode.overwrite.t": ["覆盖原始数据", "覆蓋原始數據", "Overwrite", "覆盖原始数据"],
  "demoLab.modeLabel": ["覆盖模式（必选）", "覆蓋模式（必選）", "Overwrite mode", "覆盖模式（必选）"],
  "demoLab.modeNote.custom": ["自定义范围：仅勾选块被处理", "自定義範圍：僅勾選塊被處理", "Custom scope: only checked blocks touched", "自定义范围：仅勾选块被处理"],
  "demoLab.modeNote.merge": ["合并模式：既有数据去重保留，欠款已重算", "合併模式：既有數據去重保留，欠款已重算", "Merge: existing kept, debt recomputed", "合并模式：既有数据去重保留，欠款已重算"],
  "demoLab.modeNote.overwrite": ["覆盖模式：整段重灌完成", "覆蓋模式：整段重灌完成", "Overwrite: full re-seed done", "覆盖模式：整段重灌完成"],
  "demoLab.pBills": ["账单", "賬單", "Bills", "账单"],
  "demoLab.pCreditTxs": ["信用卡消费笔数", "信用卡消費筆數", "Credit card txs", "信用卡消费笔数"],
  "demoLab.pDebit": ["借记余额计划", "借記餘額計劃", "Debit balance plan", "借记余额计划"],
  "demoLab.pFx": ["外币币种", "外幣幣種", "FX currencies", "外币币种"],
  "demoLab.pHoldings": ["持仓", "持倉", "Holdings", "持仓"],
  "demoLab.pLimit": ["信用卡额度", "信用卡額度", "Credit limit", "信用卡额度"],
  "demoLab.pMonth": ["月均 {0} 笔", "月均 {0} 筆", "avg {0}/mo", "月均 {0} 笔"],
  "demoLab.pNotifs": ["通知", "通知", "Notifications", "通知"],
  "demoLab.pPayees": ["收款人", "收款人", "Payees", "收款人"],
  "demoLab.pSalary": ["月薪带（元）", "月薪帶（元）", "Salary band (CNY)", "月薪带（元）"],
  "demoLab.pSubs": ["订阅", "訂閱", "Subscriptions", "订阅"],
  "demoLab.pTasks": ["任务", "任務", "Tasks", "任务"],
  "demoLab.pTxs": ["流水（12 个月）", "流水（12 個月）", "Txs (12 months)", "流水（12 个月）"],
  "demoLab.preview": ["预检（dry-run）", "預檢（dry-run）", "Precheck (dry-run)", "预检（dry-run）"],
  "demoLab.previewNote": ["与实跑一致", "與實跑一致", "matches actual run", "与实跑一致"],
  "demoLab.previewTitle": ["将注入的各块数量", "將注入的各塊數量", "Blocks to be injected", "将注入的各块数量"],
  "demoLab.previewing": ["预检中……", "預檢中……", "Prechecking…", "预检中……"],
  "demoLab.profLabel": ["职业档案（必选，90 项按类目）", "職業檔案（必選，90 項按類目）", "Profession (90, grouped)", "职业档案（必选，90 项按类目）"],
  "demoLab.profNote": ["共 {0} 个职业可选，每个都有专属签名数据", "共 {0} 個職業可選，每個都有專屬簽名數據", "{0} professions, each with signature data", "共 {0} 个职业可选，每个都有专属签名数据"],
  "demoLab.runNoteDim": ["维度化注入为确定性生成：同参数重复运行结果一致（幂等）。覆盖模式会按财富档位调整卡片余额与信用卡额度；合并模式不动卡片。大数据量约需 10-30 秒。", "維度化注入為確定性生成：同參數重複運行結果一致（冪等）。覆蓋模式會按財富檔位調整卡片餘額與信用卡額度；合併模式不動卡片。大數據量約需 10-30 秒。", "Deterministic generation: same params give identical results. Overwrite adjusts card balances/limit by tier; merge never touches cards. Large sets take 10-30s.", "维度化注入为确定性生成：同参数重复运行结果一致（幂等）。覆盖模式会按财富档位调整卡片余额与信用卡额度；合并模式不动卡片。大数据量约需 10-30 秒。"],
  "demoLab.tier.affluent": ["总资产 80-500 万：3-4 借记 + 信用卡 5-20 万额度、持仓 30-200 万 R2-R4、房贷车贷、10-20 订阅、年度旅游", "總資產 80-500 萬：3-4 借記 + 信用卡 5-20 萬額度、持倉 30-200 萬 R2-R4、房貸車貸、10-20 訂閱、年度旅遊", "¥0.8-5M assets: 3-4 debit + ¥50-200k credit, R2-R4 holdings, mortgage & auto loan, 10-20 subs", "总资产 80-500 万：3-4 借记 + 信用卡 5-20 万额度、持仓 30-200 万 R2-R4、房贷车贷、10-20 订阅、年度旅游"],
  "demoLab.tier.hnwi": ["总资产 1500 万-1.2 亿：高端信用卡 50-100 万额度、持仓 600 万+ 全谱系 R1-R5、3-5 币种大额外币、艺术品/慈善/家族信托/会所高尔夫", "總資產 1500 萬-1.2 億：高端信用卡 50-100 萬額度、持倉 600 萬+ 全譜系 R1-R5、3-5 幣種大額外幣、藝術品/慈善/家族信託/會所高爾夫", "¥15-120M assets: premium credit ¥0.5-1M, full-spectrum holdings, 3-5 FX, art/charity/trust/golf", "总资产 1500 万-1.2 亿：高端信用卡 50-100 万额度、持仓 600 万+ 全谱系 R1-R5、3-5 币种大额外币、艺术品/慈善/家族信托/会所高尔夫"],
  "demoLab.tier.mass": ["总资产 8-30 万：借记余额 5-15 万、低额度信用卡、理财 0-3 万 R1-R2、平民订阅、房租", "總資產 8-30 萬：借記餘額 5-15 萬、低額度信用卡、理財 0-3 萬 R1-R2、平民訂閱、房租", "¥80-300k assets: ¥50-150k debit, low-limit credit, R1-R2 holdings, budget subs, rent", "总资产 8-30 万：借记余额 5-15 万、低额度信用卡、理财 0-3 万 R1-R2、平民订阅、房租"],
  "demoLab.tierLabel": ["财富水平（必选）", "財富水平（必選）", "Wealth tier", "财富水平（必选）"],
  "demoLab.vAfter": ["注入后", "注入後", "After", "注入后"],
  "demoLab.vBefore": ["注入前", "注入前", "Before", "注入前"],
  "demoLab.vCounts": ["计数核对", "計數核對", "Count check", "计数核对"],
  "demoLab.vCountsOk": ["各块计数一致", "各塊計數一致", "blocks consistent", "各块计数一致"],
  "demoLab.vDebt": ["信用卡欠款（=明细合计）", "信用卡欠款（=明細合計）", "Credit debt (=sum of txs)", "信用卡欠款（=明细合计）"],
  "demoLab.vInjected": ["注入", "注入", "Injected", "注入"],
};

const FILES = [
  ["zh-CN.json", 0], ["zh-TW.json", 1], ["en-US.json", 2], ["fallback.json", 3],
];
let ok = true;
for (const [file, idx] of FILES) {
  const path = new URL(`../../frontend/i18n/${file}`, import.meta.url);
  const dict = JSON.parse(readFileSync(path, "utf8"));
  for (const [k, vals] of Object.entries(KEYS)) {
    if (dict[k] !== undefined) { console.error(`✗ ${file} 已存在键 ${k}`); ok = false; continue; }
    dict[k] = vals[idx];
  }
  /* 全键字典序重排 */
  const sorted = Object.fromEntries(Object.entries(dict).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`✓ ${file}: +${Object.keys(KEYS).length} → ${Object.keys(sorted).length} 键`);
}
console.log(ok ? "ALL OK" : "HAS ERRORS");
