# Suveoo macOS 客户端开发策划（v1.0）

日期：2026-10-07 ｜ 作者：ZCode（macOS 侧） ｜ 状态：**M1+M2 已完成（2026-10-07，第一百五十四/五十五轮）——冒烟 78/78、单测 42/42、S3-S10 逐项实测过（含提前跑通的 4 个 E2E 套件：tray-persist/deeplink/update-ask/update-force）；下一步 M3 打包分发（wrangler 已登录）**
口号：**不注册任何新平台、不改一行 Worker 代码、frontend 仅两处三端兼容的常规迭代，交付与 Windows 客户端功能/界面 100% 对齐的 Suveoo for macOS。**

---

## 0. 结论摘要

**AI Agent 可在队长提供的这台 macOS 虚拟机上独立完成 macOS 客户端开发。** 技术路线推荐 **Electron darwin 复用**——`backend/windows/` 九成代码平台无关，新建 `backend/macos/` 整目录复制后做 mac 适配（**复制而非抽公共层**：Windows 线已上线在生产，重构共享层会引入回归风险；待双端稳定后可作为后续优化再抽）。

环境自查全项通过（详见 §1），两处已自行补齐：Node 20 LTS 已装（官方 tarball → `~/opt`，免 sudo）、仓库已从 vmhgfs 共享目录同步到本地 APFS 工作副本 `~/suveoo`（共享目录原件保持只读参照；**vmhgfs 上做 Electron 构建/签名/DMG 不可靠**——xattr、符号链接、执行位均无保障）。

队长需要配合/拍板的事项：**必须 2 项**（M3 前 `npx wrangler login` 一次 OAuth；版本号起点确认）+ **待拍板 3 项**（红钮语义 / 更新安装语义 / 系统要求文案）——详见 §11。

---

## 1. 环境自查报告（2026-10-07 实测，§2 清单全项）

| 项 | 结果 | 判定 |
|---|---|---|
| macOS 版本 | **14.8.9**（Sonoma，Build 23J631） | ✅ 与预期一致 |
| CPU 架构 | **x86_64**（11th Gen Intel i5-11400H @ 2.70GHz） | ✅ 如预期非 arm64；打包 x86_64 先行 |
| 核数/内存 | 6 核 / 14.3GB | ✅ 足够（Windows 同规格笔记本构建无压力） |
| 磁盘 | APFS 容器 100Gi，**可用 49Gi**（Data 卷已用 38Gi） | ✅ 超出 15GB 要求 3 倍 |
| Node/npm | 原缺失 → **已装 v20.20.2 LTS + npm 10.8.2**（官方 tarball，`~/opt/node-v20.20.2`，PATH 已入 `~/.zshrc`） | ✅ 已解决（LTS ≥20，避开 Node 24 new Function 坑） |
| Xcode | **完整 Xcode.app 在位**（`/Applications/Xcode.app`，`xcode-select -p` 已指向）；`codesign`/`hdiutil`/`iconutil` 全可用 | ✅ 超出预期（CLT 即够，这里直接有完整版） |
| 生产 API | `curl -sI https://suveoo.com/api/health` → **HTTP/2 200**（HKG 节点） | ✅ VM 走宿主 NAT + sing-box 可达 |
| 仓库 | 完整拷贝在 vmhgfs 共享挂载；`.git`/`frontend`/`backend/windows/e2e-creds.json` **全部在位**（§10.5 补拷项不需要） | ✅ |
| brew | 无 | ➖ 不需要（不装，保持系统干净） |
| node_modules | 已抽样确认是 **Windows 二进制**（`@esbuild/win32-x64`、`.bin` 下 `.cmd`/`.ps1` shim） | ⚠️ M1 首步：本地副本全部删重装（`npm install` + `npm install-scripts approve electron`，镜像配 npmmirror） |
| wrangler 登录态 | 未登录（登录态不随仓库迁移） | ⚠️ M3 发布前需队长完成一次 `npx wrangler login` |

**工作区布局决策（已执行）**：构建/开发全部在本地 APFS 副本 `/Users/yuzhouxie/suveoo`（rsync 排除 node_modules，4.4G）；共享目录 `/Volumes/VMware Shared Folders/suveoo` 作为与队长的交换面——每轮交付后把改动文件同步回去。两处 `.git` 同源，git 操作只做本地 status/diff，**不 push**（队长主导）。

