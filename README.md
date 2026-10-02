# Suveoo — Agentic Banking Control Plane

> **银行 AI 智能体。这是模拟银行系统，不涉及真实资金行为。**

**简介**：Suveoo 把 AI 的概率性智能与金融授权的确定性彻底分离：**LLM 只能"提议"，提议必须编译为 BankAction IR，并通过 Suveoo Verification Runtime 五道确定性验证（策略分级 · 同意绑定 · 来源污染追踪 · 金融不变量 · 幂等重放），`VERIFIED` 后才允许触达资金。** 经典表单与 AI 通道走同一条验证流水线——系统不存在绕过验证的特权通道。

## 1. 相关资讯

### 1.1 站点

`https://suveoo.com`（www.suveoo.com 自动跳转裸域 suveoo.com）

### 1.2 演示账户

`demo@suveoo.com` / `jinrongkeji2026`（需先执行下方种子命令；登录含邮箱验证码 2FA）

### 1.3 竞赛指定的六大场景入口

Suveoo AI 对话页（AA 分账 / 账单归因 / 理财推荐 / 卡片围栏 / 订阅治理 / 生日订花 Saga + 故障注入）

## 2. 架构概览

### 2.1 逻辑

```
自然语言/表单 → Agent Planner(LLM, Key 仅在服务端)
   → BankAction IR（facts 带 provenance/trust）
   → Suveoo Verification Runtime（五道确定性验证）
   → VERIFIED → LedgerDO/SagaDO（SQLite 账本 + Saga 补偿）
```

### 2.2 基础设施

Cloudflare 1 Worker + 2 KV + 1 R2 + 2 Durable Object class + Email Service + Telegram 运维通知（tgFire，waitUntil 生命周期保障）。前端为无构建 MPA + PWA（三语 zh-CN/zh-TW/en-US）。

## 3. 架构和部署简介

### 3.1 本地运行

```bash
cd backend
npm install
npx wrangler dev          # http://127.0.0.1:8787（需先 wrangler login；R2 走远端桶）
npm test                  # 287 用例（真实 workerd 运行时）
```

### 3.2 部署简要说明

```bash
cd backend
npx wrangler deploy                     # Worker（路由 suveoo.com/* 已配置）
node scripts/deploy-frontend.mjs        # 前端全量上传 R2（put+get 回验）
# 注入演示种子（DEMO_MODE=true 且 x-admin-token 与 secret ADMIN_TOKEN 匹配，fail-closed；
# 可选 body {"email":"..."} 为任意已注册账户灌全板块仿真数据、{"inspect":true} 只读巡检查收款人合法性）
curl -X POST -H "x-admin-token: <ADMIN_TOKEN>" https://suveoo.com/api/demo/seed
```

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

### 3.3 仓库结构

```
backend/   单文件 Worker（worker-main.js，七大区块）+ tests（unit/integration/attack/bench，53 个测试文件）
frontend/  无构建 MPA（74 页面 + 60 控制器 + i18n 四包 1263 键 + 数据 JSON + 自研 SVG 图表）→ 整目录上传 R2
docs/      architecture / core-algorithms / security-self-assessment / test-cases
```

### 3.4 文档

**架构**：[docs/architecture.md](./docs/architecture.md)

**核心算法**：[docs/core-algorithms.md](./docs/core-algorithms.md)

**安全自评**（权限分级 + 已知风险）：[docs/security-self-assessment.md](./docs/security-self-assessment.md)

**测试用例**：[docs/test-cases.md](./docs/test-cases.md)

**部署**：[DEPLOYMENT.md](./DEPLOYMENT.md)

### 3.5 安全要點速览

**三色权限**：绿自动 / 黄确认（grant_hash 参数级绑定，120s）/ 红强验证（+邮箱 OTP）

**防注入**：授权字段必须 TRUSTED 来源；商户备注等外部文本不能产生授权（先于授权请求拦截）

**防幻觉**：结果只来自账本；GenUI 卡片数据只来自已验证快照；金额 bigint 分杜绝浮点

**防重放**：IR nonce 幂等集

**Saga**：T1✓→T2✗→C1✓ 补偿（生日订花现场可注入故障演示）

### 3.6 Project Directory Tree

