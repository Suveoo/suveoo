/* i18n-add.mjs — 批量新增 i18n 键并全键重排（用法：node scripts/i18n-add.mjs <keys.json>）
 * keys.json 形如 { "zh-CN": { "a.b": "…" }, "zh-TW": {…}, "en-US": {…} }；
 * 写入 frontend/i18n/{lang}.json（2 空格缩进、全键字典序），并同步 fallback.json = zh-CN.json；
 * 末尾校验四文件键数一致并打印。 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const keysFile = process.argv[2];
if (!keysFile) { console.error("usage: node scripts/i18n-add.mjs <keys.json>"); process.exit(1); }
const patch = JSON.parse(readFileSync(keysFile, "utf8"));
const langs = ["zh-CN", "zh-TW", "en-US"];
const counts = {};
for (const lang of langs) {
  const file = join(root, "frontend", "i18n", `${lang}.json`);
  const dict = JSON.parse(readFileSync(file, "utf8"));
  const add = patch[lang] ?? {};
  for (const [k, v] of Object.entries(add)) dict[k] = v;
  const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  counts[lang] = Object.keys(sorted).length;
}
copyFileSync(join(root, "frontend", "i18n", "zh-CN.json"), join(root, "frontend", "i18n", "fallback.json"));
counts.fallback = counts["zh-CN"];
console.log("i18n key counts:", JSON.stringify(counts));
if (new Set(Object.values(counts)).size !== 1) { console.error("MISMATCH: four files must have equal key counts"); process.exit(1); }
console.log("added:", Object.keys(patch["zh-CN"] ?? {}).join(", "));