---

## 2. 可复用资产盘点（均已在本轮核实）

| 资产 | 位置 | mac 复用方式 |
|---|---|---|
| Windows 客户端全套源码（9 模块 + bridge + tests + release 脚本，~2200 行） | `backend/windows/` | **整目录复制** → `backend/macos/`，按 §4.3 差异表适配 |
| `SHELL_ORIGINS` 已含 `suveoo-app://local` | `backend/worker-main.js:7876`（已部署生效） | **沿用同 scheme+host → Worker 零改动**（重大利好，v3.182.1 轮已把该 origin 加白） |
| 前端 api.js 双层 base | `frontend/assets/js/core/api.js:5` | 非 suveoo.com 源自动切 `https://suveoo.com`——零改动 |
| 76 页零构建 MPA | `frontend/`（276MB，其中 cards-front 源图 236MB） | extraResources 同款 filter 裁剪（`!assets/images/cards-front/**/*.{jpg,svg}` + `!.mimosa/**`） |
| 图标源 1024×1024 | `frontend/favicon/favicon-1024x1024.png` | `iconutil` 生成 `icon.icns`（mac 自带工具链，无需 Python） |
| Windows manifest 分发模式 | R2 `/dl/windows-manifest.json` + `/download` 卡 | mac 镜像：`/dl/macos-manifest.json` + 第三张平台卡 |
| E2E 架构（页面侧 driver + 主进程协调器） | `backend/windows/bridge/e2e-driver.js` + `main/e2e.js` | 10 套件移植；OTP 文件通道 `/__win/e2e-otp.txt` 原样保留（内部路径名不改，保零 diff） |
| vitest 决策矩阵三件套 | `backend/windows/tests/`（29 用例） | 复制 + 补 mac 专属用例（DMG 候选/深链 open-url/返回键映射） |
| 测试账户四件套 | 记忆 `suveoo-test-accounts-env.md`（demo 无 2FA；XYZ/LYT/HSR 有） | E2E 主力 demo（无 2FA）+ XYZ（红级 2FA，Gmail u/1 取码） |

---

## 3. 技术选型

| 方案 | 优势 | 劣势 | 结论 |
|---|---|---|---|
| **Electron darwin 复用**（推荐） | `backend/windows/` 九成代码直接跑（preload/protocol/ipc/navigation/update/smoke 全平台无关）；与 Web 端渲染 100% 一致；**同一份 shell-update.js 注入体系零适配**；无新语言新工具链；Windows 线的全部血泪经验（Proxy 坑/冒烟引擎/更新白名单）直接继承 | 包体 ~140-150MB、常驻内存 ~250MB；VM 渲染性能待验 | **推荐** |
| Tauri 2（Rust） | 包体 ~15MB、内存小 | 五能力（更新/通知/Touch ID/内嵌浏览器/深链）全部 Rust 重写；WKWebView 与 Chromium 行为差异需回归 76 页；Rust 工具链全新引入 | 不选（工作量 ≈ Windows 线重来一遍） |
| 原生 Swift/SwiftUI | 体验最好、包最小 | 76 页 MPA 要全部重写为原生界面，工作量 ×5；三端界面 100% 对齐的验收口径直接不可达 | 不选（与"功能界面 100% 对齐 Web"目标矛盾） |
| PWA 桌面安装（Chrome/Safari） | 零开发 | 无托盘/深链注册/Touch ID/三级更新/通知常驻 | 不选（Windows 轮已论证过同款结论） |

**复制 vs 抽公共层的决策**：选**复制**（`backend/macos/` 独立目录）。理由：① Windows 线 3.181.1 已在生产跑，任何结构重构都有回归风险且需重发布；② 两目录间 diff 清晰、各自发布节奏独立；③ 真正的 mac 差异集中在 5-6 个文件（见 §4.3），共享收益小。代价：未来同步修 bug 要改两处——文档里维护一张「双端同源文件清单」，凡纯注释级差异文件（protocol/preload/ipc 等）改一处必同步另一处。待双端都稳定后，队长若愿意可再合并（届时属重构任务，另行评估）。

---

## 4. 系统架构

### 4.1 目录结构

