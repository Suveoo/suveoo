# /ai/benchmark 页面改造计划（SuveooBench v2）

日期：2026-10-28 ｜ 状态：**已实施并上线（2026-10-28，worker 88233782 / 前端 b353；changelog v3.198）**
执行输入（队长 2026-10-28 提供）：DeepSeek 接入 2026-10-22 16:33；Kimi 延迟实测 25.0s/35.0s；production.bench 引用消融期数据；仓库已 Public；暂不发新客户端。
执行调整（相对本计划的偏差）：① JSON fetch 未加 ?v=（api.json 已 cache:no-store + SW network-first，加参数无法隔离旧 JS——改用两阶段部署防窗口毛刺）；② 指标表数字实核后 S6 采用 README 口径 14/14（板块一 PHASE_SUMMARY 同）；③ vitest 当前实跑 473（v3.197 起），数据集四格用 473、消融矩阵保留 463（历史事实）；④ 部署中撞「同版本改内容」HTTP 缓存坑，按 b198 先例跳版 b352/b353。
**遗留待裁决：视频 Scene10 的 S6 写 66/66，与 README/代码证据 14/14（16 intent/14 断言）不一致。**
触发：Claude Haiku 4.5 / GPT 确认从未接入（最早占位数据）；生产模型已切 deepseek-v4.1-flash；四模型消融终版（2026-10-06）未上页面。

---

## 0. 两个直答

| 问题 | 答案 |
|---|---|
| 是否需要更新 Android / Windows / macOS 客户端？ | **本次页面修复本身不需要任何客户端发包**。三端都打包 frontend 静态快照（Android=Capacitor `https://localhost` 本地资产；Windows/macOS=Electron `suveoo-app://` 快照），Web 修复随部署即时生效，SW 对 HTML/JS/JSON/i18n 走 network-first 无需 bump。但 App 内的看板会停留在 3.186.0 快照（旧数据、旧配色），**建议 Web 验收后例行重打 Android APK（本机）+ Windows NSIS（本机）**；是否跟进由你定时间。 |
| 是否需要到 VMware 虚拟 Mac 里生成文件？ | **仅当决定更新 macOS 客户端时才需要**（VM 构建 → 上传 R2 → GitHub Release 由你发布的既有闭环）。页面改造、Web 部署、Android/Windows 重包全部不需要进 VM。 |

---

## 1. 改造原则（三条铁律）

1. **绝不编造**：没有实测出处的数字一律不上页面。Claude/GPT 占位行、无证据的 Baseline 列、512/60/48 数据集口径（出处不可考）全部清除或替换为有证据的口径。
2. **视频↔页面同源**：页面展示的指标 = README 十二指标表 = 视频 Scene10/Scene11 = `docs/benchmarks/` 证据库。评委从视频 QR 扫到页面，交叉验证必须全对上。
3. **降级不炸**：新 JS 必须能渲染旧 JSON（客户端快照过渡期），部署窗口内新旧资产不得出现崩版或矛盾渲染。

## 2. 现状问题清单（改造动因，已核实）

| 级别 | 问题 | 位置 |
|---|---|---|
| P0 | 生产已切 DeepSeek（`wrangler.toml:69` + `/api/version` 实测），页面 `production.note` 原文渲染「当前生产模型 GLM-5.3-Flash…」与徽标同页矛盾 | benchmark.json production.note |
| P0 | 徽标把 GLM 的 `since: 2026-09-20` 拼在 deepseek-flash 后（接入日期张冠李戴） | ai-benchmark.js:23 |
| P0 | `production.bench`（18.2s/74.7s，2026-09-21 GLM 实测）渲染在 DeepSeek 徽标下 | ai-benchmark.js:30-31 |
| P0 | 指标表配色 `ours<=baseline?绿:红` 对 5 项「越高越好」指标全部反色（Task Success 91% 等标红） | ai-benchmark.js:28 |
| P1 | 消融图四条中 **Claude Haiku 4.5 / GPT 为从未接入的占位行**（baseline 数字无实测出处） | benchmark.json ablation[0..1] |
| P1 | 四模型终版消融（GLM/Qwen3.8/DeepSeek/Kimi，2026-10-06，全指标 100% 一致）未上页面；与视频 Scene11 模型名单对不上 | 同上 |
| P1 | JSON 三层口径互斥：dataset.note「双模型」/ note「三模型」/ production.note「GLM 待跑」 | benchmark.json |
| P2 | `bench.mScopeBody`「三个模型族」vs 图上 4 条 | i18n ×4 |
| P2 | SITE_PAGES 词条「12 项指标卡网格」（实际 11）、「Claude/Qwen/GPT 三组历史对照」（实际 4）→ site_guide AI 回答不准 | worker-main.js:5503 |
| P2 | metrics 表 baseline 列与 ablation DeepSeek 行 0.062 同值、出处无文档；「准确率类 122 用例 100%」与表内 74–91% 表面冲突无解释 | benchmark.json |
| P2 | docs/test-cases.md「当前规模 463 用例」措辞过时（v3.196 已 469） | docs/test-cases.md |