```
D:\suveoo\
├── .github/
│   └── workflows/
│       ├── deploy.yml                        # CI/CD：测试 → wrangler deploy → R2 前端上传
│       └── test.yml                          # PR/push：unit + integration + attack 全量测试
├── backend/
│   ├── bench/
│   │   ├── glm-baseline-20260921-long.json
│   │   ├── glm-baseline-20260921.json
│   │   ├── quality-matrix-2026-09-20.json
│   │   ├── quality-matrix-output.txt
│   │   └── quality-matrix-progress.txt
│   ├── scripts/
│   │   ├── ai-bench-baseline.json
│   │   ├── ai-bench-long.json
│   │   ├── ai-bench-post1.json
│   │   ├── ai-bench-post2.json
│   │   ├── ai-bench-post3.json
│   │   ├── ai-bench-post4.json
│   │   ├── ai-bench.mjs
│   │   ├── ai-confirm.mjs
│   │   ├── ai-diag.mjs
│   │   ├── check-site-coverage.mjs
│   │   ├── deploy-frontend.mjs               # 前端两阶段上传 R2（资产先就位、HTML 最后切换）
│   │   ├── gen-fund-data.mjs
│   │   ├── gen-tool-pages.mjs
│   │   ├── i18n-add-tc.mjs
│   │   ├── i18n-add.mjs
│   │   ├── i18n-keys-round22-a.json
│   │   ├── i18n-keys-round22-b.json
│   │   ├── i18n-keys-round22-c.json
│   │   ├── i18n-keys-task1.json
│   │   ├── i18n-keys-task2.json
│   │   ├── i18n-keys-task4.json
│   │   ├── i18n-phase3-add.mjs
│   │   ├── i18n-r35-add.mjs
│   │   ├── i18n-r7-update.mjs
│   │   ├── measure-payload.mjs
│   │   ├── noto-sans-sc-report.ttf
│   │   ├── pdf-repro.mjs
│   │   ├── quality-matrix.mjs
│   │   ├── r8-desc-budget-check.cjs
│   │   ├── r8-i18n-update.mjs
│   │   ├── r8-strip-sim-banner.mjs
│   │   ├── seed-demo-data.mjs
│   │   ├── subset-cjk.mjs.py                 # 报告 PDF 中文字体预子集（fontTools）
│   │   └── verify-payee-phone.mjs
│   ├── tests/
│   │   ├── attack/                           # 攻击测试（提示注入/越权/重放/同意篡改）
│   │   │   ├── authorization-bypass.test.js
│   │   │   ├── consent-mutation.test.js
│   │   │   ├── prompt-injection.test.js
│   │   │   └── replay-attack.test.js
│   │   ├── bench/                            # 评测集（红队矩阵/长会话基准）
│   │   │   └── generate-benchmark.js
│   │   ├── helpers/
│   │   │   └── test-creds.js
│   │   ├── integration/                      # 集成测试（转账/预约/通知/理财/生日链等 40+ 文件）
│   │   │   ├── birthday-chain.test.js
│   │   │   ├── card-ledger.test.js
│   │   │   ├── card-reveal.test.js
│   │   │   ├── chat-history.test.js
│   │   │   ├── circuit-breaker.test.js
│   │   │   ├── contact-mail.test.js
│   │   │   ├── dashboard-ext.test.js
│   │   │   ├── demo-admin.test.js
│   │   │   ├── dimensional-seed.test.js
│   │   │   ├── funds-nav.test.js
│   │   │   ├── fx-exchange.test.js
│   │   │   ├── goals-chain.test.js
│   │   │   ├── new-tools.test.js
│   │   │   ├── notifications-center.test.js
│   │   │   ├── payee-phone.test.js
│   │   │   ├── proposals-flow.test.js
│   │   │   ├── redteam-guard.test.js
│   │   │   ├── registration-provisioning.test.js
│   │   │   ├── saga-compensation.test.js
│   │   │   ├── scheduled-tasks.test.js
│   │   │   ├── security-credential.test.js
│   │   │   ├── self-seed.test.js
│   │   │   ├── solution-package.test.js
│   │   │   ├── static-routing.test.js
│   │   │   ├── transfer-flow.test.js
│   │   │   ├── tx-scope.test.js
│   │   │   └── wealth-redeem.test.js
│   │   └── unit/                             # 单元测试（LLM 流/IR/安全语义锁定等）
│   │       ├── auth-crypto.test.js
│   │       ├── calc-tools.test.js
│   │       ├── card-plan.test.js
│   │       ├── chat-history.test.js
│   │       ├── consent-binding.test.js
│   │       ├── fund-data.test.js
│   │       ├── fund-nav-live.test.js
│   │       ├── goals.test.js
│   │       ├── idempotency.test.js
│   │       ├── invariants.test.js
│   │       ├── ir-compiler.test.js
│   │       ├── llm-stream.test.js
│   │       ├── money-math.test.js
│   │       ├── policy-engine.test.js
│   │       ├── proposal-engine.test.js
│   │       ├── reminder-task.test.js
│   │       ├── schema-migration.test.js
│   │       ├── seed-dimensional.test.js
│   │       ├── seed-mogul.test.js
│   │       ├── site-guide.test.js
│   │       └── taint-check.test.js
│   ├── .dev.vars.example
│   ├── package-lock.json
│   ├── package.json                          # agents/@modelcontextprotocol/zod/pdf-lib/vitest/wrangler
│   ├── reports
│   ├── vitest.config.js                      # cloudflareTest 插件（真实 workerd）
│   ├── worker-main.js                        # ★ 唯一 Worker 入口（路由/LedgerDO/SagaDO/IR 五道验证/LLM/MCP 54 工具/报告 PDF/site_guide）
│   ├── wrangler.test.toml                    # vitest-pool-workers 测试环境（+MAIL_OUTBOX）
│   └── wrangler.toml                         # 1 Worker + 2 KV + R2 + 2 DO + send_email 绑定
├── docs/
│   ├── architecture.md                       # 系统架构图（五层拓扑、转账时序）
│   ├── core-algorithms.md                    # 核心算法（IR 编译、五道验证、Saga、分账数学）
│   ├── design-language.md
│   ├── security-self-assessment.md           # 安全自评（权限分级 + 已知风险）
│   └── test-cases.md                         # 测试用例说明
├── frontend/
│   ├── .well-known/
│   │   └── security.txt
│   ├── about/
│   │   └── index.html
│   ├── account/
│   │   ├── card/
│   │   │   ├── history/
│   │   │   │   └── index.html
│   │   │   └── settings/
│   │   │       └── index.html
│   │   ├── cards/
│   │   │   └── index.html
│   │   ├── dashboard/
│   │   │   └── index.html
│   │   ├── downloads/
│   │   │   └── index.html
│   │   ├── login/
│   │   │   └── index.html
│   │   ├── recovery/
│   │   │   └── index.html
│   │   ├── register/
│   │   │   └── index.html
│   │   ├── risk-assessment/
│   │   │   └── index.html
│   │   ├── security/
│   │   │   └── index.html
│   │   ├── transactions/
│   │   │   └── index.html
│   │   └── index.html
│   ├── ai/
│   │   ├── benchmark/
│   │   │   └── index.html
│   │   ├── proposals/
│   │   │   └── index.html
│   │   ├── tasks/
│   │   │   └── index.html
│   │   └── index.html
│   ├── assets/
│   │   ├── css/
│   │   │   ├── base.css                      # 基础重置
│   │   │   ├── components.css                # 组件库（btn/card/table/modal…）
│   │   │   ├── genui.css                     # GenUI 确认卡
│   │   │   ├── layout.css                    # 全局框架（header/侧栏/footer）
│   │   │   ├── pages.css                     # 页面级系统（tf-*/nt-*/cs-*/dc-tbl…）
│   │   │   ├── polish.css                    # 光学精修层（最后加载，覆盖型规则置此）
│   │   │   ├── tokens.css                    # 设计令牌
│   │   │   └── trust-console.css             # Trust Console
│   │   ├── data/                             # 公共数据 JSON（理财/汇率/公告，R2 直读）
│   │   │   ├── deposits/
│   │   │   │   ├── demand.json
│   │   │   │   ├── notice-7d.json
│   │   │   │   ├── term-1y.json
│   │   │   │   ├── term-3m.json
│   │   │   │   ├── term-3y.json
│   │   │   │   └── term-6m.json
│   │   │   ├── funds/
│   │   │   │   ├── ai-semi.json
│   │   │   │   ├── apac-tech.json
│   │   │   │   ├── cn-dividend.json
│   │   │   │   ├── consumer-staples.json
│   │   │   │   ├── em-gov-bond.json
│   │   │   │   ├── esg-bond.json
│   │   │   │   ├── global-equity-index.json
│   │   │   │   ├── global-mixed-1.json
│   │   │   │   ├── global-mixed-2.json
│   │   │   │   ├── global-money-1.json
│   │   │   │   ├── global-short-bond.json
│   │   │   │   ├── gold-index.json
│   │   │   │   ├── healthcare-bio.json
│   │   │   │   ├── new-energy.json
│   │   │   │   ├── quant-neutral.json
│   │   │   │   └── reit-global.json
│   │   │   ├── announcements.json
│   │   │   ├── benchmark.json
│   │   │   ├── faq.json
│   │   │   └── fx.json
│   │   ├── fonts/                            # 报告 PDF 中文子集字体
│   │   │   ├── inter-variable.ttf
│   │   │   ├── noto-sans-mono.ttf
│   │   │   ├── noto-sans-sc-report.ttf
│   │   │   ├── noto-sans-sc.ttf
│   │   │   └── noto-sans-tc.ttf
│   │   ├── icons/
│   │   │   └── sprite.svg                    # 线性图标雪碧图
│   │   ├── images/                           # 插画/卡面/og 等素材
│   │   │   ├── cards-front/
│   │   │   │   ├── credit-cards/
│   │   │   │   │   ├── credit-card-1-front.jpg
│   │   │   │   │   ├── credit-card-1-front.svg
│   │   │   │   │   ├── credit-card-1-front.webp
│   │   │   │   │   ├── credit-card-2-front.jpg
│   │   │   │   │   ├── credit-card-2-front.svg
│   │   │   │   │   ├── credit-card-2-front.webp
│   │   │   │   │   ├── credit-card-3-front.jpg
│   │   │   │   │   ├── credit-card-3-front.svg
│   │   │   │   │   ├── credit-card-3-front.webp
│   │   │   │   │   ├── credit-card-4-front.jpg
│   │   │   │   │   ├── credit-card-4-front.svg
│   │   │   │   │   └── credit-card-4-front.webp
│   │   │   │   ├── debit-cards/
│   │   │   │   │   ├── debit-card-1-front.jpg
│   │   │   │   │   ├── debit-card-1-front.svg
│   │   │   │   │   ├── debit-card-1-front.webp
│   │   │   │   │   ├── debit-card-2-front.jpg
│   │   │   │   │   ├── debit-card-2-front.svg
│   │   │   │   │   ├── debit-card-2-front.webp
│   │   │   │   │   ├── debit-card-3-front.jpg
│   │   │   │   │   ├── debit-card-3-front.svg
│   │   │   │   │   ├── debit-card-3-front.webp
│   │   │   │   │   ├── debit-card-4-front.jpg
│   │   │   │   │   ├── debit-card-4-front.svg
│   │   │   │   │   ├── debit-card-4-front.webp
│   │   │   │   │   ├── debit-card-5-front.jpg
│   │   │   │   │   ├── debit-card-5-front.svg
│   │   │   │   │   ├── debit-card-5-front.webp
│   │   │   │   │   ├── debit-card-6-front.jpg
│   │   │   │   │   ├── debit-card-6-front.svg
│   │   │   │   │   ├── debit-card-6-front.webp
│   │   │   │   │   ├── debit-card-7-front.jpg
│   │   │   │   │   ├── debit-card-7-front.svg
│   │   │   │   │   ├── debit-card-7-front.webp
│   │   │   │   │   ├── debit-card-8-front.jpg
│   │   │   │   │   ├── debit-card-8-front.svg
│   │   │   │   │   └── debit-card-8-front.webp
│   │   │   │   ├── credit-card-1-front.webp
│   │   │   │   ├── credit-card-2-front.webp
│   │   │   │   ├── credit-card-3-front.webp
│   │   │   │   ├── credit-card-4-front.webp
│   │   │   │   ├── debit-card-1-front.webp
│   │   │   │   ├── debit-card-2-front.webp
│   │   │   │   ├── debit-card-3-front.webp
│   │   │   │   ├── debit-card-4-front.webp
│   │   │   │   ├── debit-card-5-front.webp
│   │   │   │   ├── debit-card-6-front.webp
│   │   │   │   ├── debit-card-7-front.webp
│   │   │   │   └── debit-card-8-front.webp
│   │   │   ├── illustrations/
│   │   │   │   ├── ai-deco.svg
│   │   │   │   ├── ai-hero.svg
│   │   │   │   ├── assets-coins.svg
│   │   │   │   ├── badge-achievement.svg
│   │   │   │   ├── badge-perk.svg
│   │   │   │   ├── bill-due.svg
│   │   │   │   ├── card-repay.svg
│   │   │   │   ├── cat-deposit.svg
│   │   │   │   ├── cat-fund.svg
│   │   │   │   ├── cat-insurance.svg
│   │   │   │   ├── dca-auto.svg
│   │   │   │   ├── empty-state.svg
│   │   │   │   ├── error-404.svg
│   │   │   │   ├── offline.svg
│   │   │   │   ├── product-card-perks.svg
│   │   │   │   ├── README.md
│   │   │   │   ├── security-shield.svg
│   │   │   │   └── wallet-cashflow.svg
│   │   │   ├── about-banner.webp
│   │   │   ├── home-banner.webp
│   │   │   ├── og-image.jpg
│   │   │   ├── og-image.png
│   │   │   ├── og-image.webp
│   │   │   ├── suveoo-ai-logo.png
│   │   │   ├── suveoo-ai-logo.svg
│   │   │   ├── suveoo-logo-circular.png
│   │   │   ├── suveoo-logo-circular.svg
│   │   │   ├── suveoo-logo-long.png
│   │   │   ├── suveoo-logo-long.svg
│   │   │   ├── suveoo-logo-square.png
│   │   │   └── suveoo-logo-square.svg
│   │   └── js/
│   │       ├── charts/                       # 自研 SVG 图表（line/bar/donut/sparkline/sankey）
│   │       │   ├── bar.js
│   │       │   ├── donut.js
│   │       │   ├── line.js
│   │       │   ├── sankey.js
│   │       │   └── sparkline.js
│   │       ├── chat/                         # AI 对话客户端 + Trust Console
│   │       │   ├── chat-client.js
│   │       │   └── trust-console.js
│   │       ├── core/                         # 核心运行时（app/router/api/auth/i18n/md/ctl/ui/fmt/insights…）
│   │       │   ├── api.js
│   │       │   ├── app.js
│   │       │   ├── auth.js
│   │       │   ├── ctl.js
│   │       │   ├── format.js
│   │       │   ├── ga4.js
│   │       │   ├── i18n.js
│   │       │   ├── insights.js
│   │       │   ├── md.js
│   │       │   ├── prefetch.js
│   │       │   ├── router.js
│   │       │   ├── sim-notice.js
│   │       │   ├── ui.js
│   │       │   └── voice.js
│   │       ├── genui/                        # 确认卡渲染/两段式 consent/OTP
│   │       │   ├── cards.js
│   │       │   ├── consent.js
│   │       │   └── renderer.js
│   │       ├── pages/                        # 75 页控制器（S.toolPages 双用=页面+AI 内嵌）
│   │       │   ├── about.js
│   │       │   ├── account.js
│   │       │   ├── ai-benchmark.js
│   │       │   ├── ai-tasks.js
│   │       │   ├── ai.js
│   │       │   ├── bills.js
│   │       │   ├── budget-allocator.js
│   │       │   ├── card-history.js
│   │       │   ├── card-settings.js
│   │       │   ├── cards.js
│   │       │   ├── contact.js
│   │       │   ├── credit-payoff.js
│   │       │   ├── dashboard.js
│   │       │   ├── demo-lab.js
│   │       │   ├── deposit-compare.js
│   │       │   ├── deposit-detail.js
│   │       │   ├── deposits.js
│   │       │   ├── docs-about.js
│   │       │   ├── docs-cookie.js
│   │       │   ├── docs-en-pri.js
│   │       │   ├── docs-en-tm.js
│   │       │   ├── docs-help.js
│   │       │   ├── docs-tw-pri.js
│   │       │   ├── docs-tw-tm.js
│   │       │   ├── docs-zh-pri.js
│   │       │   ├── docs-zh-tm.js
│   │       │   ├── downloads.js
│   │       │   ├── fund-detail.js
│   │       │   ├── funds.js
│   │       │   ├── fx-convert.js
│   │       │   ├── fx.js
│   │       │   ├── goal-planner.js
│   │       │   ├── help.js
│   │       │   ├── home.js
│   │       │   ├── inflation-calculator.js
│   │       │   ├── intrabank-scheduled.js
│   │       │   ├── intrabank.js
│   │       │   ├── legal-docs.js
│   │       │   ├── legal.js
│   │       │   ├── loan-compare.js
│   │       │   ├── login.js
│   │       │   ├── notifications.js
│   │       │   ├── pay.js
│   │       │   ├── payees.js
│   │       │   ├── proposals.js
│   │       │   ├── recovery.js
│   │       │   ├── register.js
│   │       │   ├── retirement.js
│   │       │   ├── risk-assessment.js
│   │       │   ├── savings-compound.js
│   │       │   ├── security.js
│   │       │   ├── split-bill-plus.js
│   │       │   ├── subscriptions.js
│   │       │   ├── tools.js
│   │       │   ├── transactions.js
│   │       │   ├── transfer-history.js
│   │       │   ├── transfer-limits.js
│   │       │   ├── wealth-goals.js
│   │       │   ├── wealth-my.js
│   │       │   ├── wealth.js
│   │       │   └── download.js
│   │       └── tools/
│   │           └── tool-kit.js
│   ├── contact/
│   │   └── index.html
│   ├── cookie-privacy/
│   │   └── index.html
│   ├── demo-lab/
│   │   └── index.html
│   ├── favicon/                              # 站点图标
│   │   ├── android-chrome-512x512.png
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-1024x1024.png
│   │   ├── favicon-128x128.png
│   │   ├── favicon-144x144.png
│   │   ├── favicon-16x16.png
│   │   ├── favicon-180x180.png
│   │   ├── favicon-192x192.png
│   │   ├── favicon-2048x2048.png
│   │   ├── favicon-256x256.png
│   │   ├── favicon-32x32.png
│   │   ├── favicon-48x48.png
│   │   ├── favicon-512x512.png
│   │   ├── favicon-96x96.png
│   │   ├── favicon.ico
│   │   ├── favicon.png
│   │   ├── favicon.svg
│   │   └── favicon.webp
│   ├── flags/
│   │   ├── cn.svg
│   │   └── us.svg
│   ├── help/
│   │   └── index.html
│   ├── home/
│   │   └── index.html
│   ├── i18n/                                 # 四语言包（zh-CN/en-US/zh-TW/fallback，键集恒等）
│   │   ├── en-US.json
│   │   ├── fallback.json
│   │   ├── zh-CN.json
│   │   └── zh-TW.json
│   ├── notifications/
│   │   └── index.html
│   ├── offline/
│   │   └── index.html                        # PWA 离线兜底页
│   ├── pay/
│   │   ├── bills/
│   │   │   └── index.html
│   │   ├── subscriptions/
│   │   │   └── index.html
│   │   └── index.html
│   ├── privacy-policy/
│   │   └── index.html
│   ├── terms/
│   │   └── index.html
│   ├── transfer/
│   │   ├── history/
│   │   │   └── index.html
│   │   ├── intrabank/
│   │   │   └── index.html
│   │   ├── intrabank-scheduled/
│   │   │   └── index.html
│   │   ├── limits/
│   │   │   └── index.html
│   │   └── payees/
│   │       └── index.html
│   ├── wealth/
│   │   ├── deposits/
│   │   │   ├── demand/
│   │   │   │   └── index.html
│   │   │   ├── notice-7d/
│   │   │   │   └── index.html
│   │   │   ├── term-1y/
│   │   │   │   └── index.html
│   │   │   ├── term-3m/
│   │   │   │   └── index.html
│   │   │   ├── term-3y/
│   │   │   │   └── index.html
│   │   │   ├── term-6m/
│   │   │   │   └── index.html
│   │   │   └── index.html
│   │   ├── funds/
│   │   │   ├── ai-semi/
│   │   │   │   └── index.html
│   │   │   ├── apac-tech/
│   │   │   │   └── index.html
│   │   │   ├── cn-dividend/
│   │   │   │   └── index.html
│   │   │   ├── consumer-staples/
│   │   │   │   └── index.html
│   │   │   ├── em-gov-bond/
│   │   │   │   └── index.html
│   │   │   ├── esg-bond/
│   │   │   │   └── index.html
│   │   │   ├── global-equity-index/
│   │   │   │   └── index.html
│   │   │   ├── global-mixed-1/
│   │   │   │   └── index.html
│   │   │   ├── global-mixed-2/
│   │   │   │   └── index.html
│   │   │   ├── global-money-1/
│   │   │   │   └── index.html
│   │   │   ├── global-short-bond/
│   │   │   │   └── index.html
│   │   │   ├── gold-index/
│   │   │   │   └── index.html
│   │   │   ├── healthcare-bio/
│   │   │   │   └── index.html
│   │   │   ├── new-energy/
│   │   │   │   └── index.html
│   │   │   ├── quant-neutral/
│   │   │   │   └── index.html
│   │   │   ├── reit-global/
│   │   │   │   └── index.html
│   │   │   └── index.html
│   │   ├── fx/
│   │   │   └── index.html
│   │   ├── goals/
│   │   │   └── index.html
│   │   ├── my/
│   │   │   └── index.html
│   │   ├── tools/
│   │   │   ├── budget-allocator/
│   │   │   │   └── index.html
│   │   │   ├── credit-payoff/
│   │   │   │   └── index.html
│   │   │   ├── deposit-compare/
│   │   │   │   └── index.html
│   │   │   ├── fx-convert/
│   │   │   │   └── index.html
│   │   │   ├── goal-planner/
│   │   │   │   └── index.html
│   │   │   ├── inflation-calculator/
│   │   │   │   └── index.html
│   │   │   ├── loan-compare/
│   │   │   │   └── index.html
│   │   │   ├── retirement/
│   │   │   │   └── index.html
│   │   │   ├── savings-compound/
│   │   │   │   └── index.html
│   │   │   ├── split-bill-plus/
│   │   │   │   └── index.html
│   │   │   └── index.html
│   │   └── index.html
│   ├── 404.html
│   ├── index.html
│   ├── llms.txt
│   ├── manifest.json                         # PWA 清单
│   ├── robots.txt
│   ├── service-worker.js                     # PWA SW（network-first+缓存版本 v=bNNN）
│   └── sitemap.xml
├── .editorconfig                             # 统一缩进/换行/编码
├── .gitignore                                # 密钥/内部资料/构建产物排除
├── DEPLOYMENT.md                             # 部署手册
└── README.md                                 # 竞赛仓库入口（§15 变更记录=全量迭代史）
```