```
backend/macos/                      # 整体复制自 backend/windows/，逐文件按下表适配
├── package.json                    # name=suveoo-macos；build.mac（dmg+zip, x64, identity="-"）；build.protocols=[suveoo]
├── .npmrc                          # ELECTRON_MIRROR + electron-builder binaries 镜像（npmmirror）
├── main/
│   ├── main.js                     # +open-url 深链（will-finish-launching 起挂）；Menu 改 mac 最小菜单；返回键 Cmd+←/[ 
│   ├── protocol.js                 # manifest 重写目标改 /dl/macos-manifest.json；其余原样
│   ├── navigation.js               # 原样（逻辑平台无关）
│   ├── ipc.js                      # 原样
│   ├── update.js                   # install() 语义改 mac：候选 .dmg → shell.openPath 挂载 DMG（拖装语义，见 §8）
│   ├── notify.js                   # Electron Notification（mac 通知中心）+ dock badge；权限授权弹窗预期
│   ├── credential.js               # PowerShell/WinRT 全删 → systemPreferences.canPromptTouchID/promptTouchID；safeStorage(Keychain)
│   ├── tray.js                     # mac 菜单栏 Tray + template 图标（16/32 点，黑白模板）
│   ├── external-browser.js         # 原样；工具条红绿灯左侧留白适配（bridge/toolbar.html CSS）
│   ├── smoke.js / qa-shot.js / e2e.js  # 原样（冒烟引擎是 M1 验收核心）
├── preload.js                      # getPlatform()→"macos"、suveooBridge.platform→"macos"；显式方法对象原样（Proxy 禁律）
├── bridge/                         # toolbar.html（+mac 左侧留白）+ e2e-driver.js 原样
├── build/icon.icns                 # iconutil 由 favicon-1024 生成（scripts/make-icns.sh）
├── scripts/release.mjs             # 改 mac 目标：两段构建（无 rcedit 环节）→ sha256 → R2（--remote 铁律）→ macos-manifest
└── tests/                          # 三件套复制 + mac 决策矩阵补充用例
```

### 4.2 资源与网络模型（与 Windows 完全同构）

本地壳只承载静态资产：`suveoo-app://local` 协议映射 frontend 快照（asar 内 `resources/frontend`）；一切业务请求直发 `https://suveoo.com`（api.js 双层 base 自动切换）。**origin 与 Windows 壳完全相同**（`suveoo-app://local`）→ Worker CORS/SHELL_ORIGINS 零改动。

### 4.3 Windows → macOS 差异清单（本策划的核心工程判断，共 8 处代码级差异）

| # | 模块 | Windows 现状 | mac 适配 | 风险 |
|---|---|---|---|---|
| 1 | credential.js | PowerShell WinRT UserConsentVerifier + DPAPI | `systemPreferences.canPromptTouchID()/promptTouchID()`（Electron 原生 API，无子进程）；safeStorage 自动走 Keychain。**VM 无 Touch ID 传感器 → canPromptTouchID=false → isAvailable.strong=false → 前端自动回落密码/OTP，语义正确**（与无 Hello 的 Windows 同口径）；真机上原生可用 | 低（API 直换） |
| 2 | update.js install() | shell.openPath(.exe) 唤起 NSIS | 候选 `.dmg` → shell.openPath 挂载 DMG，用户拖入 /Applications 完成（=Android「唤起系统安装器、按屏幕提示完成」同语义；详见 §8 待拍板项） | 低 |
| 3 | main.js 深链 | second-instance argv | `app.on("open-url", …)` + `will-finish-launching`（ready 前到达的深链先存 pending，窗口建好再路由）；Info.plist CFBundleURLTypes 由 electron-builder `protocols` 配置注入；second-instance 钩子保留（`open` 唤起时 mac 也可能走 argv，双保险） | 中：打包后必须实测 `open "suveoo://account/cards"` |
| 4 | main.js 菜单 | `Menu.setApplicationMenu(null)` | mac 保留**最小菜单**（App 名菜单：关于/退出；Edit：复制/粘贴/全选——**mac 的 Cmd+C/V 快捷键依赖 Edit 菜单存在**，清空菜单会废掉文本编辑） | 低 |
| 5 | main.js 返回键 | Alt+←/→ | Cmd+←/→ + Cmd+[ ]（mac 惯例），Alt 分支保留（外接 Win 键盘） | 低 |
| 6 | tray.js | favicon png 直接用 | 生成 16/32pt **template image**（黑白 + `setTemplateImage`，随深浅菜单栏自适应）；dock 图标常驻（红钮语义联动，见待拍板） | 低 |
| 7 | notify.js | Toast + AUMID | Electron `Notification`（通知中心）+ `app.dock.setBadge()` 未读角标；首次触发系统授权弹窗（预期行为，授权前 `checkPermissions` 返回 denied——shim 语义不变）；E2E 断言走事件回流不看视觉 | 中：VM 通知中心行为待实测 |
| 8 | bridge/toolbar.html | 工具条按钮右侧布局 | mac 子窗红绿灯在**左**：内嵌浏览器工具条加 darwin 左侧留白（`process.platform==="darwin"` 时 padding-left ≈ 70px），关闭钮移右侧 | 低 |

