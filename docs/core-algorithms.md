# Suveoo — 核心算法说明

> 配套代码：`backend/worker-main.js`（全部算法为确定性纯函数，随附 159 个 vitest 用例，跑在真实 workerd 运行时）

## 1. 十进制金额运算（防浮点幻觉）

一切边界（API/IR/KV/DO）金额均为字符串；内核一律 `bigint` 分（cents）：

```js
toCents("500.55") = 50055n        // 拒绝三位小数/非法格式
centsToStr(50055n) = "500.55"
```

**AA 分账守恒**（`splitEqually`）：总额精确均分，余数（1..n-1 分）按参与者顺序 +1 分，Σ分账 ≡ 总额（模运算确定性，可重放）。火锅 ¥860 三人 → 286.67 / 286.67 / 286.66。

## 2. BankAction IR 编译（compileToIR）

每次工具调用编译为类型化对象：`facts[]`（每参数带 `provenance`（user_input/model_output/tool_result/merchant_note/ocr/system）与 `trust`（TRUSTED/SYSTEM/EXTERNAL_UNTRUSTED））、`steps[]`、`risk`（编译期即分级）、`preconditions`、`compensation`、`nonce`（128-bit 一次性）。内部字段（grant_hash/otp/__provenance）不入 IR。

## 3. 五道确定性验证（verify）

| 验证器 | 算法要点 |
|--------|----------|
| ① Policy | 注册表三色规则 + 动态升级（日累计 >¥1,000 → 红）+ 硬拒绝（非法金额；AI 通道转账单笔 ¥5,000 / 日 ¥10,000 上限） |
| ② Consent | `grant_hash = SHA256(action ‖ 授权字段(按 Schema 顺序) ‖ user_id ‖ expires_at ‖ nonce)`；确认时**服务端凭哈希查 KV**：条目存在 ∧ 绑定当前用户 ∧ 未过期 ∧ 未消费 ∧ 快照与当前 IR 逐字段相等，才消费放行。绝不"重算比对"。 |
| ③ Provenance/Taint | 授权字段（recipient/amount/currency 等）的 trust 必须 TRUSTED；商户备注/OCR 等外部来源只能影响认知（可传入分析），不能获得行动授权——先于 Consent 执行，被污染参数连请求授权的资格都没有 |
| ④ Invariants | 余额守恒（amount ≤ 可用余额）、理财适当性（product.R ≤ user.PR）、长程任务必须声明补偿；strict 模式下数据缺失即拒绝 |
| ⑤ Replay | IR.nonce 在 LedgerDO 幂等集查重，命中拒绝；执行成功后登记 |

绿色工具走轻量通道（仅 Provenance 标注）；黄/红走全五道；红级另需邮箱 OTP（redstep 场景，验证码哈希存储、错 5 次作废）。

## 4. Verified GenUI（A2UI 的安全化）

LLM 只输出组件意图；卡片上的收款人/金额/费率**只来自已验证的 grant.snapshot**（前端 `issuer!=="verified_ir"` 一律丢弃）。"界面显示 500、后端转 5000"在架构上被堵死。

## 5. Saga 补偿与调度

长程任务（生日订花/预约转账）三段式：`T1 LockFunds → T2 履约 → (失败) C1 UnlockFunds`。故障注入开关（DEMO_MODE）将 T2 标记失败，`taskDue` 返回 `["T1 ✓","T2 ✗","C1 ✓"]` 并解锁资金——余额守恒由测试断言。调度：SagaDO `alarm()` 精确唤醒 + 读路径 `sweepDue` 补偿扫描（alarm 丢失兜底）；monthly 任务执行后自动重排。

## 6. 卡号生成与开户分配

