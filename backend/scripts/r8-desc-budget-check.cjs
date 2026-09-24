/* r8-desc-budget-check.cjs — desc 预算与单数残留检查（一次性辅助） */
const fs = require("fs");
const src = fs.readFileSync("worker-main.js", "utf8");
const re = /desc:\s*"((?:[^"\\]|\\.)*)"/g;
let total = 0, m;
while ((m = re.exec(src))) total += JSON.parse('"' + m[1] + '"').length;
console.log("TOOL_REGISTRY desc total chars:", total, "/ 5600");
const singular = [...src.matchAll(/birthday_flower(?!s)/g)].length;
console.log("birthday_flower singular occurrences (excl. plural):", singular);
