# 贡献指南（Contributing to Suveoo）

感谢你对 Suveoo 的关注！本指南说明如何参与贡献——Issue 报告、功能建议与代码提交的流程与要求。

> **Suveoo** 是面向金融科技竞赛的模拟银行系统：Cloudflare Worker 单文件后端（BankAction IR + 五道确定性验证）+ 零构建 MPA 前端 + Android（Capacitor）/ Windows / macOS（Electron）三端客户端壳。

## 行为准则

参与本项目即表示你同意遵守[行为准则](./CODE_OF_CONDUCT.md)。请以专业、友善的方式交流。

## 许可须知（重要）

本仓库采用 [Suveoo Proprietary License v1.0](./LICENSE)（专有许可）。**向本仓库提交贡献（代码或文档），即表示你同意该许可第 6 条**：贡献按同一许可授权给项目方，项目方保留对代码库（含贡献）再许可的权利。若对条款有疑问，请先通过 [SECURITY.md](./SECURITY.md) 中的渠道联系我们，再开始工作。

## 开发环境

```bash
git clone https://github.com/Suveoo/suveoo.git && cd suveoo/backend
npm install                 # Node ≥ 22（.nvmrc 已固定；wrangler 4 要求）
npx wrangler dev            # 本地起 Worker + DO + KV + R2 模拟 → http://localhost:8787
npm test                    # 后端测试矩阵（vitest + workers 池）
```

- 桌面壳测试各自独立：`cd backend/windows && npx vitest run`、`cd backend/macos && npx vitest run`（依赖 Electron 的 node 环境，不进根套件）；
- 完整部署手册见 [DEPLOYMENT.md](./DEPLOYMENT.md)（Windows/macOS 客户端构建发布见 §15/§16）。

## 测试与质量要求

任何改动提交 PR 前，请确保：

1. **相关测试套件全绿**：后端 463 用例（`backend/tests/`，Workers 池）/ Windows 壳 34 / macOS 壳 47；新逻辑请附测试；
2. **涉及前端**：三端共用 `frontend/`（Web/Android/Windows/macOS 同时生效），改动需向后兼容三端；
3. **涉及双桌面壳七文件**（`protocol.js / preload.js / ipc.js / navigation.js / smoke.js / qa-shot.js / e2e-driver.js`）：两壳逐行同源，跨壳修复必须双写，并在 PR 中勾选同源检查项；
4. **涉及安全语义**（五道验证、OTP、授权、熔断）：不得绕过或降级；服务端 SQL 一律参数绑定；
5. 触发 Worker/前端变更的，说明中请注明是否已完成**生产实测**（我们的交付纪律是部署后线上验证）。

## 报告问题（Issue）

- 使用仓库提供的 Issue 模板（Bug 报告 / 功能建议），填写环境与复现步骤；
- **安全漏洞不走公开 Issue**：请按 [SECURITY.md](./SECURITY.md) 经私密渠道报告（`security@suveoo.com` 或 GitHub 私密漏洞报告）；
- 已知设计取舍与风险披露见 [docs/security-self-assessment.md](./docs/security-self-assessment.md) §2，重复报告不在范围内。

## 分支与提交规范

- 主开发分支为 `main`；建议从 `main` 切出特性分支（`feat/xxx`、`fix/xxx`）后提 PR；
- 提交信息使用 Conventional Commits 风格前缀：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`，正文可用中文简述动机与验证方式；
- 每个有用户可见变化的合并在 [from_README_5_to_end.md](./from_README_5_to_end.md) §15（changelog）追加一条记录（含根因/动机简述）——这是本仓库的既定交付纪律。

## 提交 Pull Request

1. PR 描述请按仓库模板（[.github/PULL_REQUEST_TEMPLATE.md](./.github/PULL_REQUEST_TEMPLATE.md)）勾选：涉及端、测试情况、文档更新、双壳同源检查；
2. CODEOWNERS 机制会自动请求对应区域的代码所有者评审（见根目录 [CODEOWNERS](./CODEOWNERS)）；
3. 通过评审后由维护者合入 `main`；部署由维护者统一执行（wrangler / 客户端发布管线），**请勿在 PR 中包含部署产物或密钥**。

## 密钥与凭据纪律

生产密钥一律走 `wrangler secret`；任何密钥、凭据、`.env` 内容不得进入提交历史。若发现疑似泄漏，请勿在 PR/Issue 中复述，按 SECURITY.md 私密报告。

## 联系方式

- 一般讨论：Issue / Pull Request；
- 支持与咨询：support@suveoo.com；
- 安全事务：见 [SECURITY.md](./SECURITY.md)。

---

感谢你的贡献——每一份谨慎的提交都在帮助 Suveoo 变得更可靠。
