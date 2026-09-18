# Suveoo 设计语言（Design Language v2）

日期：2026-09-18（第二十二轮，祁院长"前端像古董/过于传统"批评后的设计语言现代化）。依据文件：`notes/webank-design-deconstruct.md`（微众银行 App 设计语言拆解，含产出方式与限制说明）。

## 1. 设计原则

1. **蓝色骨架 + 多彩内容**：海军蓝 `--color-primary #1E2A78` 仍是品牌主色与全局骨架（顶栏/主按钮/链接），页面内容层由功能色板承担——这是微众"一屏多彩而不乱"的核心手法。
2. **语义色与营销色分槽**：三色权限（绿自动/黄确认/红强验证）与涨跌色继续独占 `--color-green/yellow/red(-bg)`；功能色命名全部避开这三个词（orange/gold/violet/teal/rose/sky），低饱和 tint 不与语义徽章同位出现。
3. **严肃场景不套营销皮肤**：确认卡、OTP 弹窗、Trust Console、安全中心等安全 UI 保持原有克制样式——防止"彩色=轻松=低风险"的错误暗示。
4. **大数字三件套**：用户最关心的数字（收益率/利率/收支/余额）用 `.num-xl`（大数字 + 单位小字 + 灰标签），涨跌沿用"收入=绿/支出=红"既有语义（`.trend-up/.trend-down/.trend-pill`）。
5. **移动端优先**：一切视觉决策先过 390px 视口，桌面 1280px 复查；不做暗色模式。

## 2. 功能色板（tokens.css）

每族四档：标准 / 深（文字用）/ tint（浅底）/ 渐变 stop ×2（135° 对角，深在前）。

| 族 | 用途 | 标准 | 深 | tint | 渐变 |
|---|---|---|---|---|---|
| orange 权益橙 | 权益/订阅优化/营销点缀 | `#F97316` | `#C2410C` | `#FFF1E6` | `#F97316→#FFB020` |
| gold 理财金 | 基金/收益率/理财 | `#D99E00` | `#A16207` | `#FDF6E0` | `#F5B301→#FFD866` |
| violet 信用紫 | 信用卡/新品/AI | `#7C3AED` | `#5B21B6` | `#F1EAFE` | `#6D28D9→#A78BFA` |
| teal 成长青 | 存款/定投/成长 | `#0D9488` | `#0F766E` | `#E4F6F3` | `#0D9488→#2DD4BF` |
| rose 活动玫红 | 活动/还款提醒/成就 | `#E11D48` | `#BE123C` | `#FDECF1` | `#E11D48→#FB7185` |
| sky 天蓝 | 待办/通用推荐/入口 | `#0E8FE0` | `#0369A1` | `#E7F4FC` | `#0E8FE0→#38BDF8` |

CSS 变量命名：`--c-<族>` / `--c-<族>-deep` / `--c-<族>-tint` / `--c-<族>-g1|g2`。

## 3. 组件类目（components.css / pages.css）

| 类 | 用途 |
|---|---|
| `.btn-accent-orange/gold/violet/teal/rose/sky` | 彩色渐变按钮（营销 CTA；金族按钮文字深棕保证对比） |
| `.bg-grad-*` / `.bg-tint-*` / `.tx-*` | 渐变底 / 浅底 / 深色文字工具类（卡头、徽章底、图标底） |
| `.promo-card` | 渐变营销产品卡：`.pc-tag` 胶囊 + `.pc-title` + `.pc-desc` + `.pc-cta` 白底圆角按钮 + `.pc-art` 3D 插画角标（主页情境卡） |
| `.num-xl`（`lg`） | 大数字三件套；`.n` 主数字（30/38px mono）+ `.u` 单位 + `.lb` 标签 |
| `.trend-up/.trend-down/.trend-pill` | 涨跌色与胶囊（up=绿/down=红，沿用既有收支语义） |
| `.qi-<族>` | 服务宫格图标多彩底（tint 底 + 深色图标，六色轮转） |
| `.fc-hero` / `.fc-mini` | 理财卡浅底渐变卡头（大数字 + 插画角标 + 次级字段行） |
| `.hero-v2` | 主页海军蓝渐变 hero（径向光斑装饰、白色输入框、反白 chips） |
| `.voice-btn` | 语音按钮（`.listening` 红色脉冲=功能性反馈，`.voice-off` 降级态半透明） |
| `.cf-bar` / `.cf-row` | 本月收支比例条与数字行（绿=收入/藏青=支出） |
| `.ai-insights` / `.ai-ins-card` | /ai 首屏确定性洞察卡（tint 底大卡、低信息密度、CTA 链接） |
| `.tx-sum-row` / `.tx-main-change` | 交易记录页结论区（三数字 + 变化归因胶囊） |
| `--r-card 16px / --r-card-lg 20px / --r-btn 10px`、`--shadow / --shadow-lg` | 更大圆角与柔和阴影层次 |

## 4. 3D 风插画占位体系

目录 `frontend/assets/images/illustrations/`，8 张 v1 手写 SVG（轻 3D：渐变+几何+柔投影）。规格表（用途/尺寸/内容/风格/替换规则）见该目录 `README.md`。**替换内容后必须递增全站 HTML `?v=bNNN`**（SW 按 URL 缓存，否则老用户看不到新图——第十七轮踩坑）。

## 5. 应用范围

- **全站级**（自动生效）：圆角/阴影升级、彩色按钮、tint/渐变工具类。
- **重做页**：主页（hero/产品卡/收支卡/多彩宫格）、/ai（首屏洞察卡/语音）、/account/transactions（结论区）、/wealth + /wealth/funds + /wealth/deposits（大数字卡头/品类插画）。
- **未动**：安全 UI（确认卡/OTP/Trust Console/安全中心）、登录注册等表单页（仅享受全局圆角阴影）。