## 4. 页面简介

### 4.1 页面总目录（Canonical Page Registry）

所有页面 URL 末尾加 `/` 等价可访问（Worker 静态处理器统一规范化）。URL 一律小写、连字符分词。

**分区页**（Side Drawer / 底部导航五大分区）：

| ID | URL | 名称 | 需登录 | 主要风险交互 |
|----|-----|------|--------|--------------|
| P01 | `/home` | 主页 | 否（登录后数据增强） | — |
| P02 | `/pay` | 收付总览 | 是 | 转账入口（黄/红） |
| P03 | `/ai` | Suveoo AI 对话 + Trust Console | 是 | 全部三色 |
| P04 | `/wealth` | 财富总览 | 是 | 申购/赎回（红） |
| P05 | `/account` | 账户中心 | 是 | 密码/2FA（红） |

**分区子页**：

| ID | URL | 名称 | 需登录 | 风险交互 |
|----|-----|------|--------|----------|
| P06 | `/pay/bills` | 账单支付 | 是 | 缴费（黄）、自动扣款开关（黄） |
| P07 | `/pay/subscriptions` | 订阅管理 | 是 | 解约（黄） |
| P08 | `/transfer/intrabank` | 行内转账 | 是 | 转账（黄 ≤¥1,000 日累计 / 红 >¥1,000） |
| P09 | `/transfer/intrabank-scheduled` | 预约转账（行内） | 是 | 建立预约（黄） |
| P10 | `/transfer/history` | 转账记录（仅转账类流水） | 是 | — |
| P11 | `/transfer/limits` | 转账限额 | 是 | 调整限额（黄） |
| P12 | `/transfer/payees` | 常用收款人管理 | 是 | 增删改（黄） |
| P13 | `/ai/tasks` | 长程任务中心 | 是 | 取消任务（触发补偿） |
| P14 | `/ai/benchmark` | SuveooBench 评测看板 | 否 | — |
| P15 | `/wealth/funds` | 全部基金 | 是 | 申购（红） |
| P16 | `/wealth/funds/{slug}` | 基金详情（16 个静态页） | 是 | 申购/赎回（红） |
| P17 | `/wealth/deposits` | 全部存款方案 | 是 | 开立定期（红） |
| P18 | `/wealth/deposits/{slug}` | 存款方案详情（6 个静态页） | 是 | 开立（红） |
| P19 | `/wealth/fx` | 外汇牌价与兑换 | 是 | 结汇/购汇（黄/红） |
| P20 | `/wealth/tools` | 金融计算工具 | 否 | — |
| P21 | `/account/login` | 登录 | 否 | — |
| P37 | `/account/transactions` | 交易记录（全量收支） | 是 | — |
| L01 | `/demo-lab` | 数据注入实验室（队员隐藏入口 · noindex · 密码门 suveoo_data_injection） | 是 | 维度化注入（四维×三模式，DEMO_MODE 门，仅本人账户） |
| P22 | `/account/register` | 注册与开户 | 否 | — |
| P23 | `/account/recovery` | 忘记密码 | 否 | — |
| P24 | `/account/cards` | 卡片管理 | 是 | 冻结/解冻（红）、限额（黄） |
| P25 | `/account/card/{card-slug}/history` | 单卡交易明细 | 是 | — |
| P26 | `/account/card/{card-slug}/settings` | 单卡设置 | 是 | 限额（黄）、冻结（红） |
| P27 | `/account/dashboard` | 仪表盘 | 是 | — |
| P28 | `/account/downloads` | 月度报告下载 | 是 | — |
| P29 | `/account/security` | 安全中心 | 是 | 改密（红，须当前密码+OTP，成功全设备下线）、2FA（红，关闭须当前密码） |

