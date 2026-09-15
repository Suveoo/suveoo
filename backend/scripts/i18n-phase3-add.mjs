/* 一次性脚本：阶段 3 新增 i18n 键（三语）+ 全键重排序 */
import { readFileSync, writeFileSync } from "node:fs";

const NEW = {
  "acct.balance": ["账户余额", "帳戶餘額", "Account Balance"],
  "acct.overview": ["资产概要", "資產概覽", "Assets Overview"],
  "acct.recent": ["最近交易", "最近交易", "Recent Transactions"],
  "bench.dsNote": ["其余 {0} 个为程序化生成用例（模拟环境）。", "其餘 {0} 個為程序化生成用例（模擬環境）。", "The remaining {0} cases are programmatically generated (simulated environment)."],
  "bench.mAttack": ["攻击用例构成", "攻擊用例構成", "Attack Case Composition"],
  "bench.mAttackBody": ["共 {0} 个对抗样本，覆盖提示注入、重放攻击、越权调用与确认卡参数突变四类；全部经 /mcp 工具通道投递并断言阻断。", "共 {0} 個對抗樣本，覆蓋提示注入、重放攻擊、越權調用與確認卡參數突變四類；全部經 /mcp 工具通道投遞並斷言阻斷。", "{0} adversarial samples covering prompt injection, replay attacks, authorization bypass, and consent-card parameter mutation; all delivered via the /mcp tool channel with blocking asserted."],
  "bench.mControl": ["对照口径", "對照口徑", "Control Setup"],
  "bench.mControlBody": ["Baseline 为关闭 Verification Runtime 的同一系统对照模式；Ours 为启用五道验证（策略分级/Consent 绑定/溯源/不变量/防重放）的完整链路。", "Baseline 為關閉 Verification Runtime 的同一系統對照模式；Ours 為啟用五道驗證（策略分級/Consent 綁定/溯源/不變量/防重放）的完整鏈路。", "Baseline is the same system with the Verification Runtime disabled; Ours is the full pipeline with all five verification stages (policy tiers, consent binding, provenance, invariants, replay defense)."],
  "bench.mDs": ["数据集构成", "數據集構成", "Dataset Composition"],
  "bench.mDsBody": ["共 {0} 个用例：{1} 个人工精标场景 + {2} 个对抗攻击用例，其余为程序化生成；由 backend/tests 的单测、集成与对抗用例汇总。", "共 {0} 個用例：{1} 個人工精標場景 + {2} 個對抗攻擊用例，其餘為程序化生成；由 backend/tests 的單測、集成與對抗用例匯總。", "{0} cases in total: {1} human-curated scenarios + {2} adversarial attack cases, with the rest generated programmatically; aggregated from backend/tests unit, integration, and attack suites."],
  "bench.method": ["评测方法", "評測方法", "Methodology"],
  "bench.mScope": ["口径与局限", "口徑與侷限", "Scope and Limitations"],
  "bench.mScopeBody": ["全部数字产生于本仓库模拟环境（不涉及真实资金）；Ablation 图为 Unsafe Action Rate 在三个模型族上的对比。", "全部數字產生於本倉庫模擬環境（不涉及真實資金）；Ablation 圖為 Unsafe Action Rate 在三個模型族上的對比。", "All numbers are produced in this repository's simulated environment (no real funds); the ablation chart compares Unsafe Action Rate across three model families."],
  "ch.inLabel": ["收入", "收入", "In"],
  "ch.loadMore": ["加载更多", "載入更多", "Load more"],
  "ch.outLabel": ["支出", "支出", "Out"],
  "deps.compare": ["存款对比", "存款對比", "Deposit Comparison"],
  "dl.dataNote": ["报告含当月资产快照与全部交易流水，由 pdf-lib 在服务端生成；数据为模拟数据，不构成真实对账单。", "報告含當月資產快照與全部交易流水，由 pdf-lib 在服務端生成；數據為模擬數據，不構成真實對帳單。", "Each report contains the monthly asset snapshot and full transaction history, generated server-side with pdf-lib; data is simulated and not a real statement."],
  "dl.dataNoteLb": ["数据说明", "數據說明", "Data Notes"],
  "dl.statusPending": ["待生成", "待生成", "Not generated"],
  "dl.statusReady": ["已生成", "已生成", "Ready"],
  "funds.noMatch": ["没有匹配的基金", "沒有匹配的基金", "No matching funds"],
  "funds.searchPh": ["搜索基金名称 / 代码", "搜尋基金名稱 / 代碼", "Search fund name / code"],
  "funds.sort": ["排序", "排序", "Sort"],
  "funds.sort6m": ["近 6 月收益（高→低）", "近 6 月收益（高→低）", "6M return (high→low)"],
  "funds.sortDefault": ["默认排序", "默認排序", "Default order"],
  "funds.sortRisk": ["风险等级（低→高）", "風險等級（低→高）", "Risk level (low→high)"],
  "notif.emptyUnread": ["没有未读通知", "沒有未讀通知", "No unread notifications"],
  "notif.read": ["已读", "已讀", "Read"],
  "notif.unread": ["未读", "未讀", "Unread"],
  "rec.doneHint": ["请使用新密码返回登录。", "請使用新密碼返回登錄。", "Please return to login with your new password."],
  "rec.step1": ["验证身份", "驗證身份", "Verify identity"],
  "rec.step2": ["设置新密码", "設定新密碼", "Set new password"],
  "rec.step3": ["完成", "完成", "Done"],
};

for (const [file, idx] of [["zh-CN", 0], ["zh-TW", 1], ["en-US", 2]]) {
  const path = `../frontend/i18n/${file}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  let added = 0;
  for (const [k, vals] of Object.entries(NEW)) {
    if (json[k] == null) { json[k] = vals[idx]; added++; }
  }
  const sorted = {};
  for (const k of Object.keys(json).sort()) sorted[k] = json[k];
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
  console.log(file, "added", added, "total", Object.keys(sorted).length);
}