**GPU 策略**：复用 Windows 的默认 `disable-gpu` + `--enable-gpu` 逃生口起步（VMware SVGA 3D 加速不可靠，前任预判）。M1 冒烟时对照两种模式的渲染正确性（字体/布局），若禁用 GPU 无副作用则固化默认值；真实 Mac 上可默认开。**close 语义**：见待拍板项①。

### 4.4 前端改动（两处，均为三端兼容的常规迭代）

1. `/download` 第三张平台卡（M3）：镜像 Windows 卡结构（版本 chip/大小/日期/SHA-256/主次按钮=安装版 DMG+zip 版/未签名指引）；i18n 新键 `dl.mac*` + `dl.mstep1-3` ×4 文件（键恒等律）；hero 副标题「双端」→「三端」文案核对；download.js 拉 `/dl/macos-manifest.json`。**Android/Windows 区零影响是验收项**。
2. `download.js:111` APK 原生流守卫：现值 `getPlatform() !== "windows"` 需扩为同时排除 `"macos"`——否则 mac 壳内点 Android 下载钮会误入 APK 原生安装流（Update.download 下载 36MB APK 后无法安装）。**一行改动，只对 mac 平台串生效**，Web/Android/Windows 行为逐字节不变。

---

## 5. 功能矩阵：五能力 → macOS 实现 → 验收标准

| # | 能力 | macOS 实现 | 验收标准 |
|---|---|---|---|
| 1 | 本地资产秒开 | `suveoo-app://local` 协议 + asar 快照（与 Windows 同款，注入 shell-update.js/biometric-shell.js，manifest 路径重写 `/dl/apk-`→`/dl/macos-`、download 附 sha256） | 冷启动出首屏 ≤3s（VM 放宽）；断网可开壳进离线态 |
| 2 | 三级自动更新 | 主进程白名单下载（https+suveoo.com 系、拒环回/私网）+ sha256 + 打开 DMG（§8）；决策复用 decideAction 纯函数 + 前端 shell-update.js 全套 UI（强制层/贪睡/进度） | R2 测试 manifest 三级全路径实测；sha256 不符拒交付；降级不误更 |
| 3 | 通知 | Electron Notification（通知中心）+ 点击 cap:event 回推 `localNotificationActionPerformed` + **dock badge** 未读角标（替代 Windows 托盘 tooltip）+ getSyncState 基线 | 五类通知到达；点击路由正确；角标增减正确；关窗驻留仍收 |
| 4 | 生物识别四场景 | Touch ID（systemPreferences.promptTouchID）+ safeStorage(Keychain) 落盘 credential.bin；四场景语义与 Android/Windows 完全对齐（取消=AUTH_CANCEL、verify 异常=放行） | VM：isAvailable.strong=false → 前端回落密码/OTP 路径实测通过；E2E 用 SVEOO_E2E_BIO_OK 旁路（真实 Touch ID 路径留待队长真机验证） |
| 5 | 外链内嵌浏览器 | 单例 BrowserView 子窗 + 自有协议工具条（左留白适配）+ 跳回 suveoo.com 自动归主窗 | 站内 76 页互链不出壳；外域 100% 进子窗；子窗关/开/回归主窗全过 |
| 6 | 托盘 + 深链 | mac 菜单栏 Tray（template 图标）+ dock 常驻 + `suveoo://` Info.plist 注册 + open-url 事件 | `open "suveoo://account/cards"` 直达路由（冷启/运行中两态）；托盘点击唤起/退出 |

---

## 6. 安全设计（继承 Windows 全部铁律 + mac 特有两项）

