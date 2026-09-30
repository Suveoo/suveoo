/* gen-card-arts.mjs — 卡面清单生成（第四十三轮 credit / 第四十四轮 debit 扩展）
 * 扫描 credit-cards 与 debit-cards 各自的 {mastercard,visa,american-express,unionpay}/ 下 .webp
 * → frontend/assets/data/card-arts.json（分配与渲染的可用图清单，按 kind+组织分组）。
 * deploy-frontend.mjs 已在每次部署前自动重跑：把新卡图放进对应目录再部署即完成"自动更新"。
 * 渲染语义见前端 S.cardFront（art 存 mastercard 槽位基座；组织目录补图后按 network+槽位自动解析换真图）。 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/assets/images/cards-front");
const groups = ["mastercard", "visa", "american-express", "unionpay"];
const out = { generated_at: new Date().toISOString(), debit: {}, credit: {} };
for (const kind of ["debit", "credit"]) {
  for (const g of groups) {
    let files = [];
    try {
      files = readdirSync(resolve(base, `${kind}-cards`, g)).filter((f) => f.endsWith(".webp")).sort();
    } catch { /* 目录暂缺按空处理（渲染回落 mastercard） */ }
    out[kind][g] = files.map((f) => `assets/images/cards-front/${kind}-cards/${g}/${f}`);
  }
}
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/assets/data/card-arts.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`card-arts.json：debit ${groups.map((g) => `${g}=${out.debit[g].length}`).join(" ")} | credit ${groups.map((g) => `${g}=${out.credit[g].length}`).join(" ")}`);