**门户、法律与系统页**：

| ID | URL | 名称 | 需登录 |
|----|-----|------|--------|
| P30 | `/notifications` | 全部通知 | 是 |
| P31 | `/about` | 关于 Suveoo（简介/公告/利率） | 否 |
| P32 | `/help` | 帮助中心（FAQ/防诈骗/AI 安全说明） | 否 |
| P33 | `/contact` | 联系我们 | 否 |
| P34 | `/privacy-policy` | 隐私政策 | 否 |
| P35 | `/cookie-privacy` | Cookie 政策 | 否 |
| P36 | `/terms` | 服务条款 | 否 |
| S01 | `/` | 根路径 → 302 `/home` | 否 |
| S02 | `/404`（任意未知路径） | 404 页 | 否 |
| S03 | `/offline` | PWA 离线兜底页 | 否 |

**card-slug 取值域**：开户时由系统分配固定 slug——`debit-card-1` … `debit-card-4`、`credit-card-1`。这 5 个 slug 在账户生命周期内不变，因此 P25/P26 是**动态路由静态模板**：Worker 将 `/account/card/{任意段}/history` 重写到 R2 对象 `account/card/history/index.html`，`/settings` 同理；页面 JS 从 `location.pathname` 解析 card-slug 后调 API 取数。

**fund-slug 取值域（16 个）**：`global-money-1`、`global-short-bond`、`esg-bond`、`cn-dividend`、`consumer-staples`、`quant-neutral`、`em-gov-bond`、`global-mixed-1`、`reit-global`、`global-mixed-2`、`global-equity-index`、`gold-index`、`healthcare-bio`、`new-energy`、`apac-tech`、`ai-semi`（风险 R1-R5 全梯度；数据规格见 §12.2）。

**deposit-slug 取值域（6 个）**：`demand`、`notice-7d`、`term-3m`、`term-6m`、`term-1y`、`term-3y`。

—— Suveoo（源自爱沙尼亚语 suveöö，夏夜）