1. `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`；preload 显式方法对象，**绝不用 Proxy**（contextBridge 克隆摊平坑）。
2. 导航锁/更新 URL 白名单/IPC schema 校验/外链 host 复核：原样复用（纯函数，已 29 用例覆盖）。
3. 凭据经 safeStorage（Keychain）加密；卸载 .app 后 `~/Library/Application Support/Suveoo` 保留（与 Windows 保留 %APPDATA% 同语义，S15 验证）。
4. **Gatekeeper（mac 特有）**：无 Apple 开发者账号 → **ad-hoc 签名**（electron-builder `mac.identity:"-"`，本地可跑）+ **不公证**（notarization 需 $99/年账号，不做）。分发页写明首启指引：Sonoma 右键→打开，或 `xattr -d com.apple.quarantine /Applications/Suveoo.app`（VM 自测用 `xattr -cr` 清理后启动）。指引文案在 S12 实测后定稿。
5. **Mimosa 合规约束继承**：无 child_process 执行变量路径、无 executeJavaScript 模板字符串、E2E 驱动走页面世界常驻 driver + console `__e2e:` 通道——照抄 Windows 实现即可。

---

## 7. 构建与分发

- **打包**：`electron-builder --mac dmg zip`（x64 先行；arm64/universal 留待队长有真 Mac 再加目标）。产物 `suveoo-setup-{v}.dmg`（electron-builder mac artifactName 惯例 `suveoo-{v}-mac.dmg`，命名对齐现有 `/dl/` 风格）+ `suveoo-macos-{v}.zip`（脚本党/未来自动更新用）。
- **DMG 布局**：electron-builder 默认 `app → Applications` 符号链接拖装（dmg 配置项默认即含）。
- **图标**：`scripts/make-icns.sh`——favicon-1024 → iconset（16/32/64/128/256/512/1024 含 @2x）→ `iconutil -c icns`（纯系统工具）。
- **签名**：`mac.identity: "-"`（ad-hoc）；DMG 本身不签名（无证书，跳过）。
- **extraResources**：与 Windows 完全同款 filter（cards-front 源图 + .mimosa 剔除）——预期包体与 Windows 136MB 同量级。
- **release.mjs 改造**：图标 → `--mac dmg zip` 两段构建 → sha256 → wrangler r2 put（**必带 --remote**）→ manifest 更新（保留线上 minVersionCode）。比 Windows 少 rcedit 环节（mac 元数据经 electron-builder extendInfo/protocols 配置注入，无 winCodeSign 类的坑——理论上更简单）。
- **/download 第三卡**：见 §4.4；三断点（1280/820/390）回归用壳 `--shot` 模式实截（qa-shot 打包态写 userData 的修复一并带上——Windows 轮遗留低优先项，mac 版直接写对）。

## 8. 更新源设计

- R2：`/dl/macos-manifest.json` + `/dl/suveoo-setup-{v}.dmg` + `/dl/suveoo-macos-{v}.zip`。
- schema（对齐 windows-manifest 字段面）：`{ versionName, versionCode, minVersionCode, url(=DMG), file, sizeBytes, sha256, zipUrl, zipSha256, releasedAt, notes }`。
- 安装语义（**待拍板项②**，推荐 A）：
  - **A（推荐）**：`Update.install()` → shell.openPath(DMG) 挂载 + 打开 Finder 窗口 → 用户拖入 /Applications 覆盖 → 重开应用。与 Android「唤起系统安装器」/Windows「唤起 NSIS」同语义，零解压代码、零权限问题；前端 shell-update.js 文案「按屏幕提示完成安装」通用适配。
  - B：下载 zip → 自动解压替换 /Applications/Suveoo.app → 重启。全自动但需引入解压（ditto/child_process 或 ADM-ZIP）+ 替换正在运行的 .app 的边界问题（需先退出自身）——复杂度高、Mimosa 拦截面大，不推荐首发做，可作后续增强。
- 客户端检查节奏与 Windows 同：启动 + 每 6h（shell-update.js 内建）。

---

## 9. 测试与验收（15 项验收门）

**单测（vitest，`backend/macos/tests/`）**：Windows 三件套 29 用例全保留（决策矩阵/URL 白名单/导航分类/IPC schema）+ mac 补充：DMG 候选选择、深链 open-url 归一、返回键 darwin 映射 ≥9 新用例。

**验收门（镜像 Windows S1-S15 口径）**：

