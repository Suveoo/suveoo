/* 第十一期 site_guide 覆盖度自检（node 直跑，不进 vitest——workerd 池无宿主文件系统）：
 *   node scripts/check-site-coverage.mjs
 * 知识路由集 vs 前端真实页面路由集（frontend 各目录 index.html + 根 + 404，动态卡路由折叠为模板）
 * 双向差集为 0 且总数 75 才算知识注入完成；退出码非 0 = 覆盖不全。 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SITE_GUIDE_PAGES } from "../worker-main.js";

const root = fileURLToPath(new URL("../../frontend", import.meta.url));
const routes = new Set();
if (existsSync(join(root, "index.html"))) routes.add("/");
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (existsSync(join(full, "index.html"))) routes.add(prefix + name);
    walk(full, prefix + name + "/");
  }
};
walk(root, "/");
routes.add("/404");
/* /download（第六十八轮）：noindex 无任何站内入口的 APK 直达页——AI 无引导场景，不入知识库（v3.109 后本脚本未跑，此处收口漂移） */
routes.delete("/download");
/* 动态卡路由折叠为模板（frontend 物理目录 account/card/{settings|history|report-loss} 对应 URL /account/card/{slug}/xxx） */
routes.delete("/account/card/history");
routes.delete("/account/card/settings");
routes.delete("/account/card/report-loss");
routes.add("/account/card/{slug}/history");
routes.add("/account/card/{slug}/settings");
routes.add("/account/card/{slug}/report-loss");

const kb = new Set(SITE_GUIDE_PAGES.map((p) => p.route));
const missing = [...routes].filter((r) => !kb.has(r));
const extra = [...kb].filter((r) => !routes.has(r));
console.log(`前端页面路由: ${routes.size} | 知识库路由: ${SITE_GUIDE_PAGES.length}`);
if (missing.length) console.log("MISSING（前端有、知识库无）:", missing);
if (extra.length) console.log("EXTRA（知识库有、前端无）:", extra);
if (routes.size !== 76 || missing.length || extra.length || kb.size !== 76) {
  console.error("覆盖度不达标（须 76/76、差集为 0）");
  process.exit(1);
}
console.log("覆盖度 76/76，双向差集为 0 ✓");
