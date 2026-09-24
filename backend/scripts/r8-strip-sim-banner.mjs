/* 第八轮：移除紧随页面大标题的模拟系统提示（S.sim.banner/footnote）——纯 ASCII 替换+断言+parse 复查 */
import fs from "node:fs";
import vm from "node:vm";

const P = "frontend/assets/js/pages/";
const files = ["bills", "cards", "card-settings", "funds", "intrabank-scheduled", "deposits", "deposit-detail", "fx", "security", "intrabank", "transfer-limits"];
const TOK = "${S.sim.banner()}";
for (const f of files) {
  const p = P + f + ".js";
  let s = fs.readFileSync(p, "utf8");
  const n = s.split(TOK).length - 1;
  if (n !== 1) { console.log("SKIP", f, "count", n); continue; }
  s = s.split(TOK).join("");
  fs.writeFileSync(p, s);
  console.log("stripped banner:", f);
}
{
  const p = P + "contact.js";
  let s = fs.readFileSync(p, "utf8");
  const before = s.split("${S.sim.footnote()}").length - 1;
  s = s.replace(/\n[ \t]*\$\{S\.sim\.footnote\(\)\}/, "");
  const after = s.split("${S.sim.footnote()}").length - 1;
  console.log("contact footnote:", before, "->", after);
  fs.writeFileSync(p, s);
}
{
  const p = P + "tools.js";
  let s = fs.readFileSync(p, "utf8");
  const n = s.split("${S.sim.footnote()}").length - 1;
  s = s.split("${S.sim.footnote()}").join("");
  console.log("tools footnote removed:", n);
  fs.writeFileSync(p, s);
}
for (const f of [...files, "contact", "tools", "subscriptions"]) {
  try { new vm.Script(fs.readFileSync(P + f + ".js", "utf8")); }
  catch (e) { console.log("PARSE FAIL", f, e.message); process.exit(1); }
}
console.log("all parse OK");
let residual = 0;
for (const f of fs.readdirSync(P)) {
  const s = fs.readFileSync(P + f, "utf8");
  if (/<\/h1>\$\{S\.sim\.(banner|footnote)\(\)\}/.test(s)) { console.log("RESIDUAL after h1:", f); residual++; }
}
console.log("residual-after-h1:", residual);