## 3. 目标页面结构（五个区块）

```
SuveooBench 评测看板
├─ 头部：标题 + 模拟环境 banner（保留）+ 生产模型徽标（改造）
├─ A 指标实测（九项 S/B + 性能 P1–P4）        ← 替换现 11 项 Baseline vs Ours 表
├─ B 四模型消融矩阵                            ← 替换现占位柱状图（核心新增）
├─ C 测试集规模（四格，真实口径）+ 方法四卡     ← 数据替换 + 文案改写
└─ D 证据与口径说明
```

### 3.A 指标实测（九项 + 性能）

数据源 = README 十二指标表 / `docs/benchmarks/{security,business,performance}/`（执行时逐行复核）：

| 指标 | 结果 | 附注 |
|---|---|---|
| S1 幻觉防护（数值一致性） | 24/24 | 18 自动 + 6 人工 |
| S2 幻觉防护（执行一致性） | 14/14 | 另 2 条篡改拒绝零假声明 |
| S3 提示注入防御 | 66/66 | 七族变体 v2 |
| S4 越权与授权伪造拦截 | 37/37 | 全部结构化 BLOCKED |
| S5 异常熔断正确性 | 9/9 | 写通道锁定/读通道可用 |
| S6 审计完整性 | 66/66 | user_audit 五字段账本（出处=README S6 表，执行时复核） |
| S7 数据隔离 | 32/32 | 零泄露 |
| B1 意图识别与风险分级 | 50/50 | 分级错 0 |
| B2 金额解析 | 30/30 | toCents 全对 |
| P3 工具调用延迟 | P50 159ms / P95 435ms | 33 样本 |
| P1/P2/P4 对话与全链路延迟 | 记录型 | 按模型分列（见 B/C） |

- 渲染：结果列全绿（100% 型）、延迟行中性藏蓝；**不再有 Baseline 列**。
- 每行可展开一行小字：方法 + 证据文件名（`docs/benchmarks/…`）。

### 3.B 四模型消融矩阵（核心新增）

数据源 = `docs/benchmarks/ablation/PHASE_SUMMARY.md` + `ablation-final-report.md`（README 316 行同源）：

| 维度 | GLM-5.3-Flash | Qwen3.8-Flash | DeepSeek V4.1 | Kimi K3 |
|---|---|---|---|---|
| vitest 全量 | 463/463 | 463/463 | 463/463 | 463/463 |
| S3 注入拦截 | 66/66 | 66/66 | 66/66 | 66/66 |
| S1 幻觉（自动） | 18/18 | 18/18 | 18/18 | 18/18 |
| S1 幻觉（人工） | 6/6 | 6/6 | 6/6 | 6/6 |
| B1 意图+分级 | 50/50 | 50/50 | 50/50 | 50/50 |
| TTFT P50 | 17.5s | 8.4s | 4.9s | ~25s（标注「约」或补测） |
| Total P50 | 31.5s | 28.0s | 6.8s | ~35s（同上） |

- 口径行（必须）：守卫全开、同套用例、2026-10-06、产物 `docs/benchmarks/ablation/`（8 份全量文本 JSON + CSV）。
- 结论行：`安全与业务正确性由 Runtime 架构保证，与底层 LLM 无关` + `换模型，不换安全边界`。
- **诚实披露**（替换原「Baseline 为关闭 Runtime 对照」表述）：未设守卫关闭对照臂（线上通道无此模式）；安全边界的一致性以跨模型同测证明，五闸在模型输出与账本之间串行拦截属架构属性。
- 模型名用等宽文字（不引入 Logo 资产管线；后续要 Logo 再按 alpha>128 包围盒规范化补）。

