# DEPLOYMENT.md — Suveoo 部署手册（suveoo.com）

> 适用范围：`backend/`（Cloudflare Worker `suveoo-bank-main`）+ `frontend/`（R2 静态资源）全量部署。
> 架构事实依据：`for-claude-code/Framework 20260907-2.md`（权威）与 `Framework 20260906.md`（基础设施细节）。页面与 API 契约见 `for-claude-code/pages.md` v2。
> 本文档同时满足赛题交付要求中的「部署说明」。

---

## 1. 架构与资源总览

| 资源 | 名称 | 角色 |
|------|------|------|
| Cloudflare Worker | `suveoo-bank-main` | 唯一 Worker：静态资源分发（R2 回源）+ REST `/api/*` + MCP `/mcp`（Streamable HTTP，`createMcpHandler`）+ BankAction IR 编译 + Suveoo Verification Runtime + Saga/Ledger DO 调用 + LLM 代理 + Email 发送 + pdf-lib 报告 |
| R2 Bucket | `suveoo-bank-r2` | 前端静态资源（`frontend/` 整目录上传至桶根）+ 公共数据 `assets/data/*` + 用户月度报告 `reports/{user_id}/*.pdf` |
| Worker KV × 2 | `suveoo-session-kv` | 会话、JWT 黑名单、限流计数、**Consent Grant（`grant:{user_id}:{grant_hash}` → Action Snapshot，TTL 120s）** |
| | `suveoo-audit-index-kv` | 审计日志快速索引（`audit:{date}:{tx_id}`） |
| Durable Object × 2 class | `ledger-do`（每用户一实例） | 账本状态机（ACID）、nonce 幂等集、长程任务检查点（SQLite 存储） |
| | `saga-do`（每事务流一实例） | Saga 协调器、补偿事务、Merkle 审计链 |
| Email Service | `send_email` binding（`EMAIL`） | 事务邮件：验证码、交易回执、安全告警、support 转发（发件域 suveoo.com） |
| 域名 | `suveoo.com`（+ `www` 301 → 裸域） | Worker Route `suveoo.com/*`，Cloudflare 托管 DNS |
| 分析 | GA4 `G-KLK499CDQF` | gtag.js + Consent Mode v2（默认 denied） |

> KV 命名对照 Framework 20260907-2 §4.1：`session-kv` → `suveoo-session-kv`，`audit-index-kv` → `suveoo-audit-index-kv`（加前缀避免账户内命名冲突，语义一致）。

## 2. 前置条件

1. **Cloudflare 账户**（Free 计划即可起步；DO/KV/R2 需确保账户已启用付费项 R2 与 Durable Objects——R2 有免费额度，DO 需 Workers Paid（$5/月起）。若需保持零成本，需在评测中说明并用 SQLite-backed DO 的免费额度（Workers Free 现支持 SQLite DO 有限额度），以实测为准）。
2. **域名 suveoo.com 已购入并将 Nameserver 指向 Cloudflare**（Dashboard → Add site → 按提示在注册商处更换 NS，等待 active）。
3. 本机 **Node.js ≥ 20**、npm；Windows 下建议 PowerShell 或 Git Bash。
4. `npx wrangler login` 完成浏览器授权。

## 3. 资源创建（一次性，按序执行）

```bash
cd backend

# 0) 登录
npx wrangler login

# 1) R2 Bucket
npx wrangler r2 bucket create suveoo-bank-r2

# 2) KV Namespaces（记录返回的 id，填入 wrangler.toml）
npx wrangler kv namespace create suveoo-session-kv
npx wrangler kv namespace create suveoo-audit-index-kv

# 3) DO class 无需手工创建：首次 deploy 时由 wrangler.toml 的
#    [[migrations]] new_sqlite_classes 自动创建（见 §4）
```

## 4. wrangler.toml 模板（backend/wrangler.toml）