| # | 门 | 判据 |
|---|---|---|
| S1 | 开发态冒烟 | 78/78 路由全绿、零控制台报错（每路由全新隐藏窗 + 对话框剥离注入） |
| S2 | GUI 实机启动 | 登录页渲染截图、无更新弹窗、无 `[upd] guard fail` 红标、dock/菜单栏图标在位 |
| S3 | 单测全绿 | vitest ≥38 用例（29 继承 + mac 补充）全过 |
| S4 | 三级更新 | R2 测试 manifest 实放：ask 弹窗/force 全屏阻断/latest 静默 三路径 + 还原 |
| S5 | 更新安全 | sha256 不符拒绝交付；URL 白名单外拒连 |
| S6 | 通知 | 到达 + 点击回推路由 + dock badge 增减（事件断言） |
| S7 | Touch ID 回落 | VM 无传感器：isAvailable=false → 前端回落密码/OTP 实测；E2E BIO_OK 旁路路径可用 |
| S8 | 内嵌浏览器 | 外链子窗 + 工具条（mac 左留白）+ 跳回归主窗 |
| S9 | 深链 | `open "suveoo://account/cards"` 冷启/运行中两态直达；二级深链 `/ai/s/{id}` 同测 |
| S10 | 托盘驻留 | 关窗驻留（语义按拍板①）、菜单栏图标点击唤起、退出项 |
| S11 | 打包态冒烟 | DMG 拖装到 /Applications 后 78/78 |
| S12 | Gatekeeper | ad-hoc 签名验证（codesign -v）；带 quarantine 模拟（xattr 置位）按指引可启动；实测定稿 /download 指引文案 |
| S13 | 发布链 | release.mjs 全绿：R2 工件 200、manifest 全字段、/download 第三卡三语三断点实截、Android/Windows 区零影响 |
| S14 | E2E 10 套件 | demo-login / i18n-switch / external-browser / tray-persist / deeplink / update-ask / update-force / offline-resilience / transfer-yellow / transfer-red-xyz 全 PASS（生产实测；登录 429 限流冷却纪律照守） |
| S15 | 安装残留链 | DMG 拖装 → 删除 .app → 检查 `~/Library/Application Support/Suveoo`（应保留，用户数据语义）+ `~/Library/Caches` + `~/Library/Preferences` 残留清单落档 |

**验收门 = 15/15 + 单测全绿 + Web/Android/Windows 零回归（前端仅 /download 增量 + 一行守卫）。**

---

## 10. 里程碑（每轮完整交付：改码→部署/构建→实机实测→文档→证据）

| 轮 | 里程碑 | 内容 | 退出判据 |
|---|---|---|---|
| M1 | 骨架跑通 | 本地副本 npm install（含 electron approve）；backend/macos/ 复制 + §4.3 差异适配（credential/update/深链/菜单/返回键/tray/notify/toolbar 八项）；`npx electron .` GUI 实机 | S1 + S2（冒烟 78/78 + GUI 截图） |
| M2 | 五能力对齐 | IPC 插件四件全通（Update 下载校验/Notification/dock badge/Touch ID 回落/BrowserView）；R2 初始 macos-manifest 部署（vc=当前 → "已是最新"实测） | S3-S10 逐项自测过 |
| M3 | 打包分发 | make-icns / electron-builder dmg+zip / ad-hoc / release.mjs 上 R2 / /download 第三卡（i18n ×4 + 三断点 + 双端零影响）/ DEPLOYMENT §16 + README 回填 | S11-S13（**进 M3 前队长完成 wrangler login**） |
| M4 | 实测打磨 | E2E 10 套件移植（OTP 取码需本机浏览器 Gmail 登录，凭据见记忆，M4 前完成）+ S15 残留链 + changelog §15 落档 + memory 更新 | 验收门 15/15 |

---

## 11. 队长配合清单

### 必须（2 项）
1. **`npx wrangler login`**：M3 发布前在 Mac 上完成一次浏览器 OAuth（本地 `~/suveoo/backend` 下执行；不阻塞 M1/M2）。
2. **版本号起点拍板**：提案 **3.183.0**（versionCode 3183000）——理由：changelog 流停在 v3.182.3，macOS 客户端是下一个 minor 的交付主体；与 Windows（3.181.1）同一 semver 流各自演进，未来多端同 tag Release 时各端独立版本（Android 2.66 届时并入同流）。

