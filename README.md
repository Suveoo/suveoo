# Suveoo — Agentic Banking Control Plane

> 银行 AI 智能体（AI Banking Agent）· 金融科技竞赛参赛作品
> **这是模拟银行系统，不涉及真实资金行为。**

Suveoo 把 AI 的概率性智能与金融授权的确定性彻底分离：**LLM 只能"提议"，提议必须编译为 BankAction IR，并通过 Suveoo Verification Runtime 五道确定性验证（策略分级 · 同意绑定 · 来源污染追踪 · 金融不变量 · 幂等重放），`VERIFIED` 后才允许触达资金。** 经典表单与 AI 通道走同一条验证流水线——系统不存在绕过验证的特权通道。

## 在线体验

- 站点：`https://suveoo.com`（www 自动跳转裸域）
- 演示账户：`demo@suveoo.com` / `jinrongkeji2026`（需先执行下方种子命令；登录含邮箱验证码 2FA）
- 六大场景入口：Suveoo AI 对话页（AA 分账 / 账单归因 / 理财推荐 / 卡片围栏 / 订阅治理 / 生日订花 Saga + 故障注入）

## 一分钟架构

```
自然语言/表单 → Agent Planner(LLM, Key 仅在服务端)
   → BankAction IR（facts 带 provenance/trust）
   → Suveoo Verification Runtime（五道确定性验证）
   → VERIFIED → LedgerDO/SagaDO（SQLite 账本 + Saga 补偿）
```

基础设施：Cloudflare 1 Worker + 2 KV + 1 R2 + 2 Durable Object class + Email Service。前端为无构建 MPA + PWA（三语 zh-CN/zh-TW/en-US）。

## 本地运行（3 步）

```bash
cd backend
npm install
npx wrangler dev          # http://127.0.0.1:8787（需先 wrangler login；R2 走远端桶）
npm test                  # 99 用例（真实 workerd 运行时）
```

## 部署

```bash
cd backend
npx wrangler deploy                     # Worker（路由 suveoo.com/* 已配置）
node scripts/deploy-frontend.mjs        # 前端全量上传 R2（put+get 回验）
curl -X POST https://suveoo.com/api/demo/seed   # 注入演示种子（DEMO_MODE=true 时）
```

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 仓库结构

```
backend/   单文件 Worker（worker-main.js，七大区块）+ tests（unit/integration/attack/bench）+ scripts
frontend/  无构建 MPA（51 页面 + 34 控制器 + i18n 三语 + 数据 JSON + 自研 SVG 图表）→ 整目录上传 R2
docs/      architecture / core-algorithms / security-self-assessment / test-cases
```

## 文档

- 架构：[docs/architecture.md](./docs/architecture.md)
- 核心算法：[docs/core-algorithms.md](./docs/core-algorithms.md)
- 安全自评（权限分级 + 已知风险）：[docs/security-self-assessment.md](./docs/security-self-assessment.md)
- 测试用例：[docs/test-cases.md](./docs/test-cases.md)
- 部署：[DEPLOYMENT.md](./DEPLOYMENT.md)

## 安全要點（速览）

- 三色权限：绿自动 / 黄确认（grant_hash 参数级绑定，120s）/ 红强验证（+邮箱 OTP）
- 防注入：授权字段必须 TRUSTED 来源；商户备注等外部文本不能产生授权（先于授权请求拦截）
- 防幻觉：结果只来自账本；GenUI 卡片数据只来自已验证快照；金额 bigint 分杜绝浮点
- 防重放：IR nonce 幂等集
- Saga：T1✓→T2✗→C1✓ 补偿（生日订花现场可注入故障演示）

—— Suveoo（源自爱沙尼亚语 suveöö，夏夜）