16 位 Luhn（ISO/IEC 7812）合法卡号：15 位载荷 + 校验位；registry DO 内 UNIQUE 索引保证全局唯一（冲突重生成，至多 12 次）。开户方案（rng 可注入、可重放）：4 借记卡余额按随机权重分配且合计严格落在 ¥999,328.24–1,124,549.38；卡面 8 选 4 不重复；PR 等级 = 风险问卷 5 题均值四舍五入。

## 7. 认证与口令

JWT HS256（1h，jti 黑名单登出）；PBKDF2-SHA256 100,000 轮 + 16B 盐 + 常数时间比较；登录 15 分钟内错 5 次锁定；邮箱验证码 60s 冷却 / 每小时 5 次 / 10 分钟有效 / 哈希存储。

## 8. 复杂度与规模

- 单 Worker 冷启动 <50ms（无重依赖；pdf-lib 与 fontkit 动态 import）
- 每用户一个 LedgerDO（SQLite）：转账路径 O(1) 索引查询 + 两条 SQL
- 测试：99 用例（unit 74 + integration 25），15.9s @ workerd


## 7. 基金数据生成模型（backend/scripts/gen-fund-data.mjs，确定性）

16 只基金的月度净值由**多因子模型**生成：r_m = α/12 + Σ(w_f · f_y/12 + w_f · shock_f,m) + idio·ε/√12 − 0.08·r_{m-1}。因子年度收益表锚定真实市场史（eq≈MSCI ACWI、gold≈XAU、cnmm≈人民币货基利率下移轨迹、semi/apac/health/energy/reit/embi 各自周期），月度因子噪声（FVOL）还原真实波动量级。**终值校准**：随机路径的区间总收益锚定因子复合目标（含 σ²/2 拖累补偿×0.55），防随机漂移。**指标反算**：returns/年化/夏普/最大回撤全部从生成序列计算（数据自洽，测试可验证）。**10 年预测**为 1200 路径对数正态蒙特卡洛（漂移取 ln(1+fwd)，p50 语义为几何年化）。

## 8. 外汇实时牌价（worker hFxLive）

open.er-api.com 免费层（真实市场汇率，日更）→ KV 缓存 15 分钟（fx:live:v2）→ 失败回退 R2 静态快照（source 字段区分）。fxQuotesFromRates 纯函数：CNY 基准换算（JPY 按 100 单位口径）、buy/sell = mid∓点差（25-45bp 按币种）、spark 七点滚动（展示口径）。


## 9. 转账真实性与跨用户双记（第十一轮）

- `resolveTransferTarget`：三重校验单一真相源——16 位 Luhn（复用 luhnCheckDigit）→ registry `userByCard` 存在性 → `profile.name` 严格相等（trim）；本人卡放行（同卡自转双层拦 SAME_CARD）。接入 `preValidateIntent`（runGuarded 顶部、compileToIR 之前，REST 与 AI/MCP 同规）与 executeIntent 执行层复核。
- 双记顺序：预检转出卡 → 对方 DO `credit`（加余额 + IN 流水 + 通知，trace_id 幂等去重）→ 本地扣款 + OUT 流水。"只扣不加"不可能；"加而不扣"为毫秒窗并发理论边界（预检+测试覆盖规避）。
- 演示人物落户 `ensureDemoPersonas`：13 人真实账户（占位邮箱、口令哈希掺 JWT_SECRET）、幂等（findUser 命中跳过），种子收款人卡号全部指向真实账户。

## 10. 市值结算与换汇整数运算（第十一轮）

- `navScaled4`/`marketValueCents`：净值 ×10⁴ 放大 BigInt，先乘后除 floor（禁浮点）。赎回回款、持仓页 value、overview 估值、MPC holdings 市值共用同一公式——显示值 === 回款额。
- `fxNormalizeArgs`：服务端 hFxLive 牌价（购汇 sell / 结汇 buy，×10⁴ BigInt），JPY 每 100 日元口径（unit=100）；双腿金额（CNY 分/外币分）由服务端换算后传入 DO，客户端 rate 不参与结算。
