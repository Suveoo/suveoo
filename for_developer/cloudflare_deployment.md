# Cloudflare 部署教程（手动部署当前版本）

本文面向开发者，描述如何把 `D:\suveoo` 的当前版本手动部署到 Cloudflare，
使 **suveoo.com / www.suveoo.com** 提供最新服务。部署分两条独立链路：

| 链路 | 内容 | 命令 |
|------|------|------|
| 前端资产 | 50+ 静态页面、JS/CSS、图标、字体、i18n、数据 JSON → **R2 桶 `suveoo-bank-r2`** | `node scripts/deploy-frontend.mjs --filter <路径>` |
| 后端 Worker | API、MCP 网关、验证运行时、Durable Objects → **Worker `suveoo-bank-main`** | `npx wrangler deploy` |

---

## 0. 前置条件（一次性）

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 20（含 npm） |
| Cloudflare 账号 | 对 zone `suveoo.com` 有管理权限 |
| wrangler 登录 | `cd backend && npx wrangler login`（浏览器 OAuth 一次即可） |
| 资源 | KV ×2（SESSION_KV、AUDIT_KV）、R2 桶 `suveoo-bank-r2`、D1 无需、Email Service 已验证 `suveoo.com` 域 |
| 密钥 | 已 `npx wrangler secret put` 配置：`JWT_SECRET`、`LLM_API_KEY`（换行粘贴值后回车） |

验证登录与资源：

```bash
cd D:\suveoo\backend
npx wrangler whoami
```

---

## 1. 部署后端 Worker

```bash
cd D:\suveoo\backend

# （推荐）先跑全量测试：147+ 项全绿才允许部署
npx vitest run

# 部署
npx wrangler deploy
```

成功输出以 `Current Version ID: <uuid>` 结尾，同时打印两条路由
（`suveoo.com/*`、`www.suveoo.com/*`）。

**验证**：

```bash
curl https://suveoo.com/api/version
# {"version":"...","provider":"qwen","demo_mode":"true"}
```

**回滚**（部署后发现问题时）：

```bash
npx wrangler rollback           # 回滚到上一版本
npx wrangler deployments list   # 查看版本历史
```

---

## 2. 部署前端资产（R2）

前端是纯静态资产，全部落在 R2 桶 `suveoo-bank-r2`，由 Worker 的静态路由
对外服务。**版本号机制是本链路的核心纪律**：

### 2.1 版本号 bump（JS/CSS 有任何改动时必须执行）

页面 HTML 引用资产形如 `?v=bNN`，且 HTML 本身 `Cache-Control: no-cache`、
资产为 `max-age=3600`——**不改版本号，用户浏览器会在 1 小时内继续使用旧
JS/CSS**。

```bash
cd D:\suveoo\frontend
find . -name "*.html" -exec sed -i "s/v=b67/v=b68/g" {} +
grep -rl "v=b68" --include="*.html" . | wc -l     # 应输出 60
```

> ⚠️ 必须在 `frontend` 目录执行；曾在 `backend` 目录执行导致静默无效。
> 若只改了部分文件且能确认无 HTML 引用变化，也建议整体 bump（成本仅 50 个小文件）。

### 2.2 上传

部署脚本在 `backend` 目录执行（它按相对路径定位 `../frontend`）：

```bash
cd D:\suveoo\backend
node scripts/deploy-frontend.mjs --filter "index.html"      # 全部 HTML（60 个）
node scripts/deploy-frontend.mjs --filter "js/"             # 全部脚本
node scripts/deploy-frontend.mjs --filter "css/"            # 全部样式
node scripts/deploy-frontend.mjs --filter "i18n/"           # 语言包
node scripts/deploy-frontend.mjs --filter "assets/data/"    # 数据 JSON
```

- `--filter` 为前缀匹配，可组合多次调用；不带 `--filter` 则全量上传。
- 脚本内置**上传后回读校验 + 退避重传**（规避 wrangler 偶发假成功），
  结尾输出 `✓ 全部完成：N/N` 即为成功；任何 `✗` 条目需重跑。

### 2.3 常用组合（按改动范围选择）

| 改动范围 | 命令序列 |
|----------|----------|
| 页面控制器 JS + HTML 版本 | `index.html` + `js/pages/` |
| 全局 core（api/app/i18n…） | `index.html` + `js/core/` |
| 样式调整 | `index.html` + `css/` |
| 语言包文案 | `index.html`（无必要） + `i18n/` |
| Worker 逻辑 | 无前端，仅需 `npx wrangler deploy` |

---

## 3. 一键全量发布（双链路）

后端与前端的发布顺序：**先 Worker 后前端资产**（新接口先行，旧页面调用也
兼容；反之旧前端可能调用不存在的新参数）。

```bash
cd D:\suveoo\backend
npx vitest run                        # 全量测试（147+），必须全绿
npx wrangler deploy                   # ① 后端
node scripts/deploy-frontend.mjs --filter "index.html"
node scripts/deploy-frontend.mjs      # ② 前端全量（不加 filter）
```

---

## 4. 部署后验证清单

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://suveoo.com/home                 # 200
curl -s https://suveoo.com/api/version                                           # 版本/Provider
curl -s https://suveoo.com/sitemap.xml | head -3                                 # XML 正常
curl -sI https://suveoo.com/assets/css/polish.css | grep -i content-type         # text/css
```

浏览器（建议无痕窗口避开缓存）：

- [ ] /home 渲染完整、无骨架屏残留、无 console 报错；
- [ ] 登录 demo 账号，抽查转账确认卡与通知；
- [ ] /ai 发送一条消息，Trust Console 出现事件流；
- [ ] 检查页面引用的 `?v=bNN` 与本次版本号一致。

---

## 5. 常见问题

| 现象 | 处理 |
|------|------|
| 页面正常但样式/脚本是旧的 | 版本号没 bump 或 HTML 未重传：重做 §2.1 并重传 `index.html` |
| `wrangler deploy` 报 Authentication | `npx wrangler login` 重新 OAuth；或检查 `CLOUDFLARE_API_TOKEN` |
| 部署脚本出现 `✗` 条目 | 脚本已自动重试；仍失败则单独重跑同 filter 命令 |
| Worker 报 DO/KV 绑定缺失 | 确认在 `backend` 目录执行（wrangler.toml 在此），且账号拥有对应资源 |
| `Couldn't fetch`（Search Console） | 提交后暂态，Google 稍后自动重读；服务端 curl 自查 200 + XML 即可 |
| 需要 404 兜底 | Worker 静态路由已内置；确认 `frontend/404.html`、`offline/index.html` 在 R2 中存在 |

---

## 6. 与 GitHub 的关系

GitHub 仓库（`Suveoo/suveoo`）仅托管源码与评审，**不自动触发部署**。
标准节奏：本地改代码 → 本地部署验证 → `git commit` + `git push`（流程见
同目录 `github_deployment.md`）。若需 CI/CD 自动化，见该文档第 7 节提示。