```toml
name = "suveoo-bank-main"
main = "worker-main.js"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

# 生产路由（自定义域方式二选一：routes 或 dashboard Custom Domain）
routes = [
  { pattern = "suveoo.com/*", zone_name = "suveoo.com", custom_domain = false },
  { pattern = "www.suveoo.com/*", zone_name = "suveoo.com", custom_domain = false }
]

# Durable Objects（SQLite 存储，免费档可用）
[[durable_objects.bindings]]
name = "LEDGER"
class_name = "LedgerDO"
[[durable_objects.bindings]]
name = "SAGA"
class_name = "SagaDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["LedgerDO", "SagaDO"]

# KV
[[kv_namespaces]]
binding = "SESSION_KV"
id = "<suveoo-session-kv 的 id>"
[[kv_namespaces]]
binding = "AUDIT_KV"
id = "<suveoo-audit-index-kv 的 id>"

# R2
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "suveoo-bank-r2"

# Email Sending（suveoo.com 需先完成 Email Service 域验证，见 §8）
[[send_email]]
name = "EMAIL"

# 普通变量（非密钥）
[vars]
CONSENT_GRANT_TTL_SECONDS = "120"
INVARIANT_STRICT_MODE = "true"
DEMO_MODE = "false"                 # 决赛演示环境置 true（开启故障注入/Baseline 开关）
FIDO2_RP_ID = "suveoo.com"
FIDO2_ORIGIN = "https://suveoo.com"
SENDER_NOREPLY = "noreply@suveoo.com"
SENDER_SECURITY = "security@suveoo.com"
SUPPORT_INBOX = "support@suveoo.com"
LLM_PROVIDER = "anthropic"          # anthropic | openai | qwen（Ablation 时切换）
```

密钥（Secrets，见 §6）绝不写入 toml。

## 5. 本地开发

```bash
cd backend
npm install                 # 安装 agents / @modelcontextprotocol/server / zod / pdf-lib / wrangler / vitest
cp .dev.vars.example .dev.vars   # 填入本地密钥（已 gitignore）
npx wrangler dev            # http://127.0.0.1:8787
```

- 静态资源本地联调：`wrangler dev` 通过 R2 binding 读**线上桶**（remote binding）；或临时 `wrangler r2 object put` 上传 `frontend/`。前端改动后运行 `node scripts/deploy-frontend.mjs --local`（脚本内用 miniflare 本地桶，最终实现以脚本为准）。
- MCP 联调：`npx wrangler dev` 后用 **MCP Inspector**（`npx @modelcontextprotocol/inspector`）连接 `http://127.0.0.1:8787/mcp`（Streamable HTTP），验证 `tools/list` 22 个工具与 elicitation 往返。
- Email 本地限制：`wrangler dev` 下 `send_email` 需 remote binding（`[[send_email]] name="EMAIL" remote=true` 仅本地调试段使用）；二进制附件本地模拟器不可序列化——验收以线上为准。
- 单测：`npm test`（vitest，unit/integration/attack 全跑）。

`.dev.vars` 模板（`.dev.vars.example`）：

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...              # Ablation 用
QWEN_API_KEY=sk-...                # Ablation 用（DashScope）
JWT_SECRET=...                     # openssl rand -hex 32
CANARY_TOKEN_SECRET=...            # openssl rand -hex 32
```

## 6. 密钥注入（生产）

```bash
cd backend
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put QWEN_API_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put CANARY_TOKEN_SECRET
npx wrangler secret list        # 核对
```

## 7. 部署步骤（正式）

```bash
# 1) 测试
cd backend && npm test

# 2) 发布 Worker（含 DO migrations）
npx wrangler deploy

# 3) 上传前端至 R2（frontend/ 内容 → 桶根，路径一一对应）
node scripts/deploy-frontend.mjs          # 内部循环 wrangler r2 object put suveoo-bank-r2/<path> --file <path>

# 4) 注入演示种子数据（演示账户/流水/任务，见 pages.md §10.2）
node scripts/seed-demo-data.mjs

