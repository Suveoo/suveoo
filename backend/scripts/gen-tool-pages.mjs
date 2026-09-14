#!/usr/bin/env node
/**
 * gen-tool-pages.mjs — 生成 frontend/wealth/tools/<slug>/index.html 页面壳。
 * 壳结构照抄 wealth/tools/index.html（canonical/robots=index,follow/OG/唯一中文 description）。
 * 用法：node scripts/gen-tool-pages.mjs --only savings-compound,loan-compare  （缺省生成全部）
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTROOT = path.resolve(HERE, "../../frontend/wealth/tools");

/* 资源版本号跟随站点现有 HTML（避免手改遗漏）；新文件生成后如版本有变仍需全站 sed 递增 */
const probe = readFileSync(path.resolve(HERE, "../../frontend/wealth/index.html"), "utf8");
const V = (probe.match(/[?&]v=(b\d+)/) ?? [])[1] ?? "b1";

const PAGES = {
  "savings-compound": {
    title: "复利储蓄计算器 · Suveoo",
    desc: "复利储蓄计算器：输入本金、年利率、年限、每月追加与复利频率，测算终值、总利息与逐月余额曲线。模拟银行系统，不涉及真实资金。",
    og: "本金与每月追加按年/季/月复利增长，终值、总利息与逐月余额曲线一站测算。",
  },
  "loan-compare": {
    title: "贷款对比计算器 · Suveoo",
    desc: "贷款对比计算器：等额本息与等额本金双栏对照月供、总利息与还款构成，附每月还款额曲线。模拟银行系统，不涉及真实资金。",
    og: "100 万房贷 30 年，等额本息与等额本金差多少？双栏对照与还款曲线给出答案。",
  },
  "goal-planner": {
    title: "目标储蓄计划器 · Suveoo",
    desc: "目标储蓄计划器：按目标金额、现有储蓄、年限与预期年化，计算每月需存金额与缺口，并判断可行性。模拟银行系统，不涉及真实资金。",
    og: "离你的储蓄目标还差多少？输入四个数字，得到每月需存与缺口分析。",
  },
  "credit-payoff": {
    title: "信用卡还款计算器 · Suveoo",
    desc: "信用卡还款计算器：按欠款、APR 与月还款额测算还清月数与总利息，支持按目标月数反推所需月供。模拟银行系统，不涉及真实资金。",
    og: "每月还多少才能摆脱卡债？测算还清月数、总利息与还款构成。",
  },
  retirement: {
    title: "退休规划器 · Suveoo",
    desc: "退休规划器：按当前年龄、退休年龄、退休后月支出、通胀与年化收益，测算所需退休金总额与每月应储蓄。模拟银行系统，不涉及真实资金。",
    og: "退休要攒多少钱？通胀、收益与月支出一键测算所需退休金与每月储蓄。",
  },
  "deposit-compare": {
    title: "存款方案对比器 · Suveoo",
    desc: "存款方案对比器：输入本金与用款期限，对比活期、通知、3/6 个月、1/3 年定期六种方案到期本息并给出推荐。模拟银行系统，不涉及真实资金。",
    og: "这笔钱存哪个方案最划算？六种存款方案到期本息对比与短期/长期推荐。",
  },
  "fx-convert": {
    title: "外汇兑换计算器 · Suveoo",
    desc: "外汇兑换计算器：十币种买卖价双向换算，购汇/结汇按对应方向牌价计价，附点差说明。模拟银行系统，不涉及真实资金。",
    og: "美元、欧元、日元等十币种购汇/结汇双向换算，看清银行点差。",
  },
  "inflation-calculator": {
    title: "通胀购买力计算器 · Suveoo",
    desc: "通胀购买力计算器：测算年通胀率下未来购买力侵蚀、等值所需金额与逐年购买力曲线。模拟银行系统，不涉及真实资金。",
    og: "今天的 10 万，20 年后还值多少？通胀购买力侵蚀一键测算。",
  },
  "split-bill-plus": {
    title: "AA 分账高级版 · Suveoo",
    desc: "AA 分账高级版：总额按人数分摊、支持按人调整（如某人 -60），整数分运算精确到分且总额守恒。模拟银行系统，不涉及真实资金。",
    og: "聚餐 AA 不再算不清：按人调整、精确到分、总额守恒。",
  },
  "budget-allocator": {
    title: "预算分配器 · Suveoo",
    desc: "预算分配器：月收入按 50/30/20 分配到必要开支、个人想要与储蓄，比例可调，环形图直观展示。模拟银行系统，不涉及真实资金。",
    og: "每月工资怎么分？50/30/20 预算分配器帮你划出必要、想要与储蓄。",
  },
};

