/* gen-hotwords.mjs — 语音识别热词表生成器（第四十二轮）
 * 数据源（动态部分，加页面/产品后重跑即可）：
 *   ① SEED_PROFESSIONS（demo-lab 90 职业：名称/分类/公司/消费/订阅）
 *   ② SEED_ENTERPRISE（企业姓名部件与员工名）
 *   ③ 基金目录 FUND_*(worker-main.js 内联常量，regex 提取)
 *   ④ site_guide 全量别名（aliases——AI 语音里用户会说的页面/功能叫法）
 *   ⑤ i18n zh-CN 高频功能词（value 含产品名的键段扫描）
 *   ⑥ 手工核心词（金融术语/中英混合/Suveoo 专有，见 CORE 数组）
 * 输出：../nls/hotwords.txt（UTF-8，一行一词，去重排序）。
 * 用法：cd backend && node scripts/gen-hotwords.mjs
 * 上传：nls-portal.console.aliyun.com/hotwordsmanagement（教程 for_developer/switch_suveoo_ai_voice_input_path.md §8） */
import { writeFileSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { SEED_PROFESSIONS, SEED_ENTERPRISE } from "../worker-main.js";

const words = new Set();
const add = (w) => {
  const t = String(w ?? "").trim().replace(/^["']+|["']+$/g, "");
  /* 一行一词约束：去引号/空白/括注内的中文词保留（括号本身去掉）、长度 2~24、至少一个非 ASCII 字母数字字符或大写英文 */
  const clean = t.replace(/[（(][^）)]*[）)]/g, "").replace(/[\s,，、;；/|]+/g, "");
  if (!clean || clean.length < 2 || clean.length > 24) return;
  if (/^\d+$/.test(clean)) return; /* 纯数字无语音价值 */
  if (/团队|示例|测试账户|占位|^404$/.test(clean)) return; /* 页面脚手架词 */
  if (!/[^\x00-\x7F]/.test(clean) && !/^[A-Z0-9. -]+$/.test(clean)) return; /* 纯小写英文单词易误.boost，跳过 */
  words.add(clean);
};
const addAll = (arr) => arr.forEach(add);

/* ① 职业 90 条：名称/分类/公司名/消费/订阅 */
for (const p of Object.values(SEED_PROFESSIONS)) {
  add(p.name);
  add(p.cat);
  addAll(p.cos ?? []);
  addAll((p.shops ?? []).map((s) => s[0]));
  addAll((p.subs ?? []).map((s) => s[0]));
}

/* ② 企业维度：姓名部件+员工名+企业标签 */
for (const e of Object.values(SEED_ENTERPRISE)) {
  add(e.label);
  addAll((e.nameParts ?? []).flat());
  addAll(e.employees ?? []);
}

/* ③ 基金/存款目录（从 worker-main.js 源码正则提取——目录为内联常量） */
const src = readFileSync(new URL("../worker-main.js", import.meta.url), "utf8");
for (const m of src.matchAll(/"Suveoo[^"]{2,20}"/g)) add(m[0]); /* Suveoo 系产品全名 */
for (const m of src.matchAll(/\["([^"]{2,14})", "R[1-5]"/g)) add(m[1]); /* FUND 目录名 */
for (const m of src.matchAll(/"(活期|智能通知存款|整存整取[^"]{0,10}|大额存单[^"]{0,10}|通知存款[^"]{0,6})"/g)) add(m[1]);
for (const m of src.matchAll(/"id": "(netflix|spotify|icloud|youtube|prime|office365|microsoft365)"[^}]*"name": "([^"]+)"/gi)) add(m[2]);

/* ④ site_guide 别名（用户语音里对页面/功能的自然叫法） */
const sg = src.match(/SITE_GUIDE[\s\S]*?\n\];/)?.[0] ?? "";
for (const m of sg.matchAll(/aliases: \[([^\]]+)\]/g)) {
  for (const a of m[1].matchAll(/"([^"]{2,16})"/g)) add(a[1]);
}

/* ⑤ i18n zh-CN 产品/功能名（title/name/label 类值） */
const i18n = JSON.parse(readFileSync(new URL("../../frontend/i18n/zh-CN.json", import.meta.url), "utf8"));
for (const [k, v] of Object.entries(i18n)) {
  if (!/title$|Name$|label$|\.name$/.test(k)) continue;
  if (typeof v !== "string") continue;
  if (/^[A-Z\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 ·-]{1,13}$/.test(v) && /[\u4e00-\u9fff]/.test(v)) add(v);
}

/* ⑥ 手工核心词：金融术语 / 监管与安全 / 银行操作 / Suveoo 专有 / 中英混合高频 */
const CORE = [
  // —— 银行与账户 ——
  "借记卡", "信用卡", "储蓄卡", "一类账户", "二类账户", "开户行", "行内转账", "跨行转账", "预约转账", "转账汇款", "收款人", "收款账号", "付款卡", "默认卡", "可用余额", "已锁定金额", "冻结解冻", "挂失", "销户", "对账单", "月度报告", "交易流水", "收支明细", "账户总览", "数字账本",
  // —— 理财与基金 ——
  "年化收益率", "七日年化", "万份收益", "净值", "单位净值", "累计净值", "申购", "赎回", "定投", "建仓", "加仓", "减仓", "清仓", "持仓", "市值", "成本价", "浮盈", "浮亏", "回撤", "最大回撤", "夏普比率", "波动率", "债券基金", "股票基金", "混合基金", "指数基金", "货币基金", "黄金基金", "QDII基金", "FOF基金", "风险等级", "风险承受能力", "适当性匹配", "稳健型", "平衡型", "进取型", "保守型",
  // —— 存款 ——
  "定期存款", "活期存款", "通知存款", "整存整取", "零存整取", "存本取息", "大额存单", "协定存款", "结构性存款", "提前支取", "自动转存", "到期日", "起存金额",
  // —— 贷款与信用 ——
  "贷款利率", "等额本息", "等额本金", "先息后本", "授信额度", "可用额度", "最低还款", "全额还款", "账单日", "还款日", "逾期", "宽限期", "分期付款", "手续费率", "征信", "信用报告",
  // —— 外汇与黄金 ——
  "外汇牌价", "买入价", "卖出价", "中间价", "汇率", "美元", "欧元", "日元", "英镑", "港币", "瑞士法郎", "澳元", "加元", "新加坡元", "换汇", "结汇", "购汇", "伦敦金", "纸黄金",
  // —— 支付与生活 ——
  "扫码支付", "二维码", "水电燃气费", "物业费", "话费充值", "房租", "物业管理", "自动扣款", "免密支付", "消费限额", "单日限额", "转账限额",
  // —— 监管安全 ——
  "反洗钱", "电信诈骗", "止付", "冻结账户", "短信验证码", "动态口令", "双因素认证", "两步验证", "生物识别", "指纹支付", "刷脸支付", "密码器", "风险提示", "投资者适当性", "存款保险", "利率自律", "异地存款",
  // —— 投资术语 ——
  "复利", "单利", "通胀率", "购买力", "资产配置", "分散投资", "止盈", "止损", "定投策略", "再平衡", "股债平衡", "标准普尔", "沪深三百", "中证五百", "科创板", "创业板", "北交所", "港股通", "美股", "A股", "K线", "市盈率", "市净率", "股息率", "分红", "派息", "除权除息",
  // —— Suveoo 专有 ——
  "SuveooAI", "智能助理", "语音输入", "语音识别", "对话即方案", "虚拟组合包", "一键打包", "动态拼装", "长程任务", "攒钱目标", "目标储蓄", "紧急备用金", "生日订花", "定时转账", "周期转账", "余额查询", "收益查询", "交易记录", "消费分类", "支出分析", "月度收支", "环比", "同比", "通知中心", "消息中心", "金融计算器", "图形化计算器", "复利计算", "贷款对比", "存款对比", "通胀计算", "分账计算", "预算分配", "目标规划", "提前还款", "退休规划", "汇率换算", "信任控制台", "确认卡", "强验证", "邮箱验证码", "演示账户",
  // —— 中英混合高频（中英自由说场景） ——
  "API", "APP", "PDF", "OTP", "JWT", "WebAuthn", "Passkey", "Wi-Fi", "ID", "VIP", "SIM卡", "U盾", "K宝", "GSW", "ETF", "LOF", "REITs", "IPO", "ST股票", "T加零", "T加一", "KYC", "AML", "LPR", "MLF", "SLF", "CPI", "PPI", "GDP", "M2", "社融", "北向资金", "南向资金",
];
addAll(CORE);

/* 输出 */
const list = [...words].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
mkdirSync(new URL("../../nls/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../nls/hotwords.txt", import.meta.url), list.join("\n") + "\n", "utf8");
console.log(`hotwords.txt 生成：${list.length} 词（去重后）`);
