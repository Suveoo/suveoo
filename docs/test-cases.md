# Suveoo — 测试用例说明

测试框架：**vitest + @cloudflare/vitest-pool-workers**（真实 workerd 运行时 + miniflare 内存绑定 KV/R2/DO，`isolatedStorage` 逐测试回滚）。运行：`cd backend && npm test`。

## 目录与覆盖

### unit/（纯函数，83 用例）

| 文件 | 覆盖 |
|------|------|
| money-math.test.js | bigint 分转换边界、0.1+0.2 陷阱、AA 分账守恒（¥860/3 → 286.67/286.67/286.66）、Luhn（经典用例 7992739871→3）、rng 注入可复现 |
| policy-engine.test.js | 三色边界（日累计恰 ¥1,000 含本笔）、AI 通道单笔/日累计硬上限、上限只约束转账类不误伤理财、未注册工具拒绝 |
| ir-compiler.test.js | IR 结构（facts/steps/trace/nonce）、provenance 默认与覆盖、内部字段不入 IR、nonce 唯一性 |
| consent-binding.test.js | grant_hash 确定性、一次性消费、过期、用户绑定、凭空哈希拒绝、**500→5000 突变即失效**（决赛演示第二幕） |
| taint-check.test.js | 商户备注充当 amount 全链路阻断（先于 Consent）、非授权字段放行、MODEL_OUTPUT 不可授权、绿色轻量通道 |
| invariants.test.js | 余额不足/恰好等于、严格模式数据缺失、PR 适当性（R5>PR3 拒）、长程任务补偿配对 |
| idempotency.test.js | 同 nonce 重放拒绝、五道 stages 顺序恒定、绿色通道 skipped 标记 |
| auth-crypto.test.js | JWT 往返/过期/篡改/错密钥、PBKDF2 盐随机、常数时间比较 |
| card-plan.test.js | 余额区间（30 种子扫描）、四卡守恒、卡面 8 选 4 去重、默认卡唯一、BIN-网络映射 |
| calc-tools.test.js | 10 款 calc_* 纯函数（复利/贷款/目标/信用卡/退休/通胀/AA/存款对比/汇率/预算分配）：典型值、边界与非法参数 |
| fund-data.test.js | 16 只基金 JSON 完整性：序列 ≥49 月且三线等长、returns 自洽（since≈期末涨幅）、stats 合理（R1 波动<2.5%、R5>15%）、蒙特卡洛 p10≤p25≤p50≤p75≤p90、披露要素齐全；fxQuotesFromRates 纯函数（JPY 100 口径、点差比例、spark 透传） |

### integration/（SELF 全栈 + 真实绑定，25 用例）

| 文件 | 覆盖 |
|------|------|
| registration-provisioning.test.js | 验证码邮件→开户发卡（4+1、余额区间、掩码、卡面去重）→会话→登出黑名单→卡号登录→错 5 次锁定→找回密码→账号存在性不泄露→60s 冷却 |
| static-routing.test.js | 尾斜杠等价、/index.html 兜底、404 状态码、动态卡路由重写、缓存头分级、304、安全头、静态仅 GET/HEAD |
| transfer-flow.test.js | 表单通道两段式（INPUT_REQUIRED→确认→扣款→流水可查）、grant 一次性、突变失效、红级 OTP、MCP 通道同规（initialize/tools list/call）、注入样本经 MCP 阻断、AI 硬上限 |
| saga-compensation.test.js | seed→锁 ¥600→注入失败→`T1✓ T2✗ C1✓`→资金解锁且余额守恒；正常路径 DONE；手动取消补偿 |
| scheduled-tasks.test.js | 预约建立（两段式）→alarm 到点执行→DONE+扣款；到期前取消→CANCELLED 不执行 |
| dimensional-seed.test.js | 维度化注入：覆盖落库=注入计数+卡片按档位+欠款=明细合计+集团签名在册；预检 dry-run=实跑同构；合并只增+payees 无重名+二次幂等；自定义只动勾选块；缺省旧行为回归；非法 preset 兜底 |

### attack/（对抗用例，回归时与 unit 同跑）

prompt-injection / replay-attack / authorization-bypass / consent-mutation 四类样本场景（当前由上述 unit/integration 文件承载断言；独立攻击语料库扩展中）。

## 运行结果

```
Test Files  37 passed (37)
     Tests  267 passed (267)
  Duration   ~40s
```

