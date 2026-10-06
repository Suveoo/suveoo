# Suveoo — 系统架构

> Agentic Banking Control Plane（银行智能体可信执行中间层）
> 这是模拟银行系统，不涉及真实资金行为。
>
> 2026-10-06 更新：多指标测试体系与四模型消融落地——63 个 MCP 工具、vitest 63 文件 463 用例全绿；生产黑盒评测（拦截类 106 断言 + 准确率类 122 用例）全部通过；MODEL_PROFILES 多模型注册表（glm-5.3-flash / glm-5.3-max / qwen3.8-flash / deepseek-v4.1-flash / kimi-k3）支持零代码换模，四模型消融全部核心指标 100% 一致（证据库 docs/benchmarks/）。测试 463 项全绿。
> 2026-09-17 更新：转账与收款人真实化（Luhn+registry+户名三重校验，REST 与 AI 同规）与跨用户双记（对方 DO credit 先行，资金守恒）；13 个演示人物落户为真实账户；演示种子端点加管理员令牌双门（fail-closed + 审计）；卡片完整卡号 reveal（属主隔离）；理财赎回按市值结算（整数运算，显示值=回款额）；换汇按服务端实时牌价结算（JPY 每 100 口径、可选结算卡、外币余额可见）。测试 186 项全绿。
> 2026-09-16 更新：财富产品 v2（16 只基金，数据由锚定真实市场史的多因子模型生成）；外汇实时牌价（er-api + KV 缓存 + 静态回退）；Telegram 运维通知（注册/登录/全部 EXECUTED 写操作，waitUntil 生命周期保障）；种子端点支持任意已注册账户（DEMO_MODE 守卫不变）；测试 159 项全绿。

## 1. 核心主张

把 AI 的概率性智能与金融授权的确定性彻底分离：**LLM 只能"提议"一次操作；提议必须被编译成结构化 BankAction IR，并通过 Suveoo Verification Runtime 的五道确定性验证，才允许真正触达资金。** 银行可以更换底层模型（GLM / Qwen / DeepSeek / Kimi，经 `MODEL_PROFILE` 单变量切换，已四模型消融实测验证），但授权、合规、事务、审计规则不跟着模型换。

```
用户自然语言 / 经典表单
        │
        ▼
┌────────────────┐   Anthropic 协议 mcp_servers 连接器（MODEL_PROFILES）
│  Agent Planner │◄──────────────────────────────────────┐
└───────┬────────┘        Key 仅存 Worker 侧             │
        │ 提议（工具调用）                                │
        ▼                                                │
┌──────────────────────────┐      JSON-RPC 2.0           │
│      BankAction IR       │◄──── /mcp (Streamable HTTP) ┘
│ intent/facts/steps/      │
│ provenance/risk/         │
│ preconditions/compensation│
└───────────┬──────────────┘
            ▼
┌────────────────────────────────┐
│  Suveoo Verification Runtime   │  ①Policy ②Consent ③Provenance/Taint
│  （确定性纯函数，可单测）        │  ④Invariants ⑤Replay/Idempotency
└───────────┬────────────────────┘
          VERIFIED
            ▼
┌────────────────┐   ┌─────────────────────┐
│  Tool Gateway  │──►│ LedgerDO / SagaDO   │  Durable Objects (SQLite, ACID)
└────────────────┘   │ 每用户 / 每事务流     │
                     └─────────────────────┘
```

## 2. Cloudflare 基础设施（1 Worker + 2 KV + 1 R2 + 2 DO class）

| 资源 | 名称 | 职责 |
|------|------|------|
| Worker | `suveoo-bank-main` | 唯一入口：静态资源（R2 回源）/ REST `/api/*` / MCP `/mcp` / AI SSE 代理 / IR 编译 + 五道验证 / Email / pdf-lib 报告 |
| R2 | `suveoo-bank-r2` | 前端静态资源（无构建 MPA，URL 即对象键）+ 公共数据 `assets/data/*` + 月度报告 PDF |
| KV | `suveoo-session-kv` | JWT 黑名单、邮箱验证码（哈希）、登录锁定计数、Consent Grant（`grant:{uid}:{hash}`，TTL 300s 生产/120s 默认）、AI 会话历史 |
| KV | `suveoo-audit-index-kv` | 审计索引（`audit:{date}:{trace_id}`） |
| DO | `LedgerDO` | registry 单例（邮箱/卡号全局唯一索引）+ 每用户账本（profile/cards/tx/payees/bills/subs/holdings/tasks/nonces/audit，SQLite） |
| DO | `SagaDO` | 长程任务闹钟（alarm）+ 取消/补偿触发；读路径 `sweepDue` 兜底扫描 |
| Email | `send_email` binding | 验证码 / 转账回执 / 安全告警 / 联系表单（noreply@suveoo.com） |

## 3. 请求路径

| 路径 | 处理 |
|------|------|
| `suveoo.com/*` | www 301/308 → 裸域；静态 R2 查找（路径→/index.html→.html）；404.html |
| `/api/auth/*` | 注册发卡 / 登录 2FA / 找回（公开） |
| `/api/**` | 数据 API：全部写操作经 `runGuarded()` → IR → 五道验证 → `executeIntent()` |
| `/api/ai/chat` | SSE 流式 LLM 代理（服务端持 Key；mcp_servers 自指 /mcp；trust_event/genui_event 事件流） |
| `/mcp` | MCP Tool Gateway（JSON-RPC 2.0，63 工具，JWT Bearer） |

## 4. 关键数据流：转账（表单与 AI 同规）

1. 用户提交（表单 `/api/transfers/intrabank` 或 AI `tools/call transfer_execute`）
2. `runGuarded`：编译 IR（facts 全带 provenance/trust；金额一律字符串，内核 bigint 分）
3. 五道验证：Policy（三色 + AI 通道硬上限）→ Taint（授权字段必须 TRUSTED）→ Consent（无 grant 则签发并返回 `INPUT_REQUIRED`；有则**服务端查 KV 消费**，参数突变即 `CONSENT_INVALIDATED`）→ Invariants（余额守恒/PR 适当性）→ Replay（nonce 去重）；红级另需 redstep 邮箱 OTP
4. `executeIntent`：LedgerDO 原子记账（卡可用余额、日累计）、邮件回执、审计、通知
5. 前端 Verified GenUI：确认卡数据只来自 `grant.snapshot`（`issuer==="verified_ir"` 才渲染）

## 5. Saga 长程任务（生日订花演示）

`T1 LockFunds（锁 ¥600）→ T2 商户下单（可注入故障）→ 失败则 C1 UnlockFunds 补偿`。
检查点存 LedgerDO SQL；SagaDO alarm 到点触发 `taskDue`；任务中心可见时间线与故障注入开关（DEMO_MODE）。

## 6. 前端（无构建 MPA + PWA）

原生 ES2022 + Web Components 风格命名空间（`S.*`），76 个页面壳 + 62 个控制器；自研 SVG 图表（line/bar/donut/sankey/sparkline）；三语 i18n（zh-CN/zh-TW/en-US + fallback，1531 键恒等）；GA4 Consent Mode v2 默认 denied；Service Worker 应用壳预缓存 + 离线兜底。
