# GitHub 部署教程（手动上传当前版本到 Suveoo/suveoo）

本文面向开发者，描述如何把 `D:\suveoo` 的当前工作区状态手动推送到 GitHub 仓库
**Suveoo（organization）→ suveoo（Repository）** 的 `main` 分支。
全程只需一次环境准备；日常发布只需第 3、4 步。

---

## 0. 前置条件（一次性）

| 项目 | 要求 | 检查方式 |
|------|------|----------|
| Git | ≥ 2.40，已加入 PATH | `git --version` |
| GitHub 账号 | 对 `Suveoo` organization 有 `suveoo` 仓库的写权限 | 浏览器打开 `https://github.com/Suveoo/suveoo` 能看到 "Settings" |
| 凭据 | Windows 凭据管理器中存有 GitHub PAT（或已安装 gh CLI 并 `gh auth login`） | 见第 1 步验证 |

> 仓库地址固定为 `https://github.com/Suveoo/suveoo.git`（HTTPS 方式，凭据由 Git Credential Manager 自动携带）。

---

## 1. 验证授权（零交互）

在 `D:\suveoo` 打开终端：

```bash
cd /d D:\suveoo        # cmd
cd D:\suveoo           # PowerShell
# Git Bash: cd /d/suveoo
```

```bash
GIT_TERMINAL_PROMPT=0 git ls-remote origin
```

- 输出仓库的 HEAD / refs 哈希 → **授权就绪**，继续第 2 步。
- 弹出账号密码输入框或报 403 → 授权缺失，二选一修复：
  - **方式 A（推荐，无需安装）**：Windows「凭据管理器」→「Windows 凭据」→ 找到
    `git:https://github.com` → 编辑或删除后，任意一次 `git push` 会弹出浏览器
    登录 GitHub 完成重新授权；
  - **方式 B**：安装 GitHub CLI（`winget install GitHub.cli`），执行 `gh auth login`
    按提示走浏览器 OAuth，然后 `gh auth setup-git`。

---

## 2. 确认远端与分支

```bash
git remote -v
# 期望输出：
# origin  https://github.com/Suveoo/suveoo.git (fetch)
# origin  https://github.com/Suveoo/suveoo.git (push)
```

若 remote 为空或不正确：

```bash
git remote add origin https://github.com/Suveoo/suveoo.git
# 或修正：
git remote set-url origin https://github.com/Suveoo/suveoo.git
```

确认当前分支为 `main`：

```bash
git branch --show-current        # 应输出 main
```

---

## 3. 提交（commit）

### 3.1 检查将入库的内容

```bash
git status --short
git diff --cached --stat         # add 之后用这条看清单
```

**入库前自查清单**（仓库 .gitignore 已自动排除，但仍建议肉眼过一遍）：

- [ ] 不出现 `for-claude-code/`（内部策略目录）
- [ ] 不出现 `To Do.md`、`notes/`、`notes-*.md`、`Project Directory Tree.md`（内部笔记）
- [ ] 不出现 `IMG_*.PNG`、`Screenshot*.png`（本地截图）
- [ ] 不出现 `.dev.vars`（本地密钥；`.dev.vars.example` 是允许入库的模板）
- [ ] `backend/wrangler.toml` 中**没有任何密钥明文**（密钥一律走 `wrangler secret`）

### 3.2 暂存并提交

```bash
git add -A
git commit -m "feat: 简明描述本次变更"
```

提交信息建议遵循 `feat:/fix:/docs:/chore:` 前缀 + 一句话概述。

---

## 4. 推送到 GitHub

```bash
git push origin main
```

- 首次推送（远端为空仓库）用：`git push -u origin main`
- 成功输出形如 `35b010c..48baf93  main -> main`。
- 若提示远端有新提交，先 `git pull --rebase origin main` 再推。

---

## 5. 验证

1. 浏览器打开 `https://github.com/Suveoo/suveoo`，确认最新 commit 出现在 main；
2. 抽查 1-2 个本次改动的文件内容；
3. 命令行核对远端指针与本地一致：

```bash
git ls-remote origin refs/heads/main
git rev-parse HEAD
# 两者哈希应相同
```

---

## 6. 常见问题

| 现象 | 原因与处理 |
|------|-----------|
| `Authentication failed` | 凭据过期：凭据管理器删除旧条目后重新 push 走浏览器授权 |
| `rejected - non-fast-forward` | 远端有新提交：`git pull --rebase origin main` 解决冲突后重推 |
| push 卡住无响应 | 网络问题；检查代理，或 `git config --global http.postBuffer 524288000` 后重试 |
| 中文文件名显示为转义码 | `git config --global core.quotepath false` |
| 误提交了敏感文件 | 立即 `git rm --cached <文件>` 并 commit + push；若含密钥必须**同时作废该密钥**（历史中仍可见） |

---

## 7. 与 Cloudflare 部署的关系

GitHub 仓库**不参与**线上部署链路——suveoo.com 的前端资产与 Worker 均由本地
`wrangler` / 部署脚本直推 Cloudflare（见同目录 `cloudflare_deployment.md`）。
仓库的作用是**源码托管与评审**；若未来需要 CI/CD 自动部署，可在仓库
Settings → Secrets 添加 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`
并接入 `wrangler-action`，本教程不展开。