2026-09-21（第三十三轮，v3.35）新增测试：
- tests/unit/fund-data.test.js 扩展（+4 净增）——`fxSparkByDay` 按自然日去重（同日多次采样序列不变/跨日追加滑窗 7 点/当日末点更新/JPY 口径与多币种独立累计）；`fxQuotesFromRates` 无历史断言改"单点真实值"（原 7 点平铺锁定的是伪造填充，按第四期任务 A 口径改写）
- tests/integration/payee-phone.test.js（2）——带手机号添加（REST 两段式）→ /api/payees 返回 phone → contacts_search 全号/尾号命中 → payee 转账 EXECUTED → DELETE 清理；非法手机号 INVALID_PHONE（含 0 开头/短号）与可选性（不填不受影响）

2026-09-20（第二十六轮）新增会话历史测试：
- tests/unit/chat-history.test.js（9）——窗口纯函数：parseHistCache 新旧格式兼容、buildHistoryContext 首条常驻/字符预算裁中段保头尾/条目只含 role+text（混入 grant_hash/tool_use/cards 白名单化丢弃）、advanceHistory 失败轮 user-only 与滚动截窗、提示词历史数值过期语义在锁定区且 ≤1600（第二十七轮自 1500 上调：领域边界/危机应对为必需项）
- tests/integration/chat-history.test.js（6）——sessions CRUD 与属主隔离（PATCH 改名归档/DELETE 后 404/user_audit session_delete）、失败轮只落 user 侧且消息行零 grant/tool_result 字段、KV miss → chat_msgs 重建窗口（首条常驻+role+text）、历史卡片落库形态与终态徽标（EXECUTED/EXPIRED/BLOCKED）、过期 grant 重放"确认执行"被 CONSENT 校验拦截、90 天惰性清理
- schema-migration.test.js 扩展 chats 五列迁移覆盖；reminder-task.test.js 语义锁定 +1（历史数值过期）；测试环境配置假 LLM 端点（拒连地址）驱动失败轮路径

2026-09-17（第十一轮）新增集成测试文件：
- tests/integration/demo-admin.test.js（6）——演示端点管理员令牌 fail-closed/三连鉴权/审计落盘/inspect 巡检
- tests/integration/card-reveal.test.js（3）——完整卡号 reveal（16 位非掩码、属主隔离、401/404）
- tests/integration/wealth-redeem.test.js（6）——赎回市值结算涨/平/跌精确断言 + API 端到端（显示值=回款额）+ marketValueCents 纯函数
- tests/integration/fx-exchange.test.js（6）——购汇/结汇实时牌价结算（KV 预置牌价确定性）、JPY 每 100 专项、指定 from_card 扣该卡、INSUFFICIENT_FX 拦截、伪造 rate 无效、MCP 同数学
- transfer-flow.test.js 新增"收款方真实性校验与跨用户双记"组（假卡/Luhn/错姓名/双记±守恒含入账邮件/payee 拦截与通过/同卡拦截）；transfer-flow/attack 四文件全部改用 realTarget（真实收款方）模式，断言语义不变

## SuveooBench

评测脚本位 `backend/tests/bench/generate-benchmark.js`（扩展中）；当前看板数据 `frontend/assets/data/benchmark.json` 由集成用例指标汇总生成，/ai/benchmark 可视化。

2026-09-17（第十二轮）新增测试：
- tests/integration/security-credential.test.js（8）——改密三态（缺当前密码 400 / 错密码 401 / 全对 200+新 token 且同码不烧）、会话纪元（旧 token 401、新 token 200、部署前无 epo 旧令牌按纪元 0 于 bump 后失效）、2FA 三态（关缺密码 400 / 错密码 401 / 对密码 200；开仅 OTP）、找回密码（请求体无旧密码键、重置后双设备 JWT 全 401、新密码可登录）
- tests/unit/schema-migration.test.js（3）——columnMigrations 幂等列迁移清单（老库/已迁移/半迁移；DDL 保持老表结构，新旧 DO 同路径）
- tests/integration/card-ledger.test.js（10）——挂卡断言（转账默认/指定卡、跨用户入账侧、缴费/理财/换汇）、信用支付四态（借记不动+欠款累加+可用减少+挂卡；超额 INSUFFICIENT_CREDIT；购汇欠款按人民币计入+结汇拒信用卡；信用卡不可作入账目标）、还款闭环（动态金额确认卡/默认借记扣款/欠款清零/memo 含金额/NO_DEBT 409；AI 通道 bill_pay 无金额动态补齐）、单卡真过滤分页（25 条 20+5 两页、他卡不串、不存在卡空返回）、demo 种子（信用欠款 863247 精确、本月流水 card 无 NULL、四卡各归各）
