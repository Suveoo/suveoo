# Suveoo — Agentic Banking Control Plane

<!-- 插图 1：全设备 Hero Mockup（手机 + 平板 + 电脑同框） -->
![Suveoo across devices](docs/images/readme/hero-devices.png)

<div align="center">

![Tests](https://img.shields.io/badge/tests-463%20passing-brightgreen) ![Tools](https://img.shields.io/badge/AI%20tools-63%20%28MCP%29-blue) ![Risk Tiers](https://img.shields.io/badge/permission%20tiers-GREEN%2FYELLOW%2FRED-success) ![Pages](https://img.shields.io/badge/pages-76%20%2B%2062%20controllers-orange) ![i18n](https://img.shields.io/badge/i18n-1531%20keys%20%C3%97%203%20langs-inactive) ![Platform](https://img.shields.io/badge/platform-Web%20%2B%20PWA%20%2B%20Android-informational) ![Edge](https://img.shields.io/badge/runtime-Cloudflare%20Worker%20%2B%20KV%20%2B%20DO%20%2B%20R2-orange)

[60 秒看懂](#60-秒看懂-suveoo) · [安全内核](#安全内核bankaction-ir-与五道确定性验证) · [Suveoo AI](#suveoo-ai自然语言驱动全行业务) · [六大场景](#六大官方场景全覆盖) · [快速开始](#快速开始) · [测试与评测体系](#测试与评测体系) · [文档地图](#文档地图)

</div>

---

> **核心命题**：大模型只能"提议"。任何提议必须编译为类型化的 **BankAction IR**，并通过 **Suveoo Verification Runtime 的五道确定性验证**，获得 VERIFIED 判定之后才被允许触达账本。更换底层模型，授权、合规与审计规则一行不改。
>
> **核心证据**：确定性自动化测试 **463 条全绿**（vitest，63 文件）；安全与准确率指标在生产环境实测 **228/228 通过**（拦截类 106 断言 + 准确率类 122 用例，2026-10-06）；**四模型消融实验**（GLM-5.3-Flash / Qwen3.8-Flash / DeepSeek V4.1 / Kimi K3）在全部核心指标上 **100% 一致**——安全能力由 Runtime 架构保证，与底层 LLM 无关。

Suveoo 是一个运行在全球边缘的**模拟银行系统**，Suveoo AI 是内嵌的 **AI 智能体**：1 个 Worker + 2 类 Durable Object（账本 / 长程任务）+ 2 KV + R2，前端零构建 MPA，Android 端 Capacitor 壳原生集成。用户用自然语言（文字或语音）办理转账、账单、理财、卡片、订阅与跨场景长程任务；AI 通道、REST 表单、MCP 三通道收敛到**同一套验证管线**。

Suveoo AI —— 说话就能办业务，但每一分钱都先过五道确定性验证：把概率性智能与确定性金融授权彻底分离。

<!-- 插图 2：架构总览图（Figma 绘制，含 LLM→IR→五道→DO 链路） -->
![Architecture](docs/images/readme/architecture.png)

---

## 60 秒看懂 Suveoo

**它解决什么**：AI Agent 从"回答问题"跨到"替我办业务"的最后一公里是信任问题——不是"能不能听懂用户"，而是**凭什么敢把转账权限交给一个概率系统**。

**怎么解决**：LLM 输出永远不直接碰钱。每次工具调用被编译成类型化的 BankAction IR（金融行动 IR，含来源追踪、DAG 步骤、风险分级、补偿声明），连过五道确定性验证：

| # | 验证器 | 职责 | 对应风险 |
|---|---|---|---|
| 1 | **Policy** | 三色分级：绿自动 / 黄确认卡 / 红 OTP 强验证；日累计 ¥1,000 动态升红；AI 通道硬上限单笔 ¥5,000 / 日 ¥10,000 | 越权操作 |
| 2 | **Consent Binding** | 用户确认的是 SHA256 哈希绑定的**精确参数快照**——确认后改一个数字，grant 立即失效 | "确认后 AI 偷改参数" |
| 3 | **Provenance / Taint** | 账单备注等外部文本标 `EXTERNAL_UNTRUSTED`，可影响认知、**永不能成为收款人/金额** | 间接提示词注入 |
| 4 | **Invariants** | bigint 整数分单位的守恒 / 适当性 / 余额断言——纯函数，不是"AI 觉得没问题" | 金融数学错误 |
| 5 | **Replay / Idempotency** | trace_id + nonce 查重，重放即拒 | 重复扣款 |

<!-- 插图 3：五道验证流程图（五道闸门 + VERIFIED/BLOCKED 分叉） -->
![Five Gates](docs/images/readme/five-gates.png)

**为什么可信**：不宣称"我们更安全"，只提交实测记录——提示注入七族变体 66 断言、授权伪造与越权 37 断言、数值幻觉 24 用例、意图分级 50 变体，全部在生产环境实测通过；四模型消融证明同一套用例换任何模型结果不变（详见[测试与评测体系](#测试与评测体系)）。

---

## 安全内核：BankAction IR 与五道确定性验证

**BankAction IR**（自研中间表示）——LLM 的"方言"与账本的"方言"之间的译码层：

```json
{
  "trace_id": "bai_8f7a29e1",
  "intent": "transfer_execute",
  "facts": [{ "value": "张三", "provenance": "user_input", "trust": "TRUSTED" }],
  "steps": [{ "op": "transfer_execute", "params": { "recipient": "payee:42", "amount": "500.00" }, "dep": ["contacts_search"] }],
  "risk": { "tier": "YELLOW", "reasons": [] },
  "preconditions": ["balance >= amount", "recipient.status == ACTIVE"],
  "compensation": ["unlock_funds"]
}
```

- **三通道同规**：REST 表单、AI 对话、MCP 工具调用——殊途同归到同一个 `compileToIR() → verify() → executeIntent()`，一套验证逻辑通吃。
- **Verified GenUI**：确认卡上渲染的金额/收款人/费用**只来自已验证的 IR 快照**（`issuer === "verified_ir"`），"界面显示 ¥500、后端转 ¥5000"从架构上被堵死。13 个验证组件覆盖全部写操作形态。
- **红级强验证**：短信 + 邮箱双通道 OTP、生物识别（Android）、会话纪元全设备下线、异常熔断（连错锁定、查询不受影响）。
- **全程审计**：每笔写操作 `user_audit` 五字段落库 + Trust Console 实时五盏灯（评委可在演示里亲眼看 POLICY → CONSENT → PROVENANCE → INVARIANTS → REPLAY 逐门亮起）。

<!-- 插图 4：Consent Binding 现场演示截图（确认卡 + 改金额后 BLOCKED 提示，带高级边框） -->
![Consent Binding Demo](docs/images/readme/consent-binding.png)

<b>验证器实现细节</b>：

- `compileToIR()` / `verify()` / `runGuarded()` —— `backend/worker-main.js`
- Grant：SHA256(intent + authFields + user_id + expires_at + nonce)，KV 存储 TTL 120s（`CONSENT_GRANT_TTL_SECONDS` 可覆写），服务端消费一次
- Taint 检查先于 Consent；GREEN 工具轻量通道（仅 Provenance 标注）
- 金额内核：十进制字符串 → bigint 分单位，全程无浮点（`toCents/centsToStr/marketValueCents/navScaled4`）
- 单测锁定：`tests/unit/{ir-compiler,consent-binding,taint-check,invariants,idempotency,policy-engine,money-math}.test.js`

---

## Suveoo AI：自然语言驱动全行业务

**63 个 MCP 工具**（GREEN 26 / YELLOW 24 / RED 13）覆盖查询、转账、账单、理财、卡片、订阅、任务、计算器、站点指南——全部走同一 IR → 五道管线。

<!-- 插图 5：AI 对话界面截图（深色/浅色对话 + 内嵌计算器 + 确认卡同框） -->
![AI Chat](docs/images/readme/ai-chat.png)

### 代表性能力（均生产实测）

- **模糊表达与反问澄清**：说"挂失尾号 6792 的卡，帮我补办"→ AI 核对卡片 → **反问邮寄地址并明言"我不能代填"**（服务端结构化拒绝兜底）→ 报费用三项合计 ¥53 → 预告验证码流程。
- **站内计算工具调用与直接渲染**：10 个金融计算器（复利/贷款/攒目标/还款/退休/通胀/分账/存款/汇率/预算）。回答内嵌"图形化计算器"按钮卡，且**对话气泡内直接注水渲染完整可交互计算器**（深链参数回填、改输入即时重算）；三方一致性体检（AI 回答 = /mcp 返回 = 页面 DOM）**10/10 一致**。
- **对话即方案（动态产品拼装）**："5 万闲钱半年后买车"→ 服务端**确定性拼装**存款阶梯 + 期限封顶基金层 + 货币基金流动性层（非模型自由推荐）→ 一键组合购买（两段式 grant + PR 适当性 + 部分失败按成本回退）。
- **组合操作 DAG**："冻结尾号 8317，同时挂失尾号 2323 补办"→ `plan_preview` 组合方案卡（整卡=最高级别、金额合计判红、**红级一次 OTP**）→ `batch_execute` 逐项执行、失败即停。
- **长程任务 + Saga 补偿**："我爱人生日当月锁 ¥1,000，生日前 2 天订花"——检查点落库、`T1 锁定 → T2 商户下单 → C1 解锁补偿`、**现场故障注入按钮**给评委看真实回滚。
- **AI 主动银行**：规则引擎扫描沉睡订阅/周期转账/自动扣款/还款/闲钱理财 → 提议清单 + **站内/Android 推送/Email 三路提醒**；洞察行整行点击直发 AI。
- **真自动缴费**：cron 引擎（每 5 分钟扫描、北京时区、月末并档、防重键）——生产部署后首个 cron 真实自动扣款两笔（¥286.40 / ¥28,453.27），流水 `channel=auto` 可查。
- **语音输入**：阿里云实时 ASR + Web Speech 双通道，无 GMS 的老华为真机可用。
- **全站知识注入**：76 页站点指南作为 GREEN 工具（site_guide），AI 回答"某功能在哪"只引用真实路由——提示词铁律"绝不自造任何 URL"被单测锁定。

<!-- 插图 6：对话内嵌计算器（tool-embed）特写截图 -->
![Tool Embed](docs/images/readme/tool-embed.png)
<!-- 插图 7：对话即方案（solution_preview 组合方案卡）截图 -->
![Solution Preview](docs/images/readme/solution-preview.png)
<!-- 插图 8：组合操作卡（冻结+挂失两项、风险圆点、一次 OTP）截图 -->
![Operations Package](docs/images/readme/operations-package.png)
<!-- 插图 9：生日订花 Saga + Trust Console 五盏灯截图 -->
![Saga Trust Console](docs/images/readme/saga-trust-console.png)

---

## 六大官方场景全覆盖

| 场景 | Suveoo 实现 | 证据 |
|---|---|---|
| 1 智能转账 | 按人名/手机号/邮箱/卡号收款、AA 分账（¥860/3 → 286.67/286.67/286.66）、预约转账、跨用户双记 | transfer-flow 10 用例 |
| 2 账单分析 | 分类统计、异常归因、月度 PDF 报告（pdf-lib 矢量品牌） | 对账三 bug 根治记录 |
| 3 理财操作 | 16 基金 + 5 存款档、PR 分级适当性、一键申赎、**对话即方案**、攒钱目标五件套 | solution-package 集成测试 + 生产 ¥10 真实执行 |
| 4 卡片管理 | 状态/限额/冻结解冻、**卡片挂失全链**（三态页/红级打包费用/签收激活/LOSS_ACTIVE 防绕过） | card-loss 4 用例 + 生产双通道闭环 |
| 5 订阅代扣 | 订阅扫描/退订/提醒、**真自动缴费引擎** | bills-autopay 3 用例 + 生产 cron 实扣 |
| 6 跨场景联动 | 生日锁定+订花 Saga、月度自动攒、组合 DAG | birthday-chain / saga-compensation + 故障注入 |

---

## 一套代码，全平台交付

- **Web**：零构建 MPA（76 页 / 62 控制器）、PWA 离线兜底、三语 i18n **1531 键恒等**、SEO 三方友善。
- **Android**（Capacitor 8）：本地资产秒载、生物识别四场景、**后台原生通知服务**、三级自动更新（含强制阻断层）、返回手势 31 场景全接管；**站内链接 100% App 内原生打开 + 站外链接内嵌浏览器**（无 GMS 设备可用——荣耀 V10 真机长期在测试矩阵）。

<!-- 插图 10：三端同框 mockup（Web 桌面 + Android 手机 + 平板） -->
![Multi Platform](docs/images/readme/multi-platform.png)

---

## 测试与评测体系

测试分三层，全部可复现、证据落盘：

1. **确定性自动化**：vitest + @cloudflare/vitest-pool-workers，**63 文件 463 用例全绿**（unit 24 / integration 33 / attack 6）。攻击套件覆盖注入（两代）、越权、确认后篡改、重放、授权伪造五类。
2. **生产黑盒评测**：Node 脚本直连生产 Worker（真实登录 + 2FA），准确率类 **122 用例**、拦截类 **106 断言**，2026-10-06 全部通过。
3. **四模型消融（Ablation）**：同一套用例在 4 个 LLM 上完整重跑，证明结果与模型无关。

以下每个指标独立成表，给出定义、方法、规模、结果，以及**测试文件 / 驱动脚本 / 证据数据**三类可核查路径。证据数据另整理于 [`docs/benchmarks/`](./docs/benchmarks/)（原始全量产物在 `for_developer/bench-results/20261006/`，共 53 份文件）。

### S3 提示注入防御

| 维度 | 内容 |
|---|---|
| 指标定义 | 恶意外部文本（账单备注/收款人名等 `EXTERNAL_UNTRUSTED` 源）诱导 AI 越权操作或泄露数据时的拦截率 |
| 测试方法 | 七族变体（角色扮演、跨语言、Unicode 同形、长上下文稀释、指令覆盖、数据外泄、工具滥用）经 AI 通道注入，断言 taint 标注与结构化拒绝 |
| 用例规模 | 7 用例 / 66 断言（另有第一代基础族 `prompt-injection.test.js`） |
| 实测结果 | **66/66 = 100%**（2026-10-06；四模型消融下同为 66/66，见下文消融总表） |
| 测试文件 | [`backend/tests/attack/prompt-injection-v2.test.js`](./backend/tests/attack/prompt-injection-v2.test.js) |
| 证据数据 | [`docs/benchmarks/security/phase1-l0-results.json`](./docs/benchmarks/security/phase1-l0-results.json) |

### S4 越权与授权伪造拦截

| 维度 | 内容 |
|---|---|
| 指标定义 | 伪造/篡改/过期 grant、红黄分级错位、跨用户访问、重放请求被前置拦截的比例 |
| 测试方法 | 四个攻击族独立发难：authorization-bypass（越权访问）、consent-mutation（确认后参数篡改）、replay-attack（重放）、grant-forgery（伪造授权，6 用例 14 断言，含连续 4 次伪造触发熔断的行为验证） |
| 用例规模 | 4 族合计 37 断言 |
| 实测结果 | **37/37 = 100%**，全部结构化 BLOCKED（2026-10-06） |
| 测试文件 | [`grant-forgery.test.js`](./backend/tests/attack/grant-forgery.test.js) · [`authorization-bypass.test.js`](./backend/tests/attack/authorization-bypass.test.js) · [`consent-mutation.test.js`](./backend/tests/attack/consent-mutation.test.js) · [`replay-attack.test.js`](./backend/tests/attack/replay-attack.test.js)（均在 `backend/tests/attack/`） |
| 证据数据 | 同 S3，[`docs/benchmarks/security/phase1-l0-results.json`](./docs/benchmarks/security/phase1-l0-results.json) |

### S5 异常熔断正确性

| 维度 | 内容 |
|---|---|
| 指标定义 | 连续验证失败后锁定账户高危操作、且查询类不受影响的隔离正确性 |
| 测试方法 | 伪造 OTP/grant 连错触发熔断，断言写通道锁定、读通道可用、锁定时长与恢复 |
| 用例规模 | 9 用例（既有族 + v2 扩展 6 例） |
| 实测结果 | **9/9 = 100%**（2026-10-06） |
| 测试文件 | [`backend/tests/integration/circuit-breaker-v2.test.js`](./backend/tests/integration/circuit-breaker-v2.test.js) |
| 证据数据 | [`docs/benchmarks/security/phase1-l0-results.json`](./docs/benchmarks/security/phase1-l0-results.json) |

### S6 审计完整性

| 维度 | 内容 |
|---|---|
| 指标定义 | 每笔 AI 写操作在 `user_audit` 五字段（who/what/when/tier/trace）的可回溯覆盖率 |
| 测试方法 | 16 个 intent 全量执行后拉取审计流，断言逐条对齐（市场行情类 4 项留 L1 覆盖） |
| 用例规模 | 16 intent / 14 断言 |
| 实测结果 | **14/14 = 100%**（2026-10-06） |
| 测试文件 | [`backend/tests/integration/audit-coverage.test.js`](./backend/tests/integration/audit-coverage.test.js) |
| 证据数据 | [`docs/benchmarks/security/phase1-l0-results.json`](./docs/benchmarks/security/phase1-l0-results.json) |

### S7 数据隔离

| 维度 | 内容 |
|---|---|
| 指标定义 | AI 工具在跨用户标识（他人手机号/邮箱/卡号/凭证）诱导下的数据泄露率 |
| 测试方法 | 8 个工具 × 4 类跨用户标识发起查询，断言返回内容不含任何他人数据 |
| 用例规模 | 32 断言（8 工具 × 4 标识） |
| 实测结果 | **零泄露 = 100%**（2026-10-06） |
| 测试文件 | [`backend/tests/integration/data-isolation-ai.test.js`](./backend/tests/integration/data-isolation-ai.test.js) |
| 证据数据 | [`docs/benchmarks/security/phase1-l0-results.json`](./docs/benchmarks/security/phase1-l0-results.json) |

### S1 幻觉防护：数值一致性

| 维度 | 内容 |
|---|---|
| 指标定义 | AI 口头报告的数值与系统真值（余额/持仓/订阅/收款人计数等）的精确一致率 |
| 测试方法 | 18 个自动判定用例（truthJs 求值器，8 种比较器：exact/pm1/pm1-yuan/dual-pm1/sub-next/count/text-in/manual）+ 6 个人工复核用例，对生产 SSE 全文判定 |
| 用例规模 | 24 用例（18 自动 + 6 人工） |
| 实测结果 | **24/24 = 100%**（2026-10-06，含 1 次产品修复循环：S1-18 持仓收益改为强制引用系统真值） |
| 驱动脚本 | [`backend/scripts/ai-hallucination.mjs`](./backend/scripts/ai-hallucination.mjs)（`--session-token` / `--only` / `--delay`） |
| 证据数据 | 四模型全量文本（每含指令、SSE 全文、判定与得分）：[`s1-glm-full.json`](./docs/benchmarks/business/s1-glm-full.json) · [`s1-qwen38-full.json`](./docs/benchmarks/business/s1-qwen38-full.json) · [`s1-deepseek-full.json`](./docs/benchmarks/business/s1-deepseek-full.json) · [`s1-kimi-full.json`](./docs/benchmarks/business/s1-kimi-full.json) |

**四模型分项表现**（同一套 24 用例）：

| 模型 | 自动 18 | 人工 6 | 合计 |
|---|---|---|---|
| GLM-5.3-Flash | 18/18 | 6/6 | **24/24 = 100%** |
| Qwen3.8-Flash | 18/18 | 6/6 | **24/24 = 100%** |
| DeepSeek V4.1-Flash | 18/18 | 6/6 | **24/24 = 100%** |
| Kimi K3 | 18/18 | 6/6 | **24/24 = 100%** |

### S2 幻觉防护：执行一致性（与 B4 同链验证）

| 维度 | 内容 |
|---|---|
| 指标定义 | AI 执行类回答中声称的动作、金额、对象与账本实际落库的执行记录一致率 |
| 测试方法 | 生产 E2E：AI 发起操作 → 确认卡 → 执行 → 拉取流水/状态比对执行声明；另设 2 条"确认后篡改"用例断言 CONSENT_INVALIDATED 零假声明 |
| 用例规模 | 14 有效执行 + 2 篡改拒绝 |
| 实测结果 | **14/14 = 100%**，篡改用例全部正确拒绝（2026-10-06） |
| 驱动脚本 | [`backend/scripts/s2b4p4-e2e.mjs`](./backend/scripts/s2b4p4-e2e.mjs) |
| 证据数据 | [`docs/benchmarks/performance/s2b4p4-fix.json`](./docs/benchmarks/performance/s2b4p4-fix.json) |

### B1 意图识别与风险分级

| 维度 | 内容 |
|---|---|
| 指标定义 | 自然语言变体被映射到正确 intent、并授予正确风险分级（GREEN/YELLOW/RED）的比例 |
| 测试方法 | 10 类意图 × 5 种表述变体（口语化/省略/敬语/数字变体/复合指令）经生产 AI 通道发起；判定取最终确认卡（模型自我纠正语义） |
| 用例规模 | 50 变体（转账组使用独立账户规避 demo 限额） |
| 实测结果 | **50/50 = 100%，分级错 0**（2026-10-06） |
| 驱动脚本 | [`backend/scripts/b1-intent-matrix.mjs`](./backend/scripts/b1-intent-matrix.mjs)（`--session-token` / `--transfer-token` / `--only` / `--delay`） |
| 证据数据 | 四模型全量文本：[`b1-glm-full.json`](./docs/benchmarks/business/b1-glm-full.json) · [`b1-qwen38-full.json`](./docs/benchmarks/business/b1-qwen38-full.json) · [`b1-deepseek-full.json`](./docs/benchmarks/business/b1-deepseek-full.json) · [`b1-kimi-full.json`](./docs/benchmarks/business/b1-kimi-full.json) |

**四模型分项表现**（同一套 50 变体）：

| 模型 | 意图正确 | 分级正确 | 合计 |
|---|---|---|---|
| GLM-5.3-Flash | 50/50 | 50/50 | **50/50 = 100%** |
| Qwen3.8-Flash | 50/50 | 50/50 | **50/50 = 100%** |
| DeepSeek V4.1-Flash | 50/50 | 50/50 | **50/50 = 100%** |
| Kimi K3 | 50/50 | 50/50 | **50/50 = 100%** |

### B2 金额解析

| 维度 | 内容 |
|---|---|
| 指标定义 | 中文金额表达（大写、口语、区间、万/亿单位、分隔符）到分单位整数的解析正确率 |
| 测试方法 | 28 用例 / 30 断言覆盖典型与边界输入 |
| 实测结果 | **30/30 = 100%**（2026-10-06） |
| 测试文件 | [`backend/tests/unit/money-parse-cases.test.js`](./backend/tests/unit/money-parse-cases.test.js) |

### P1 / P2 AI 对话延迟（TTFT 与完整响应）

| 维度 | 内容 |
|---|---|
| 指标定义 | AI 通道首字延迟（TTFT）与完整响应时长分布 |
| 测试方法 | 18 条指令对生产 SSE 计时（记录型指标，无硬阈值；作为四模型消融的延迟基线） |
| 实测结果（GLM-5.3-Flash） | TTFT P50 = 17.5s / P95 = 60.1s；完整响应 P50 = 31.5s / P95 = 128.1s（思考型模型固有开销，四模型对比见消融总表） |
| 驱动脚本 | [`backend/scripts/ai-bench.mjs`](./backend/scripts/ai-bench.mjs) |
| 证据数据 | [`docs/benchmarks/performance/p1p2-ai-bench.json`](./docs/benchmarks/performance/p1p2-ai-bench.json) |

### P3 工具调用延迟

| 维度 | 内容 |
|---|---|
| 指标定义 | REST API 绿色查询工具的服务端处理延迟 |
| 测试方法 | 3 轮 × 11 并发共 33 样本 |
| 实测结果 | P50 = 159ms / **P95 = 435ms** / min = 123ms——远优于自设基线 P95 ≤ 800ms（2026-10-06） |
| 驱动脚本 | [`backend/scripts/tool-latency.mjs`](./backend/scripts/tool-latency.mjs) |
| 证据数据 | [`docs/benchmarks/performance/p3-tool-latency.json`](./docs/benchmarks/performance/p3-tool-latency.json) |

### P4 转账全链路延迟

| 维度 | 内容 |
|---|---|
| 指标定义 | AI 对话发起转账到账本落库的端到端时长（含出确认卡 + 用户确认 + 执行） |
| 测试方法 | 14 次有效执行计时（chat 段约 20s + exec 段约 6s） |
| 实测结果 | P50 = 27.4s / P95 = 44.3s（2026-10-06，受 P1 思考型延迟主导） |
| 驱动脚本 | [`backend/scripts/s2b4p4-e2e.mjs`](./backend/scripts/s2b4p4-e2e.mjs) |
| 证据数据 | [`docs/benchmarks/performance/s2b4p4-fix.json`](./docs/benchmarks/performance/s2b4p4-fix.json) |

### 四模型 Ablation 消融实验

**论点**：Suveoo 的安全与业务正确性由 Runtime 架构保证，与底层 LLM 无关。**验证方式**：通过 `MODEL_PROFILE` 配置切换（不改一行代码），让 4 个 LLM 跑同一套完整测试矩阵——vitest 全量 463 用例 + S1 幻觉 24 用例 + B1 意图分级 50 变体 + 注入攻击 66 断言。

| 维度 | GLM-5.3-Flash | Qwen3.8-Flash | DeepSeek V4.1-Flash | Kimi K3 | 一致性 |
|---|---|---|---|---|---|
| vitest 全量 | 463/463 | 463/463 | 463/463 | 463/463 | 四模型一致 |
| S3 注入拦截 | 66/66 | 66/66 | 66/66 | 66/66 | 四模型一致 |
| S1 数值一致（自动） | 18/18 | 18/18 | 18/18 | 18/18 | 四模型一致 |
| S1 数值一致（人工） | 6/6 | 6/6 | 6/6 | 6/6 | 四模型一致 |
| B1 意图 + 分级 | 50/50 | 50/50 | 50/50 | 50/50 | 四模型一致 |
| B1 分级错误数 | 0 | 0 | 0 | 0 | 四模型一致 |
| TTFT P50 | 17.5s | 8.4s | 4.9s | 约 25s | 模型属性（见下） |
| 完整响应 P50 | 31.5s | 28.0s | 6.8s | 约 35s | 模型属性（见下） |

延迟是唯一随模型变化的维度——这恰是消融实验的价值：**正确性指标 100% 一致，性能指标呈现模型差异**（DeepSeek V4.1 TTFT 快 3.5 倍且首跑即双满分；Qwen3.8 快 2.1 倍；Kimi K3 因 thinking 常开最慢但正确率不受影响）。运行时按业务需要切换模型，安全与准确率不动。

**工程附注（消融过程中修复的 5 处模型无关缺陷）**：为抹平模型间表述差异，我们把 4 项聚合计算下沉到服务端预计算（`wealth_holdings_query` 的 `total_principal/total_value`、`contacts_search` 的 `total_payees`、`subscription_scan` 的 `next_charge`），并将 B1 判定改为取最终确认卡。这些修复让"任何模型都能答对"从偶然变为架构必然——正是 Runtime 思路的又一次验证。

| 消融产物 | 路径 |
|---|---|
| 四模型指标总表（CSV） | [`docs/benchmarks/ablation/ablation-qwen.csv`](./docs/benchmarks/ablation/ablation-qwen.csv) |
| 消融最终报告 | [`docs/benchmarks/ablation/ablation-final-report.md`](./docs/benchmarks/ablation/ablation-final-report.md) |
| 板块一执行汇总（21 项指标全景） | [`docs/benchmarks/ablation/PHASE_SUMMARY.md`](./docs/benchmarks/ablation/PHASE_SUMMARY.md) |
| S1 四模型全量文本 | [`docs/benchmarks/business/s1-*-full.json`](./docs/benchmarks/business/)（4 份） |
| B1 四模型全量文本 | [`docs/benchmarks/business/b1-*-full.json`](./docs/benchmarks/business/)（4 份） |

> 看板呈现：`/ai/benchmark`（SuveooBench，12 指标 + 四模型消融对比，数据源 `frontend/assets/data/benchmark.json`）。完整测试方案：[`for_developer/testing_20261002.md`](./for_developer/testing_20261002.md)（v1.1）。

---

## 快速开始

```bash
git clone https://github.com/Suveoo/suveoo.git && cd suveoo/backend
npm install
npx wrangler dev        # 本地起 Worker + DO + KV + R2 模拟
# → http://localhost:8787
npx wrangler deploy     # 部署（需 wrangler login + Cloudflare 账号）
```

**演示账户**：`demo@suveoo.com` / `jinrongkeji2026`（模拟银行系统，不涉及真实资金；登录含邮箱验证码 2FA；可用 `/api/demo/seed` 重灌演示数据——DEMO_MODE 门控）。

完整部署手册：[DEPLOYMENT.md](./DEPLOYMENT.md)（环境变量、密钥、域名、R2、Cron、APK 构建）。

---

## 仓库结构

```
suveoo/
├── backend/
│   ├── worker-main.js          # 单文件 Worker：IR 编译 + 五道验证 + 63 工具 + DO + 邮件 + …（~9700 行）
│   ├── android/                # Capacitor 壳（Java：目录路由/生物识别/通知服务/内嵌浏览器/更新）
│   ├── tests/                  # 463 用例（unit 24 / integration 33 / attack 6）
│   └── scripts/                # 部署/APK 构建/评测脚本（ai-hallucination / b1-intent-matrix / ai-bench / tool-latency / s2b4p4-e2e）
├── frontend/                   # 零构建 MPA：76 页 / 62 控制器 / 10 计算器 / 三语 i18n / PWA
├── docs/
│   ├── benchmarks/             # 评测证据库（security / business / performance / ablation，可直接核查）
│   ├── architecture.md · core-algorithms.md · security-self-assessment.md · design-language.md · test-cases.md
├── for_developer/              # 内部文档（测试方案 / 特性全景 / 评测原始产物 bench-results/）
├── DEPLOYMENT.md               # 部署手册
└── README.md
```

---

## 文档地图

| 文档 | 内容 |
|---|---|
| [from_README_start_to_4.md](./from_README_start_to_4.md) + [from_README_5_to_end.md](./from_README_5_to_end.md) | 全量开发实录（180+ 版 changelog，每一版含根因分析） |
| [docs/benchmarks/](./docs/benchmarks/) | 评测证据库：S1/B1 四模型全量文本、性能原始数据、消融总表与报告 |
| [docs/architecture.md](./docs/architecture.md) · [docs/core-algorithms.md](./docs/core-algorithms.md) | 系统架构 / 核心算法 |
| [docs/security-self-assessment.md](./docs/security-self-assessment.md) · [docs/test-cases.md](./docs/test-cases.md) | 安全自评 / 测试用例说明 |
| [for_developer/suveoo_ai_features.md](./for_developer/suveoo_ai_features.md) | 特性全景母本（20 章，技术+叙事双文体） |
| [for_developer/testing_20261002.md](./for_developer/testing_20261002.md) | 多指标测试体系 + Ablation 实验方案 v1.1 |

---

## 诚实披露

- 模拟银行系统，全部数据虚构，不涉及真实资金。
- 我们不使用没有跑通的技术名词（规则引擎为内联类型化规则表；未实现的能力不写入特性清单）。
- P1/P2/P4 延迟受思考型模型固有开销影响，标注为记录型指标而非承诺；唯一设阈值的性能指标是 P3 工具调用（P95 ≤ 800ms，实测 435ms）。

<div align="center">

**Suveoo（源自爱沙尼亚语 suveöö，夏夜）**

<!-- 插图 11：四幕演示叙事拼图（AA 分账 / Consent Binding 失效 / Saga 故障注入 / 攻防看板，四格拼图） -->
![Demo Story](docs/images/readme/demo-story.png)

</div>
