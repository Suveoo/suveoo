# Suveoo 安全策略（Security Policy）

> **重要声明**：Suveoo 是面向金融科技竞赛的**模拟银行系统**——不持有真实客户资金，不接入任何真实银行通道。我们仍按真实金融系统的标准运营漏洞披露，因为我们希望以最高标准检验这套架构。

**目录**：[1 支持的版本](#1-支持的版本) · [2 如何报告漏洞](#2-如何报告漏洞) · [3 协调披露流程](#3-协调披露流程) · [4 报告范围](#4-报告范围) · [5 已部署的安全体系](#5-已部署的安全体系) · [6 已知风险与已披露项](#6-已知风险与已披露项) · [7 秘密与凭据政策](#7-秘密与凭据政策) · [8 致谢](#8-致谢)

---

## 1. 支持的版本

| 组件 | 支持策略 |
|---|---|
| 后端 Worker / Web 前端 | 随 `main` 持续部署，仅支持线上最新版 |
| Android 客户端 | 仅最新 versionCode；更新清单远程强制线 `minVersionCode` 可阻断旧版 |
| Windows / macOS 客户端 | 仅 `/download` 与 R2 manifest 提供的最新发布版 |

当前客户端发布线：**v3.188.0**（Android vc82 / Windows·macOS vc3188000）。

历史版本不提供安全回溯修补；客户端旧版本会被更新链的强制线主动阻断。

## 2. 如何报告漏洞

**请勿就安全问题开启公开 Issue 或公开讨论**——已公开的报告按一般问题处理，不计入安全致谢。

| 渠道 | 适用 | 说明 |
|---|---|---|
| GitHub 私密漏洞报告 | 仓库公开后首选 | 仓库 Security 标签页 → Report a vulnerability；报告在修复前仅与我们私密可见，可在线协作复现 |
| **security@suveoo.com** | 任意时期 | 邮件标题请以 `[security]` 开头；仓库公开后与上一渠道并行 |

**理想的报告包含**：

- 受影响组件（Web / API / AI 与 MCP 通道 / Android / Windows / macOS 壳 / 更新分发链）；
- 复现步骤与最小化请求（HTTP 方法、路径、关键请求与响应体；AI 通道请附完整对话与工具调用记录）；
- 影响评估（绕过了哪一道验证、能读/写什么、是否跨越用户隔离边界）；
- 您建议的缓解方向（可选，不强制）。

**响应时限**：

| 阶段 | 目标 |
|---|---|
| 确认收到 | 48 小时 |
| 初步评估（定级 + 是否在范围） | 5 个工作日 |
| 修复或缓解发布 | 30 天（复杂问题可协商延展，每 7 天同步一次进展） |

## 3. 协调披露流程

- 遵循**协调披露**（Coordinated Disclosure）：修复发布前请勿公开漏洞细节；
- 修复后经 changelog（`from_README_5_to_end.md` §15）与 GitHub 安全公告披露根因与修复；
- CVE 编号（如适用）由我们经 GitHub Security Advisories 申请；
- 常规披露窗口为报告后 90 天；修复提前完成则提前披露；
- **安全港（Safe Harbor）**：对遵守本策略、不影响服务可用性与其他用户数据的善意研究，我们不会追究。

## 4. 报告范围

**在范围内（In Scope）**：

- `https://suveoo.com` 生产 Worker 与全部 API（含 `/mcp` 端点与 AI 通道）；
- Web 前端（`frontend/`）与 PWA；
- 三端原生客户端（`backend/android`、`backend/windows`、`backend/macos`）及其本地协议、IPC、更新链；
- 更新分发链（R2 `/dl/*-manifest.json` 与 APK/EXE/DMG 工件的完整性）；
- 越权与用户隔离绕过、授权/确认机制（grant、OTP、熔断）绕过、提示注入的成功利用链。

**不在范围内（Out of Scope）**：

- 演示账户数据的自我污染与账户内自我操作；
- DoS / 资源耗尽类攻击（模拟系统不承诺可用性 SLA）；
- 已在 `docs/security-self-assessment.md` §2 披露的 R-01～R-10 及后续已知风险（见 §6）；
- 自行部署（fork）环境的配置错误（请参照 `DEPLOYMENT.md`）；
- 第三方依赖（Electron、Capacitor、wrangler 等）自身的漏洞（请报告上游；欢迎抄送我们评估暴露面）。

## 5. 已部署的安全体系

为帮助研究者聚焦**增量发现**，以下是已实现且有测试佐证的防线（请勿就设计本身重复报告）：

**后端安全内核（BankAction IR + 五道确定性验证）**

1. **IR 编译**：自然语言与表单统一编译为结构化操作；LLM 无自造交易结果的能力——所有结果 JSON 来自账本执行层（幻觉防护），金额边界为字符串、内核 BigInt；
2. **Provenance / Taint Check**：每个 IR 事实携带来源与可信等级，被污染参数（商户备注/用户输入等）在请求授权**之前**即被拦截；
3. **Policy 三色分级**：GREEN 自动执行 / YELLOW 确认（服务端签发 grant，生产 TTL 300s）/ RED 强验证（短信/邮箱双通道 OTP：哈希存储、60s 冷却、一次性消费、错 5 次作废、10 分钟有效）；借记卡单笔/日累计限额在执行层独立强制；
4. **Consent Binding**：`grant_hash` 绑定参数级快照——确认前改任何授权字段即失效；nonce 幂等集防重放；
5. **Financial Invariants**：余额守恒（含锁定金额）、PR 适当性匹配、跨用户转账双记（收款方 credit 成功才扣款）。

**账号与会话**：改密与关闭 2FA 须当前密码；改密触发会话纪元全设备下线；JWT 1 小时；AI 通道不注册任何凭证类工具（改密/2FA/找回仅人工页面）。

**异常熔断**：OTP 连错 5 次 / 注入拦截 2 次 / 凭据篡改 3 次任一触发——锁定黄红写操作、放行绿查询、邮箱可提前解锁、全程审计。

**审计**：每用户 `user_audit` + KV 日级索引，转账/冻结/限额/理财/任务等关键操作全留痕，用户可在安全中心自查。

**三端客户端壳**：CORS 仅五源白名单（`SHELL_ORIGINS`）；本地资产协议防路径穿越；更新链强制 https + suveoo.com 域白名单、sha256 逐包校验、仅执行自家 updates 目录内工件、远程强制线；IPC 白名单 16 方法 + 入参形状校验；生物识别走系统级（Android BiometricPrompt / Windows Hello / Touch ID），凭据 safeStorage 加密落盘（DPAPI / Keychain），无传感器自动回落密码/OTP、不降级安全语义。

**测试面**：vitest 545（后端）+ 34（Windows 壳）+ 47（macOS 壳）；attack 七文件（注入两代 / 越权 / 重放 / 同意突变含 v2 / 授权伪造）；生产黑盒 228 断言；四模型消融（GLM / Qwen3.8 / DeepSeek / Kimi K3）全部核心指标一致。证据见 `docs/security-self-assessment.md` 与 `docs/benchmarks/`。

## 6. 已知风险与已披露项

我们以**诚实披露**方式维护已知风险清单——如 KV 消费非原子的极短并发窗口、JWT 无刷新令牌、**红级服务端可验证 Passkey 仍在路线图（Web 黄级本机 WebAuthn 门已启用）**、注入检测为启发式规则等——完整清单见 `docs/security-self-assessment.md` §2（R-01～R-10）。这些属于已知取舍或已排期加固项，**重复报告不计入致谢**；但**绕过既有缓解措施的新利用链**仍在报告范围内。

## 7. 秘密与凭据政策

- 生产密钥一律经 `wrangler secret` 注入（`DEPLOYMENT.md` §6），源码与仓库零明文；
- E2E 测试凭据走 gitignored 的 `e2e-creds.json`，OTP 走本地文件通道，均不入库；
- 若你在任何公开位置发现 Suveoo 疑似泄漏的秘密：**请勿提交复述该秘密的 PR 或 Issue**，直接按 §2 私密报告，我们会在 24 小时内轮换；
- 贡献者请保持 push 前本地扫描习惯，组织层建议开启 GitHub secret scanning 与 push protection。

## 8. 致谢

经报告者同意后，我们会在 GitHub 安全公告与 changelog 中公开致谢安全研究者。感谢每一位帮助 Suveoo 变得更安全的人。

---

*本策略参考社区最佳实践：[GitHub 协调披露指南](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/about-repository-security-advisories) · [CISA 漏洞披露政策模板](https://www.cisa.gov/resources-tools/resources/vulnerability-disclosure-policy-template) · [RFC 9116（security.txt）](https://www.rfc-editor.org/rfc/rfc9116)。站点级指路标已上线：[`https://suveoo.com/.well-known/security.txt`](https://suveoo.com/.well-known/security.txt)（Expires 动态自续期）。*
