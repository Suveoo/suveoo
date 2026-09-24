/* r8-i18n-update.mjs — 第八期 i18n 新键迁移（幂等）：10 键 ×4 文件，字母序，键集一致性验证 */
import { readFileSync, writeFileSync } from "node:fs";

const NEW = {
  "zh-CN": {
    "genui.confirmBirthday": "生日预订确认",
    "genui.confirmReminder": "提醒任务确认",
    "genui.lockNote": "确认后立即锁定 ¥{0}（活期可用额度减少）；到期自动扣款，取消即解锁退回。",
    "genui.remindItem": "提醒内容",
    "genui.taskItem": "预订内容",
    "sch.yearly": "每年",
    "tasks.demoDone": "演示执行完成：已扣锁定资金并完成预订",
    "tasks.demoRun": "立即演示执行",
    "tasks.heldBadge": "已锁定 ¥{0}",
    "trust.injectedNote": "已注入：下次到点将演示 T2 ✗ → C1 自动补偿",
  },
};
NEW["fallback"] = NEW["zh-CN"];
NEW["zh-TW"] = {
  "genui.confirmBirthday": "生日預訂確認",
  "genui.confirmReminder": "提醒任務確認",
  "genui.lockNote": "確認後立即鎖定 ¥{0}（活期可用額度減少）；到期自動扣款，取消即解鎖退回。",
  "genui.remindItem": "提醒內容",
  "genui.taskItem": "預訂內容",
  "sch.yearly": "每年",
  "tasks.demoDone": "演示執行完成：已扣鎖定資金並完成預訂",
  "tasks.demoRun": "立即演示執行",
  "tasks.heldBadge": "已鎖定 ¥{0}",
  "trust.injectedNote": "已注入：下次到點將演示 T2 ✗ → C1 自動補償",
};
NEW["en-US"] = {
  "genui.confirmBirthday": "Birthday booking confirmation",
  "genui.confirmReminder": "Reminder confirmation",
  "genui.lockNote": "On confirmation, ¥{0} is locked (available balance drops); charged at execution, unlocked instantly if cancelled.",
  "genui.remindItem": "Reminder",
  "genui.taskItem": "Booking item",
  "sch.yearly": "Yearly",
  "tasks.demoDone": "Demo run complete: locked funds charged and order placed",
  "tasks.demoRun": "Demo run now",
  "tasks.heldBadge": "Locked ¥{0}",
  "trust.injectedNote": "Injected: next run will demo T2 ✗ → C1 auto-compensation",
};

const DIR = new URL("../../frontend/i18n/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = ["zh-CN", "zh-TW", "en-US", "fallback"];
const sets = [];
for (const f of files) {
  const p = `${DIR}/${f}.json`;
  const obj = JSON.parse(readFileSync(p, "utf8"));
  const before = Object.keys(obj).length;
  for (const [k, v] of Object.entries(NEW[f])) {
    if (obj[k] !== undefined && obj[k] !== v) throw new Error(`${f}: key ${k} exists with different value — refusing`);
    obj[k] = v;
  }
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  const after = Object.keys(sorted).length;
  console.log(`${f}: ${before} -> ${after} keys (+${after - before})`);
  sets.push(new Set(Object.keys(sorted)));
}
const base = [...sets[0]];
for (let i = 1; i < sets.length; i++) {
  const miss = base.filter((k) => !sets[i].has(k));
  const extra = [...sets[i]].filter((k) => !sets[0].has(k));
  if (miss.length || extra.length) throw new Error(`key set mismatch ${files[i]}: miss=${miss} extra=${extra}`);
}
console.log("KEY SETS IDENTICAL across 4 files:", base.length, "keys");
