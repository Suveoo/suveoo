/* gen-card-arts.mjs — 信用卡卡面清单生成（第四十三轮）
 * 扫描 frontend/assets/images/cards-front/credit-cards/{mastercard,visa,american-express,unionpay}/
 * 的 .webp 文件 → frontend/assets/data/card-arts.json（发卡分配的可用图清单，按组织分组）。
 * deploy-frontend.mjs 已在每次部署前自动重跑本脚本：把新卡图放进对应目录再部署即完成"自动更新"。
 * 约定：图片命名任意（取 .webp 排序序即槽位序）；每组织至少 1 张方对该组织生效，否则分配回落 mastercard。 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/assets/images/cards-front/credit-cards");
const groups = ["mastercard", "visa", "american-express", "unionpay"];
const out = { generated_at: new Date().toISOString(), arts: {} };
for (const g of groups) {
  let files = [];
  try {
    files = readdirSync(resolve(base, g)).filter((f) => f.endsWith(".webp")).sort();
  } catch { /* 目录暂缺按空处理（分配回落 mastercard） */ }
  out.arts[g] = files.map((f) => `assets/images/cards-front/credit-cards/${g}/${f}`);
}
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/assets/data/card-arts.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`card-arts.json：${groups.map((g) => `${g}=${out.arts[g].length}`).join(" ")}`);