# 5) 验证
curl -s https://suveoo.com/api/health
curl -s -o /dev/null -w "%{http_code}" https://suveoo.com/home        # 期望 200
npx wrangler tail suveoo-bank-main --format pretty                     # 实时日志
```

回滚：`npx wrangler deployments list` → `npx wrangler rollback <deployment-id>`（Worker）；R2 前端为覆盖式上传，回滚=重传上一版本 `frontend/`（建议在 Git tag 上操作）。

## 8. 域名、路由与 Email DNS

1. **Worker 路由**：suveoo.com zone 内添加 Route `suveoo.com/*` → `suveoo-bank-main`；`www.suveoo.com/*` 同绑定，Worker 内部将 www 301 至裸域（pages.md §2.6-7）。
2. **DNS**：suveoo.com → A/AAAA（Proxied，内容任意如 192.0.2.1，流量实际由 Worker Route 接管）；www → CNAME suveoo.com（Proxied）。TLS 证书由 Cloudflare 自动签发（Full 严格模式无需源站）。
3. **Email Service**：
   - Dashboard → Email → Email Service（Sending）：添加并验证域 **suveoo.com**（按指引添加 DNS 验证记录）。
   - 配置 **SPF**（`v=spf1 include:_spf.mx.cloudflare.net ~all`）与 **DKIM**（Email Service 提供的 CNAME/TXT），建议再加 **DMARC**（`v=DMARC1; p=none; rua=mailto:security@suveoo.com`）。
   - 验证发件地址可用：`noreply@`、`security@`、`support@suveoo.com`。
   - 限额：单邮件 ≤ 5 MiB、收件人 ≤ 50、附件 ≤ 32 个；错误码（`E_SENDER_NOT_VERIFIED` 等）处理见 `for-claude-code/cloudflare-email-sending-service-docs.md`，Worker 内须 try/catch 并降级（邮件失败不阻塞主流程，仅记录并站内通知兜底）。

## 9. GA4

- `G-KLK499CDQF` 的 gtag.js 片段置于每个页面 `<head>` 之后（每页一个，禁止重复）。
- 必须以 Consent Mode v2 默认 denied 加载（`assets/js/core/ga4.js` 统一实现），用户在 Cookie Preference 选择"接受全部"后再 `consent update` grant。
- 验证：GA4 实时报告 + `curl -s https://suveoo.com/home | grep G-KLK499CDQF`。

## 10. CI/CD（GitHub Actions）

- 仓库 Secrets：`CLOUDFLARE_API_TOKEN`（权限：Workers Scripts:Edit、KV Storage:Edit、R2:Edit、Account:Read、Zone:Edit）、`CLOUDFLARE_ACCOUNT_ID`（参考值 `3b97de0ff8dcf70064375a936a47d84d`，以 Dashboard 实际为准核对）。
- `test.yml`：PR 与 push → `npm ci && npm test`。
- `deploy.yml`：main 分支 push（或手动 dispatch）→ 测试 → `npx wrangler deploy` → `node scripts/deploy-frontend.mjs`。**Secrets 值通过 GitHub Secrets 注入，CI 不落盘。**
- 建议 main 分支保护 + 部署前 tag（`v0.x`）。

## 11. 监控与告警（沿用 Framework 9.6 §5.3）

| 指标 | 采集 | 阈值 |
|------|------|------|
| /mcp QPS | Worker Analytics | 突增 > 5× 基线 |
| 工具调用延迟 P99 | Worker Analytics | > 5s |
| 策略拒绝率 | 自定义 metrics（audit-kv 统计） | > 10% |
| Saga 补偿触发率 | saga-do 日志 | > 5% |
| 金丝雀泄露次数 | 安全事件日志 | > 0（立即告警） |
| Email 失败率 | EMAIL.send catch 计数 | > 5% |

日常命令：`npx wrangler tail suveoo-bank-main`、Dashboard → Workers → Metrics/Logs。

## 12. 演示环境（DEMO_MODE）

- `wrangler.toml` 的 `DEMO_MODE = "true"` 或 `npx wrangler deploy --var DEMO_MODE:true`。
- 开启后：/ai Trust Console 显示「Inject Merchant Failure」与「Baseline 对照开关」；`POST /api/demo/inject-failure` 可用；任务中心卡片显示故障注入按钮。
- 演示前必做：`node scripts/seed-demo-data.mjs` 注入演示账户（含火锅交易、注入样本备注、进行中的生日订花任务）。

## 13. 常见问题排查

| 症状 | 原因 | 处理 |
|------|------|------|
| 首页 404 / 404.html | frontend 未上传或键名不符 | 核对 R2 对象键须为 `home/index.html` 等（无 `frontend/` 前缀） |
| /mcp 401 | JWT 缺失/过期（1h） | 重新登录；检查 SESSION_KV 会话键 |
| 邮件不达 | 域未验证 / DNS 未生效 | §8.3 重查；`E_SENDER_NOT_VERIFIED` 即域验证问题 |
| Consent 永远 INVALID | 客户端/服务端时钟差或 TTL 过期 | 服务器时间为准；TTL 由 `CONSENT_GRANT_TTL_SECONDS` 控制 |
| DO 报错 class not found | migrations 未跑 | 确认 wrangler.toml `[[migrations]]` 并重新 deploy |
| Qwen MCP 连不上 | 官方仅保证 SSE，不支持 Streamable HTTP | 见 To Do.md 风险项 R-01：需代理层适配或改用受支持模型 |

## 14. 部署验收清单

- [ ] `curl https://suveoo.com/api/health` → `{status:"ok"}`
- [ ] `/home`、`/ai`、`/wealth/funds/global-mixed-1`、`/account/login`、`/transfer/intrabank/`（尾斜杠）均 200
- [ ] 未知路径返回 404.html（HTTP 404）；`/` 跳转 `/home`
- [ ] `www.suveoo.com` 301 → `suveoo.com`；`/downloads` 301 → `/download`
- [ ] MCP Inspector 连 `https://suveoo.com/mcp`：initialize + tools/list（22 个）成功
- [ ] 注册开户：收到验证码邮件；开户后 4 借记 + 1 信用卡、总余额 ∈ [999,328.24, 1,124,549.38]
- [ ] 黄级转账：确认卡倒计时 + grant_hash 显示；红级：OTP 邮件可达

## 15. Windows 客户端（Suveoo for Windows，Electron 44）

源码 `backend/windows/`；构建与发布一键化：`npm run release`（`--dry` 只构建不上传）。

### 15.1 首次环境
`npm install`（.npmrc 已配 npmmirror，electron 二进制走镜像）→ `npm install-scripts approve electron && npm rebuild electron`（npm 新版安全机制放行 postinstall）→ `python scripts/make-ico.py`（需 Pillow，生成 build/icon.ico）。

### 15.2 构建（三段式，绕开 winCodeSign 符号链接坑）
① `npx electron-builder --win dir` 解包 → ② 用 winCodeSign 缓存内的 rcedit-x64.exe 给 `dist/win-unpacked/Suveoo.exe` 打图标与版本元数据（ProductName=Suveoo、file/product-version）→ ③ `npx electron-builder --win nsis portable --prepackaged dist/win-unpacked` 出安装包+便携版（`release.mjs` 已封装全流程并自动定位 rcedit）。产物约 136 MB（extraResources 裁剪 cards-front 源图 + .mimosa）。

坑位备忘：非管理员无符号链接特权致 winCodeSign 缓存解包必败——正解是构建配置关掉签改可执行文件 + 手动 rcedit（剥归档/Developer Mode 均偏方）；npx 在 Windows 须经 shell；asar 内不可写（运行时日志写 userData）；混合显卡本机默认禁 GPU（崩溃根治）。

### 15.3 发布（R2 铁律 --remote）
`node scripts/release.mjs`：三段构建 → sha256 → 上传 setup/portable → 更新 `/dl/windows-manifest.json`（字段 versionName/versionCode/minVersionCode/url/sha256/sizeBytes/portableUrl；versionCode=major×1e6+minor×1e3+patch）。**强制更新**＝把 minVersionCode 提到高于存量版本（客户端全屏阻断层）；回滚＝manifest 改回旧值。

### 15.4 服务端配套（一次性）
Worker 壳源白名单已含 Windows 壳 origin `suveoo-app://local`；`/download` 页读 windows-manifest 渲染 Windows 卡片。

### 15.5 测试
`npm test`（vitest 29+：更新决策/URL 白名单/导航分类/IPC schema）｜`npx electron . --smoke`（78 路由冒烟）｜`--shot=<url> --size=WxH --out` 排版截图｜`--e2e=<suite>` 实机 E2E（demo-login / transfer-yellow / transfer-red-xyz / i18n-switch / external-browser / offline-resilience / tray-persist / deeplink / update-ask / update-force）。OTP 套件取码：browser-use 驱动 IAB Gmail 读码写入 `e2e-otp.txt`；账户凭据经 `e2e-creds.json` 注入（gitignore）。
- [ ] 商户备注注入样本 → Trust Console 显示 `TAINT BLOCKED`
- [ ] 重复提交同一转账 → `REPLAY BLOCKED` 且返回原结果
- [ ] GA4 实时收到 page_view（接受全部后）
- [ ] `npx wrangler tail` 无未捕获异常

## 16. macOS 客户端（Suveoo for macOS，Electron 44）

源码 `backend/macos/`（整目录复制自 `backend/windows/` + 8 处平台适配：Touch ID/DMG 安装语义/open-url 深链/mac 最小菜单/dock 角标/Cmd+← 返回/tray 单击/`macos` 平台串）；构建与发布一键化：`npm run release`（`--dry` 只构建不上传）。构建环境：macOS 11+ x64 + Node 22 LTS（**wrangler 4 要求 ≥22**）+ Xcode（codesign/hdiutil/iconutil/sips）。**构建盘必须是本地 APFS**（vmhgfs 共享目录上签名/DMG 不可靠）。

### 16.1 首次环境
`npm install`（.npmrc 已配 npmmirror，electron 二进制走镜像）→ `bash scripts/make-icns.sh`（favicon-1024 → iconset → `iconutil -c icns`，纯系统工具）。Electron postinstall 若被 npm 安全机制拦截：`npm install-scripts approve electron && npm rebuild electron`。

### 16.2 构建（三段式，mac 版）
① `npx electron-builder --mac dir` 解包 → ② `codesign --force --deep -s - dist/mac/Suveoo.app` **ad-hoc 签名** + `codesign --verify` 自验（electron-builder 25 对 `mac.identity:"-"` 会误查证书名而跳过签名——ad-hoc 必须手动做，发布脚本已封装且签名失败即中止）→ ③ `npx electron-builder --mac dmg zip --prepackaged dist/mac` 出 DMG（拖装）+ zip（脚本党）。产物约 158 MB（extraResources 裁剪同 Windows：cards-front 源图 + .mimosa）。

### 16.3 发布（R2 铁律 --remote）
`node scripts/release.mjs`：三段构建 → sha256 → 上传 DMG/zip → 更新 `/dl/macos-manifest.json`（字段 versionName/versionCode/minVersionCode/url(DMG)/sha256/sizeBytes/zipUrl/zipSha256；versionCode=major×1e6+minor×1e3+patch，3.183.0=3183000）。**强制更新**＝minVersionCode 抬线；回滚＝manifest 改回旧值。客户端「安装」＝`shell.openPath(DMG)` 挂载后拖入 Applications（与 Android 唤起系统安装器同语义）。

### 16.4 服务端配套（一次性）
Worker 壳源白名单 `SHELL_ORIGINS` 已含 `suveoo-app://local`（与 Windows 壳同 origin，零服务端改动）；`/download` 页读 macos-manifest 渲染 macOS 卡片（前端 mac 卡要求 manifest 含非空 sha256 才显示）。

### 16.5 Gatekeeper（未公证分发指引）
无 Apple 开发者账号 → ad-hoc 签名 + 不公证：用户首次打开若提示「无法验证开发者/已损坏」，右键 Suveoo →「打开」（Sonoma 有效），或 `xattr -d com.apple.quarantine /Applications/Suveoo.app`。/download 页与 i18n `dl.macNote` 已写明。VM 内自测：`xattr -cr dist/mac/Suveoo.app` 清理后启动。

### 16.6 测试
`npm test`（vitest 42：29 继承 + mac 平台 13——返回键映射/DMG 候选/深链归一）｜`npx electron . --smoke`（78 路由冒烟，打包态自动写 userData）｜`--shot=<url> --size=WxH --out` 排版截图（打包态自动改落 userData——Windows 轮遗留项的 mac 正解）｜`--e2e=<suite>` 实机 E2E（同 Windows 十套件）｜`scripts/probe-m2.js --stage=bio|notify|ext|upd` 功能探针（不进打包产物）。深链：开发态用 argv（冷启）/二实例 argv（热启）；`open "suveoo://…"`（LaunchServices/open-url 事件）仅打包态可用。