### 3.C 测试集规模（四格，真实口径）

替换未经证实的 512/60/48：`63 文件 / 463 用例（vitest，消融时点）`、`attack 66 断言`、`板块一实测 106 拦截断言 + 122 准确率用例`、`21 项指标全景`。方法四卡正文同步改写（数据集构成/攻击构成/对照口径/口径与局限）。

### 3.D 生产模型徽标（改造）

- 保留 `/api/version?r=` 实时优先。
- **新增守卫**：`live.model === d.production.model` 时才拼 `（{since} 接入）`；不一致时改显 `档案基线：{d.production.model}`，不再张冠李戴。
- `bench.prodBench` 行加模型名与日期：`生产模型实测（DeepSeek，{date}，{n} 条指令）：首 token 中位 {x}s · P95 {y}s · 成功 {n}/{n}`——**建议复跑 ai-bench（18 指令，DeepSeek 中位 ~6.8s/轮，全程约 5 分钟）取当前真数**；不复跑则引用消融期 P1/P2 并标注日期与来源。

## 4. 数据层：benchmark.json v2

```jsonc
{
  "generated_at": "<部署时 ISO+08:00>",
  "schema": 2,
  "metrics": [            // 九项 + P3；保留 name/baseline/ours 旧字段兼容旧快照 JS（baseline 填 null 时旧 JS 需容错——见 §5 守卫）
    { "id": "S1", "name": "幻觉防护（数值一致性）", "result": "24/24", "percent": 100,
      "better": "higher", "method": "…", "evidence": "docs/benchmarks/security/s1-*.json", "note": "…" }
  ],
  "ablation": [           // 四模型行；旧 baseline/ours 字段不再携带（接受一次性部署窗口毛刺，见 §8）
    { "model": "GLM-5.3-Flash", "rows": { "vitest": "463/463", "s3": "66/66", "s1_auto": "18/18",
      "s1_manual": "6/6", "b1": "50/50" }, "ttft_p50_s": 17.5, "total_p50_s": 31.5, "approx": false }
  ],
  "ablation_meta": { "date": "2026-10-06", "guards": "on", "artifacts": "docs/benchmarks/ablation/" },
  "suite": { "files": 63, "cases": 463, "attack_assertions": 66,
             "live_blocking": 106, "live_accuracy": 122, "metrics_total": 21 },
  "production": { "model": "deepseek-v4.1-flash", "since": "<你提供>",
                  "bench": { "cases": 18, "first_token_median_s": 0, "p95_s": 0, "passed": 18, "date": "", "source": "" },
                  "note": "…" },
  "note": "…"
}
```

兼容策略：新 JS 对每个新字段都有缺省渲染；旧快照客户端（3.186.0）自带旧 JS + 旧 JSON，整体自洽显示旧版（不炸、不混搭）。

## 5. 渲染层：ai-benchmark.js 改造点

1. JSON 请求加资产版本：`/assets/data/benchmark.json?r=` 取 HTML 上的 `?v=`（i18n.js 已有同款提取），杜绝部署窗口新旧配对。
2. 配色改为 `better` 字段驱动；`baseline` 缺失时 Ours 列一律中性绿/藏蓝，不再进三元比较（根治反色 bug）。
3. 徽标守卫（§3.D）。
4. A 区表格 + 行内证据小字；B 区矩阵表（7 行 × 4 模型列 + 一致性列）；C 区四格；方法四卡。
5. 旧字段容错：`d.metrics[].baseline === null`、`d.ablation[].rows` 缺失、`schema` 缺省按 v1 渲染旧布局——保证"新 JS + 旧 JSON"（客户端审阅场景、SW 残留）不炸。
6. 390px 移动端复检（矩阵表横向滚动或卡片化，沿用现 `table-wrap`）。

## 6. i18n 改造（×4 语言 + fallback）

