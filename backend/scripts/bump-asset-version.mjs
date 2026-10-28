/* bump-asset-version.mjs — 全站 HTML 资产版本号 +1（?v=bNN → ?v=bNN+1）
 * 用法：node scripts/bump-asset-version.mjs   （无参数；从任一 HTML 探测当前版本，74 个文件统一改写）
 * 历史惯例：每次前端部署跳一版，强推全部资产缓存（b197→b198 先例）。 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend");
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".html")) files.push(p);
  }
};
walk(root);

let cur = null;
for (const f of files) {
  const m = readFileSync(f, "utf8").match(/[?&]v=b(\d+)/);
  if (m) { cur = m[1]; break; }
}
if (!cur) { console.error("no ?v=bNN found in any html"); process.exit(1); }
const next = `b${Number(cur) + 1}`;
const re = /([?&])v=b\d+/g;
let changed = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!/v=b\d+/.test(src)) continue;
  writeFileSync(f, src.replace(re, `$1v=${next}`), "utf8");
  changed++;
}
console.log(`asset version → ${next}; ${changed}/${files.length} html files rewritten`);