### 待拍板（3 项，均已在 §4.3/§8 给推荐）
3. **红钮语义**：A（推荐）close→hide 驻留（与 Windows/Android 一致：菜单栏图标 + dock 常驻，点 dock/托盘图标唤回）；B close→退出（mac 惯例，通知驻留随之取消）。
4. **更新安装语义**：A（推荐）打开 DMG 拖装；B zip 自动替换（详见 §8）。
5. **系统要求文案**：推荐「macOS 11 及以上（Intel x64）」——Electron 33 起最低 macOS 11.0，44.x 同底线；本机 14.8 实测。若想保守写 12+ 亦可。

### 无需（明确清单）
- 无需 Apple 开发者账号（不上 App Store、不公证；ad-hoc 签名 + Gatekeeper 指引覆盖）。
- 无需 Xcode CLT 安装动作（完整 Xcode 已在位，已核实）。
- 无需补拷 e2e-creds.json（已在仓库副本中）。
- 无需新增 Worker 接口/环境变量/密钥（SHELL_ORIGINS 已含 suveoo-app://local）。
- GitHub Release 仍由队长统一多端同 tag 发（macOS 完成后）——我绝不创建。

---

## 12. 风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| Electron darwin 二进制/构建组件下载慢或被墙 | 中 | .npmrc 预配 ELECTRON_MIRROR + ELECTRON_BUILDER_BINARIES_MIRROR（npmmirror，Windows 轮验证过同款镜像）；失败再走宿主代理 |
| VM 渲染异常（disable-gpu 下字体/模糊、或开 GPU 崩溃） | 中 | M1 双模式对照实测后固化默认值；VMware SVGA 无 3D 加速预期禁 GPU 更稳 |
| VM 通知中心不可用/授权弹窗不出现 | 中 | E2E 断言走事件回流不看视觉；授权 denied 时 shim 语义不变（通知静默丢但不崩）；真机验证归队长 |
| 打包后 Gatekeeper 拦截无法自测 | 高（确定性） | VM 内 `xattr -cr` 清 quarantine 自测；S12 把用户侧指引实测定稿 |
| 2FA 取码：本机浏览器无 Gmail 登录态（Windows 宿主的 IAB 登录不随迁） | 高 | M4 前用记忆凭据在本机 browser-use 完成 Gmail u/1 登录（谢宇洲主力）；E2E 主力改 demo 账户（无 2FA）降低依赖；登录 429 冷却纪律照守 |
| 登录 429 限流阻断 E2E | 中 | demo 主力 + 失败不硬刷换账户（Windows 轮教训） |
| vmhgfs 共享目录误用于构建 | 低 | 已建本地 APFS 工作副本并写入本策划；构建脚本全部相对路径在 ~/suveoo 下执行 |
| electron-builder mac 侧新坑（对比 winCodeSign） | 未知 | M3 首跑 `--dir` 分段验证（无 rcedit 环节理论上更简单）；出坑按 Windows 轮「三段式」思路拆段定位 |
| 双目录漂移（backend/windows 与 backend/macos 同源文件不同步） | 中 | 维护「双端同源文件清单」（§4.1 注释级差异文件：protocol/preload/ipc/navigation/smoke/qa-shot/e2e-driver）；跨端修复必同步并各自重发布（**源码已修 ≠ 工件已换**——3.181.0 事故铁律） |

---

## 13. 附录

- **依赖清单**：electron ^44.5.1、electron-builder ^25.1.8、vitest ^4.1.11（与 Windows 完全同版本——行为一致性优先）；零运行时 npm 依赖进渲染层。
- **版本号关系**：macOS 3.183.0 起（提案）/ Windows 3.181.1（在产）/ Android 2.66（独立流）——semverToCode = major×1e6 + minor×1e3 + patch。
- **文档交付**：README 平台段 + DEPLOYMENT §16（macOS 构建发布手册）+ 本策划随进度更新状态 + changelog §15 每轮一条（含根因分析）+ 证据入 e2e-artifacts（gitignore）。
- **工作区**：本地正本 `~/suveoo`（构建/开发/git status）；共享目录 `/Volumes/VMware Shared Folders/suveoo`（每轮交付同步 + 队长取阅面）。
- **记忆内化**：前身 65 个记忆文件已复制到 `~/.zcode/cli/memories/suveoo/`，后续轮次免重读全量。