改写：`bench.ablation`、`bench.mScopeBody`（去"三个模型族"）、`bench.mControlBody`（新对照口径）、`bench.dsNote`、`bench.prodBench`（加模型名/日期占位）。
新增：`bench.metricsLive`（A 区标题）、`bench.consistent`（一致性列）、`bench.artifacts`（证据行）、`bench.modelBaseline`（档案基线）、`bench.perf` 等（预估 +8~10 键 ×4）。
同步：`backend/tests/unit/batch-ops.test.js` 静态 import 四语言包，跑 vitest 看键数锁定断言是否需要更新（历史坑：键数 1531 → 变更后同步）。

## 7. worker 侧改造

1. `SITE_PAGES` `/ai/benchmark` 词条（worker-main.js:5503）重写：九项指标实测 + 四模型消融矩阵 + 生产模型徽标 + 真实口径数据集；跑 `backend/scripts/check-site-coverage.mjs` 确认 76 页双向差集仍为 0。
2. `/api/version` 不动（已返回 model/profile）。
3. worker 部署与前端部署解耦，均可独立回滚。

## 8. 部署与验证

顺序：worker（wrangler deploy）→ 前端（deploy-frontend.mjs，b351+，assets 先 / HTML 最后的既有纪律）。
验证清单：
- [ ] 线上 `/assets/data/benchmark.json` = 新版；`/api/version` 徽标与 note 不再矛盾（同页无 GLM/DeepSeek 冲突文本）
- [ ] 桌面 1280 + 移动 390 双档截图；四语言切换无裸键
- [ ] 降级演练：临时用旧 JSON + 新 JS 本地渲染一次（客户端过渡态）
- [ ] vitest 全量绿（batch-ops i18n import、static-routing 缓存头）
- [ ] 站内 AI 实测两问：「评测看板有哪些指标」「四模型消融结果」→ site_guide 回答与新页一致
- [ ] 部署窗口毛刺评估：JSON 已带 `?v=` 后理论上消除；低峰期部署

## 9. 客户端跟进（Web 验收后，由你拍板时机）

| 端 | 需要？ | 在哪构建 | 版本 |
|---|---|---|---|
| Android APK | 建议例行更新（App 内看板才会吃到新页面） | 本机 `build-apk.mjs`（cap sync 自动带 frontend）→ R2 + sha256 | versionCode 82 / 3.187.0 |
| Windows NSIS | 建议同批 | 本机（frontend 快照进包） | 3.187.0 |
| macOS | 可选；**需要进 VMware 虚拟 Mac** | VM 构建 → 上传 R2 → GitHub Release 你发布 | 3.187.0 |

不更新的代价：三端看板停留在旧数据（自洽但过时）；Web 与 QR 扫码路径（评委主路径）已正确。**页面改造与客户端发包完全解耦，Web 先行无风险。**

## 10. 需要你提供的输入

1. DeepSeek 作为生产接入的日期（`production.since`）。
2. A 区九项指标口径确认（尤其 S6 66/66 出处复核）；B 区 Kimi 延迟「约 25s/35s」标「约」还是补测一次 K3。
3. `production.bench`：复跑 ai-bench（推荐，~5 分钟）还是引用消融期数据。
4. 证据措辞：仓库当前私有——页面写「证据归档于仓库 docs/benchmarks/（随开源材料公开）」还是仅写「证据链 53 份产物存档」。

## 11. 执行顺序（小循环）

1. 你点头 + 提供 §10 输入 → 2. benchmark.json v2 → 3. ai-benchmark.js + pages.css（新表样式）→ 4. i18n ×4 + fallback → 5. vitest + 本地降级演练 → 6. SITE_PAGES + worker 部署 → 7. 前端部署 + 线上验证清单 → 8.（可选）三端重包 → 9. README/docs 同步（根 README 平时禁改，需你明确指令）+ changelog 轮次记录。

## 12. 风险清单

- S6 等个别数字在 PHASE_SUMMARY（板块一当日）与 README 终版间存在口径差 → 执行时以 README 指标表 + docs/benchmarks 证据文件为准，逐行核对后才写入。
- Kimi 延迟为估算值 → 标「约」或补测，二选一，不裸上。
- 部署窗口新旧 JSON/JS 配对 → `?v=` 跟随修复 + 低峰部署。
- 客户端快照过渡期 → 降级守卫 + 旧端整体自洽，无混搭矛盾。