const shell = (slug, m) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${m.title}</title>
<meta name="description" content="${m.desc}">
<link rel="icon" href="/favicon/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon/favicon.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#FFFFFF">
<meta property="og:title" content="${m.title}">
<meta property="og:image" content="/assets/images/og-image.png">
<link rel="canonical" href="https://suveoo.com/wealth/tools/${slug}">
<meta name="robots" content="index,follow">
<meta property="og:url" content="https://suveoo.com/wealth/tools/${slug}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Suveoo">
<meta property="og:description" content="${m.og}">
<meta property="og:locale" content="zh_CN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${m.title}">
<meta name="twitter:description" content="${m.og}">
<meta name="twitter:image" content="https://suveoo.com/assets/images/og-image.png">
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="stylesheet" href="/assets/css/tokens.css?v=${V}">
<link rel="stylesheet" href="/assets/css/base.css?v=${V}">
<link rel="stylesheet" href="/assets/css/layout.css?v=${V}">
<link rel="stylesheet" href="/assets/css/components.css?v=${V}">
<link rel="stylesheet" href="/assets/css/genui.css?v=${V}">
<link rel="stylesheet" href="/assets/css/trust-console.css?v=${V}">
<link rel="stylesheet" href="/assets/css/pages.css?v=${V}">
<link rel="stylesheet" href="/assets/css/polish.css?v=${V}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-KLK499CDQF"></script>
</head>
<body data-page="${slug}">
<main id="main" class="page"><div id="content"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></main>
<script src="/assets/js/core/format.js?v=${V}" defer></script>
<script src="/assets/js/core/ui.js?v=${V}" defer></script>
<script src="/assets/js/core/api.js?v=${V}" defer></script>
<script src="/assets/js/core/auth.js?v=${V}" defer></script>
<script src="/assets/js/core/ga4.js?v=${V}"></script>
<script src="/assets/js/core/i18n.js?v=${V}" defer></script>
<script src="/assets/js/core/sim-notice.js?v=${V}" defer></script>
<script src="/assets/js/charts/line.js?v=${V}" defer></script>
<script src="/assets/js/charts/bar.js?v=${V}" defer></script>
<script src="/assets/js/charts/donut.js?v=${V}" defer></script>
<script src="/assets/js/charts/sankey.js?v=${V}" defer></script>
<script src="/assets/js/charts/sparkline.js?v=${V}" defer></script>
<script src="/assets/js/genui/renderer.js?v=${V}" defer></script>
<script src="/assets/js/genui/cards.js?v=${V}" defer></script>
<script src="/assets/js/genui/consent.js?v=${V}" defer></script>
<script src="/assets/js/chat/chat-client.js?v=${V}" defer></script>
<script src="/assets/js/chat/trust-console.js?v=${V}" defer></script>
<script src="/assets/js/core/router.js?v=${V}" defer></script>
<script src="/assets/js/core/app.js?v=${V}" defer></script>
<script src="/assets/js/tools/tool-kit.js?v=${V}" defer></script>
<script src="/assets/js/pages/${slug}.js?v=${V}" defer></script>
</body>
</html>
`;

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1].split(",") : null;
for (const [slug, m] of Object.entries(PAGES)) {
  if (only && !only.includes(slug)) continue;
  const dir = path.join(OUTROOT, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), shell(slug, m), "utf8");
  console.log("wrote", path.join(dir, "index.html"));
}
