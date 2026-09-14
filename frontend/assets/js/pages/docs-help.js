/* docs-help.js — 帮助中心深度内容（三语，由 help.js 按 S.i18n.lang 取用） */
window.S = window.S || {};
S.HELP_DOCS = {
  "zh-CN": {
    guide: [
      { t: "开户", a: "邮箱验证码 + 八题风险测评，即时签发 4 借记卡与 1 信用卡。", href: "/account/register", cta: "立即开户" },
      { t: "对话即业务", a: "在 /ai 用自然语言发起转账、账单分析、理财对比——AI 只能提议，你确认才执行。", href: "/ai", cta: "体验 Suveoo AI" },
      { t: "转账三步", a: "选付款卡 → 填收款人 → 黄级确认卡 120 秒内确认；大额自动升级邮箱 OTP。", href: "/transfer/intrabank", cta: "去转账" },
      { t: "管理卡片", a: "别名、默认卡、单笔/单日限额与冻结；冻结为红色操作，需 OTP。", href: "/account/cards", cta: "我的卡片" },
      { t: "理财与计算", a: "8 只模拟基金 + 6 类存款 + 10 款图形化计算工具（URL 参数可分享）。", href: "/wealth", cta: "财富总览" },
      { t: "安全中心", a: "两步验证开关、风险测评重测、登录密码修改与审计记录。", href: "/account/security", cta: "安全中心" },
    ],
    cats: [
      {
        name: "账户与登录",
        items: [
          { q: "支持哪些登录方式？", a: "两种标识符均可登录：注册邮箱，或本平台签发的 16 位虚拟卡号，配合密码使用；开启两步验证后还需输入邮箱验证码（5 分钟有效）。验证码单码限 5 次尝试，防止暴力猜测。" },
          { q: "登录失败被锁定了怎么办？", a: "连续 5 次密码错误将触发 15 分钟锁定，这是防暴力破解的标准措施，到期自动解锁，无需人工干预。如果你忘记了密码，请使用「找回密码」流程：在预留邮箱接收验证码即可自助重置（模拟系统无需护照号）。重置后建议立即登录并检查最近交易。" },
          { q: "收不到登录验证码怎么办？", a: "按以下顺序排查：①检查邮箱的垃圾邮件/促销邮件文件夹（发件人为 noreply@suveoo.com，经 Cloudflare Email Service 发出）；②注意 60 秒重发冷却与每小时 5 封的频控——频繁点击「重新发送」只会更慢；③验证码 10 分钟内有效、单码限 5 次尝试，过期请重新获取；④确认邮箱地址拼写无误。因你方邮箱服务商拒收或延迟导致的送达问题不属于平台过错，可更换邮箱服务商测试。" },
          { q: "注册时一定要填真实姓名吗？", a: "不需要。这是模拟银行系统，姓名仅作界面展示，可使用化名；但请勿冒用真实他人身份并宣称系其本人，也不得使用侵犯他人商标或姓名权的标识。开户即时签发 4 张借记卡（余额为随机模拟数据，合计约 ¥1 亿量级）与 1 张信用卡（额度 ¥320,000）。" },
          { q: "如何开启/关闭两步验证（2FA）？", a: "进入「安全中心」，切换「两步验证」开关：开启时系统先向你预留邮箱发送验证码，输入正确后立即生效。开启后，登录需额外验证码，红色级操作（大额转账、基金申购、卡片冻结等）也要求更强验证。关闭 2FA 同样需要 OTP 确认，防止他人替你关闭。" },
          { q: "可以删除账户吗？", a: "可以。发送邮件至 support@suveoo.com 说明来意，我们将删除账户、卡片、流水与持仓数据（存储期限详见《隐私政策》第八条）。删除不影响你在本平台浏览公开页面。" },
        ],
      },
      {
        name: "转账与支付",
        items: [
          { q: "为什么跨行转账和跨境汇款是灰色的？", a: "模拟银行系统仅支持行内转账（Suveoo 16 位虚拟卡号之间）。跨行与跨境汇款入口以灰色展示并在点击时说明，这是「模拟」边界的显式呈现，而非功能缺陷。外汇牌价与兑换计算器可作为跨境场景的演示替代。" },
          { q: "什么操作需要确认？什么是绿色/黄色/红色？", a: "三色分级由服务端策略引擎按操作类型与金额实时判定：绿色（查询、账单分析、联系人检索等只读操作）自动执行；黄色（转账、限额调整、订阅取消等）需要你确认；红色（大额转账、基金申购赎回、存款开户、卡片冻结、改密等）需要两段式确认加邮箱 OTP 强验证。分级与金额、日累计相关，客户端展示不构成判定依据。" },
          { q: "确认卡里的 grant 是什么？为什么 120 秒后就失效？", a: "grant_hash 是对你确认内容（收款人、金额、币种等授权字段）的加密快照绑定：有效期 120 秒、一次性消费、与你的账户绑定。确认时系统逐字段比对——任何参数变化都会使授权失效（CONSENT_INVALIDATED），这保证「你确认过的」与「实际执行的」完全一致。过期或已使用的 grant 重新发起操作即可获得新的 grant。" },
          { q: "提示余额不足，但我明明有钱？", a: "可用余额 = 卡余额 − 锁定资金。锁定期资金（如「生日订花」长程任务的预算）在卡片上以黄色徽章单独标注，任务完成时资金付出，取消任务或履约失败时自动解锁返还。请检查是否选择了余额不足的付款卡，或资金正处于锁定状态。" },
          { q: "预约转账可以取消吗？钱会退回吗？", a: "可以。在「预约转账」页对待执行任务点击取消：若任务已锁定资金，系统自动执行补偿（资金解锁返还），任务标记为已补偿。到点履约还有到期扫描兜底，即使调度事件丢失也会在列表读取时补履约。" },
          { q: "转账后对方/我能收到通知吗？", a: "会。行内转账完成后，转出方与转入方（如配置了邮箱）都会收到邮件通知；填写备注时备注内容将包含在邮件中。邮件由 noreply@suveoo.com 经 Cloudflare Email Service 发出。" },
        ],
      },
      {
        name: "财富管理",
        items: [
          { q: "基金净值和收益率是真实数据吗？", a: "不是。全部净值、历史业绩、费率与存款利率均为静态编造的演示数据，仅用于展示界面与计算链路，不代表任何真实产品，也不构成投资建议。这是「模拟银行系统」声明的组成部分。" },
          { q: "为什么我无法申购某只基金？", a: "触发了适当性保护：产品风险等级（R1–R5）必须不高于你的风险承受等级（PR1–PR5，由注册时的八题测评折算，可在安全中心重新测评）。不匹配时服务端拒绝（APPROPRIATENESS_MISMATCH），界面会预先提示——即使绕过界面直接提交，验证运行时也会拦截。" },
          { q: "持仓市值是怎么算的？", a: "持仓市值 ≈ 本金 × 当前净值 ÷ 成本净值，用于资产总览与仪表盘演示；「今日收益」为基于模拟净值的近似浮动盈亏。真实基金的费用、分红与税费不在演示范围内。" },
          { q: "外汇兑换有额度限制吗？", a: "有。模拟年度换汇额度为 $50,000 等值，用于演示额度不变量校验：额度不足时兑换被拒绝。牌价为静态演示数据，与真实市场无关；兑换为黄色操作，需两段式确认。" },
          { q: "赎回基金为什么也要红色验证？", a: "赎回直接减少你的资产，与申购同属高影响操作，因此统一要求两段式确认加邮箱 OTP。这是「操作影响越大、验证越强」分级原则的体现。" },
        ],
      },
      {
        name: "订阅与账单",
        items: [
          { q: "如何取消订阅？", a: "在「账单与订阅」页对活跃订阅点击「取消订阅」：黄色两段式确认后立即生效，订阅状态转为已取消，提醒同步关闭。取消不可撤销，但你可以随时重新关注类似产品（演示语义）。" },
          { q: "「低使用率」标记是什么？", a: "使用率低于 20% 的活跃订阅会触发醒目提示（含使用率与月费），这是对真实银行 App「订阅提醒」功能的演示，帮你识别闲置扣费——页面同时提供一键让 AI 分析并退掉最少用订阅的入口。" },
          { q: "自动扣费可以关闭吗？", a: "可以。每条订阅提供「提醒」开关（关闭后不再生成扣费提醒通知），账单也支持一键缴费与自动扣费开关演示。" },
        ],
      },
      {
        name: "隐私与 Cookie",
        items: [
          { q: "你们设置哪些 Cookie？", a: "全部为第一方：会话令牌（1 小时，localStorage）、语言偏好（1 年）、Cookie 同意状态（1 年）、分析同意标记（1 年）。分析类 Cookie（GA4 的 _ga 系列，2 年）仅在你明确选择「接受全部」或开启分析开关后才由 Google 设置。完整清单、用途与期限见《Cookie 政策》第 2 条。" },
          { q: "我如何更改或撤回 Cookie 同意？", a: "两个入口即时生效：页脚「Cookie Preferences」按钮，或任意页面首次访问约 4 秒后出现的偏好卡。你可以单独开关「分析与统计」，也可以仅必要/接受全部。撤回后 GA4 立即停止测量，分析 Cookie 随浏览器清除策略删除。" },
          { q: "拒绝分析 Cookie 后你们还能看到我吗？", a: "不能。拒绝时 GA4 进入 Cookieless 模式：不设置 Cookie、不读取设备标识，仅发送不含客户端 ID 的无 Cookie 度量 ping，用于聚合估算「大约多少人拒绝」；这些数据不进入你的个体报告，也无法关联到你的账户。" },
          { q: "AI 对话会被记录吗？", a: "对话经本平台服务端代理转发至模型服务商（详见《隐私政策》第六条）；对话历史随会话保留，你可随时发起新会话隔离上下文。传输内容不含密码、令牌、验证码与完整卡号；AI 的输出只是「提议」，任何影响资金的动作仍需你确认。" },
        ],
      },
    ],
    trouble: [
      { q: "页面一直显示加载中或不响应？", a: "本平台内置三层自愈：请求超时自动换连接重试、20 秒启动看门狗自动刷新、Service Worker 离线兜底。若仍异常：①手动刷新一次；②清除本站站点数据后重试；③检查是否有代理/防火墙拦截。若反复出现，请连同时间点报告至 support@suveoo.com。" },
      { q: "界面文字出现「xxx.yyy」形式的裸键？", a: "这通常是语言包加载被中断所致，刷新一次即可恢复；若持续出现，请告知具体页面与语言组合。" },
      { q: "AI 回答一直没有输出？", a: "AI 对话依赖模型服务商可用性，高峰期可能偶发超时；点击输入框重新发送即可重试。对话不会因重试产生费用（模拟系统）。" },
      { q: "收到的邮件格式混乱或缺失？", a: "部分邮箱客户端对 HTML 邮件渲染不一致，正文关键信息（验证码、金额、流水号）始终以纯文本同时提供；若缺失请反馈至 support@suveoo.com 并附邮件截图。" },
    ],
    antifraud: [
      "转账前核实收款人姓名与账号——行内转账支持从常用收款人选择，避免手输错误；",
      "不向陌生人或未核实的「安全账户」转账——任何要求你转入所谓安全账户的都是诈骗；",
      "验证码与密码绝不告诉任何人（包括自称银行客服或 Suveoo 团队的联系者）——本平台永远不会索要这些信息；",
      "AI 的回复不构成投资建议，涉及资金的操作以确认卡展示的精确快照为准；",
      "警惕伪装成交易备注、商户说明中的指令性文字——本平台验证运行时会自动将其标记为不可信来源并拒绝执行，但你也应保持警惕；",
      "来自本平台的邮件发件人恒为 noreply@suveoo.com，其他域名发送的「Suveoo 邮件」均可判定为伪造；",
      "演示数据无真实价值——任何诱导你为「提现 Suveoo 余额」付费的都是诈骗。",
    ],
    ai: {
      intro: "Suveoo AI 的安全模型可以概括为一句话：AI 只能提议，确定性验证决定执行。模型不持有任何账本权限，其输出必须经编译与逐道校验后才能生效——以下五道验证构成这道防线：",
      items: [
        "① Policy —— 三色分级（绿/黄/红）与硬性限额：按操作类型与金额自动判定，AI 通道另有单笔 ¥5,000 / 单日 ¥10,000 硬上限；",
        "② Consent —— 参数级同意绑定（grant_hash）：你在确认卡中看到的精确快照即授权范围，参数一变即失效；",
        "③ Provenance —— 数据来源污染追踪：来自交易备注、OCR 等外部文本的取值不得作为收款人/金额等授权字段；",
        "④ Invariants —— 金融不变量：余额充足性、产品适当性（R ≤ PR）、外汇额度等逐项校验；",
        "⑤ Replay —— 幂等重放防护：每笔操作唯一 nonce，重放一律拒绝，不会二次扣款。",
      ],
      chain: "执行链路：LLM 提议 → BankAction IR → 五道验证 → VERIFIED → 账本。AI 无法绕过任何一道——这不是策略声明，而是代码结构：不存在绕过验证直接写账的路径。",
    },
  },
  "zh-TW": {
    guide: [
      { t: "開戶", a: "信箱驗證碼 + 八題風險測評，即時簽發 4 簽帳卡與 1 信用卡。", href: "/account/register", cta: "立即開戶" },
      { t: "對話即業務", a: "在 /ai 用自然語言發起轉帳、帳單分析、理財對比——AI 只能提議，你確認才執行。", href: "/ai", cta: "體驗 Suveoo AI" },
      { t: "轉帳三步", a: "選付款卡 → 填收款人 → 黃級確認卡 120 秒內確認；大額自動升級信箱 OTP。", href: "/transfer/intrabank", cta: "去轉帳" },
      { t: "管理卡片", a: "別名、預設卡、單筆/單日限額與凍結；凍結為紅色操作，需 OTP。", href: "/account/cards", cta: "我的卡片" },
      { t: "理財與計算", a: "8 隻模擬基金 + 6 類存款 + 10 款圖形化計算工具（URL 參數可分享）。", href: "/wealth", cta: "財富總覽" },
      { t: "安全中心", a: "兩步驗證開關、風險測評重測、登入密碼修改與稽核記錄。", href: "/account/security", cta: "安全中心" },
    ],
    cats: [
      {
        name: "帳戶與登入",
        items: [
          { q: "支援哪些登入方式？", a: "兩種標識符均可登入：註冊信箱，或本平台簽發的 16 位虛擬卡號，配合密碼使用；開啟兩步驗證後還需輸入信箱驗證碼（5 分鐘有效）。驗證碼單碼限 5 次嘗試，防止暴力猜測。" },
          { q: "登入失敗被鎖定了怎麼辦？", a: "連續 5 次密碼錯誤將觸發 15 分鐘鎖定，這是防暴力破解的標準措施，到期自動解鎖，無需人工干預。如果你忘記了密碼，請使用「找回密碼」流程：在預留信箱接收驗證碼即可自助重置（模擬系統無需護照號）。重置後建議立即登入並檢查最近交易。" },
          { q: "收不到登入驗證碼怎麼辦？", a: "按以下順序排查：①檢查信箱的垃圾郵件/促銷郵件資料夾（寄件人為 noreply@suveoo.com，經 Cloudflare Email Service 發出）；②注意 60 秒重發冷卻與每小時 5 封的頻控——頻繁點擊「重新發送」只會更慢；③驗證碼 10 分鐘內有效、單碼限 5 次嘗試，過期請重新取得；④確認信箱地址拼寫無誤。因你方信箱服務商拒收或延遲導致的送達問題不屬於平台過錯，可更換信箱服務商測試。" },
          { q: "註冊時一定要填真實姓名嗎？", a: "不需要。這是模擬銀行系統，姓名僅作介面展示，可使用化名；但請勿冒用真實他人身份並宣稱係其本人，也不得使用侵犯他人商標或姓名權的標識。開戶即時簽發 4 張簽帳卡（餘額為隨機模擬資料，合計約 ¥1 億量級）與 1 張信用卡（額度 ¥320,000）。" },
          { q: "如何開啟/關閉兩步驗證（2FA）？", a: "進入「安全中心」，切換「兩步驗證」開關：開啟時系統先向你預留信箱發送驗證碼，輸入正確後立即生效。開啟後，登入需額外驗證碼，紅色級操作（大額轉帳、基金申購、卡片凍結等）也要求更強驗證。關閉 2FA 同樣需要 OTP 確認，防止他人替你關閉。" },
          { q: "可以刪除帳戶嗎？", a: "可以。發送郵件至 support@suveoo.com 說明來意，我們將刪除帳戶、卡片、流水與持倉資料（儲存期限詳見《隱私政策》第八條）。刪除不影響你在本平台瀏覽公開頁面。" },
        ],
      },
      {
        name: "轉帳與支付",
        items: [
          { q: "為什麼跨行轉帳和跨境匯款是灰色的？", a: "模擬銀行系統僅支援行內轉帳（Suveoo 16 位虛擬卡號之間）。跨行與跨境匯款入口以灰色展示並在點擊時說明，這是「模擬」邊界的顯式呈現，而非功能缺陷。外匯牌價與兌換計算機可作為跨境情境的示範替代。" },
          { q: "什麼操作需要確認？什麼是綠色/黃色/紅色？", a: "三色分級由伺服器策略引擎按操作類型與金額即時判定：綠色（查詢、帳單分析、聯絡人檢索等唯讀操作）自動執行；黃色（轉帳、限額調整、訂閱取消等）需要你確認；紅色（大額轉帳、基金申購贖回、存款開戶、卡片凍結、改密等）需要兩段式確認加信箱 OTP 強驗證。分級與金額、日累計相關，用戶端展示不構成分級依據。" },
          { q: "確認卡裡的 grant 是什麼？為什麼 120 秒後就失效？", a: "grant_hash 是對你確認內容（收款人、金額、幣別等授權欄位）的加密快照綁定：有效期 120 秒、一次性消費、與你的帳戶綁定。確認時系統逐欄位比對——任何參數變化都會使授權失效（CONSENT_INVALIDATED），這保證「你確認過的」與「實際執行的」完全一致。過期或已使用的 grant 重新發起操作即可獲得新的 grant。" },
          { q: "提示餘額不足，但我明明有錢？", a: "可用餘額 = 卡餘額 − 鎖定資金。鎖定期資金（如「生日訂花」長程任務的預算）在卡片上以黃色徽章單獨標註，任務完成時資金付出，取消任務或履約失敗時自動解鎖返還。請檢查是否選擇了餘額不足的付款卡，或資金正處於鎖定狀態。" },
          { q: "預約轉帳可以取消嗎？錢會退回嗎？", a: "可以。在「預約轉帳」頁對待執行任務點擊取消：若任務已鎖定資金，系統自動執行補償（資金解鎖返還），任務標記為已補償。到點履約還有到期掃描備援，即使排程事件遺失也會在清單讀取時補履約。" },
          { q: "轉帳後對方/我能收到通知嗎？", a: "會。行內轉帳完成後，轉出方與轉入方（如配置了信箱）都會收到郵件通知；填寫備註時備註內容將包含在郵件中。郵件由 noreply@suveoo.com 經 Cloudflare Email Service 發出。" },
        ],
      },
      {
        name: "財富管理",
        items: [
          { q: "基金淨值和收益率是真實資料嗎？", a: "不是。全部淨值、歷史業績、費率與存款利率均為靜態編造的示範資料，僅用於展示介面與計算鏈路，不代表任何真實產品，也不構成投資建議。這是「模擬銀行系統」聲明的組成部分。" },
          { q: "為什麼我無法申購某隻基金？", a: "觸發了適當性保護：產品風險等級（R1–R5）必須不高於你的風險承受等級（PR1–PR5，由註冊時的八題測評折算，可在安全中心重新測評）。不匹配時伺服器拒絕（APPROPRIATENESS_MISMATCH），介面會預先提示——即使繞過介面直接提交，驗證執行環境也會攔截。" },
          { q: "持倉市值是怎麼算的？", a: "持倉市值 ≈ 本金 × 當前淨值 ÷ 成本淨值，用於資產總覽與儀表板示範；「今日收益」為基於模擬淨值的近似浮動盈虧。真實基金的費用、分紅與稅費不在示範範圍內。" },
          { q: "外匯兌換有額度限制嗎？", a: "有。模擬年度換匯額度為 $50,000 等值，用於示範額度不變量校驗：額度不足時兌換被拒絕。牌價為靜態示範資料，與真實市場無關；兌換為黃色操作，需兩段式確認。" },
          { q: "贖回基金為什麼也要紅色驗證？", a: "贖回直接減少你的資產，與申購同屬高影響操作，因此統一要求兩段式確認加信箱 OTP。這是「操作影響越大、驗證越強」分級原則的體現。" },
        ],
      },
      {
        name: "訂閱與帳單",
        items: [
          { q: "如何取消訂閱？", a: "在「帳單與訂閱」頁對活躍訂閱點擊「取消訂閱」：黃色兩段式確認後立即生效，訂閱狀態轉為已取消，提醒同步關閉。取消不可撤銷，但你可以隨時重新關注類似產品（示範語義）。" },
          { q: "「低使用率」標記是什麼？", a: "使用率低於 20% 的活躍訂閱會觸發醒目提示（含使用率與月費），這是對真實銀行 App「訂閱提醒」功能的示範，幫你識別閒置扣費——頁面同時提供一鍵讓 AI 分析並退掉最少用訂閱的入口。" },
          { q: "自動扣費可以關閉嗎？", a: "可以。每條訂閱提供「提醒」開關（關閉後不再產生扣費提醒通知），帳單也支援一鍵繳費與自動扣費開關示範。" },
        ],
      },
      {
        name: "隱私與 Cookie",
        items: [
          { q: "你們設定哪些 Cookie？", a: "全部為第一方：會話權杖（1 小時，localStorage）、語言偏好（1 年）、Cookie 同意狀態（1 年）、分析同意標記（1 年）。分析類 Cookie（GA4 的 _ga 系列，2 年）僅在你明確選擇「接受全部」或開啟分析開關後才由 Google 設定。完整清單、用途與期限見《Cookie 政策》第 2 條。" },
          { q: "我如何更改或撤回 Cookie 同意？", a: "兩個入口即時生效：頁尾「Cookie Preferences」按鈕，或任意頁面首次造訪約 4 秒後出現的偏好卡。你可以單獨開關「分析與統計」，也可以僅必要/接受全部。撤回後 GA4 立即停止測量，分析 Cookie 隨瀏覽器清除策略刪除。" },
          { q: "拒絕分析 Cookie 後你們還能看到我嗎？", a: "不能。拒絕時 GA4 進入 Cookieless 模式：不設定 Cookie、不讀取裝置標識，僅發送不含用戶端 ID 的無 Cookie 度量 ping，用於聚合估算「大約多少人拒絕」；這些資料不進入你的個體報告，也無法關聯到你的帳戶。" },
          { q: "AI 對話會被記錄嗎？", a: "對話經本平台伺服器代理轉發至模型服務商（詳見《隱私政策》第六條）；對話歷史隨會話保留，你可隨時發起新會話隔離上下文。傳輸內容不含密碼、權杖、驗證碼與完整卡號；AI 的輸出只是「提議」，任何影響資金的動作仍需你確認。" },
        ],
      },
    ],
    trouble: [
      { q: "頁面一直顯示載入中或無回應？", a: "本平台內建三層自癒：請求逾時自動換連線重試、20 秒啟動看門狗自動重新整理、Service Worker 離線備援。若仍異常：①手動重新整理一次；②清除本站站台資料後重試；③檢查是否有代理/防火牆攔截。若反覆出現，請連同時間點報告至 support@suveoo.com。" },
      { q: "介面文字出現「xxx.yyy」形式的裸鍵？", a: "這通常是語言包載入被中斷所致，重新整理一次即可恢復；若持續出現，請告知具體頁面與語言組合。" },
      { q: "AI 回答一直沒有輸出？", a: "AI 對話依賴模型服務商可用性，高峰期可能偶發逾時；點擊輸入框重新發送即可重試。對話不會因重試產生費用（模擬系統）。" },
      { q: "收到的郵件格式混亂或缺失？", a: "部分信箱用戶端對 HTML 郵件渲染不一致，正文關鍵資訊（驗證碼、金額、流水號）始終以純文字同時提供；若缺失請回報至 support@suveoo.com 並附郵件截圖。" },
    ],
    antifraud: [
      "轉帳前核實收款人姓名與帳號——行內轉帳支援從常用收款人選擇，避免手輸錯誤；",
      "不向陌生人或未核實的「安全帳戶」轉帳——任何要求你轉入所謂安全帳戶的都是詐騙；",
      "驗證碼與密碼絕不告訴任何人（包括自稱銀行客服或 Suveoo 團隊的聯繫者）——本平台永遠不會索要這些資訊；",
      "AI 的回覆不構成投資建議，涉及資金的操作以確認卡展示的精確快照為準；",
      "警惕偽裝成交易備註、商戶說明中的指令性文字——本平台驗證執行環境會自動將其標記為不可信來源並拒絕執行，但你也應保持警惕；",
      "來自本平台的郵件寄件人恆為 noreply@suveoo.com，其他網域發送的「Suveoo 郵件」均可判定為偽造；",
      "示範資料無真實價值——任何誘導你為「提現 Suveoo 餘額」付費的都是詐騙。",
    ],
    ai: {
      intro: "Suveoo AI 的安全模型可以概括為一句話：AI 只能提議，確定性驗證決定執行。模型不持有任何帳本權限，其輸出必須經編譯與逐道校驗後才能生效——以下五道驗證構成這道防線：",
      items: [
        "① Policy —— 三色分級（綠/黃/紅）與硬性限額：按操作類型與金額自動判定，AI 通道另有單筆 ¥5,000 / 單日 ¥10,000 硬上限；",
        "② Consent —— 參數級同意綁定（grant_hash）：你在確認卡中看到的精確快照即授權範圍，參數一變即失效；",
        "③ Provenance —— 資料來源污染追蹤：來自交易備註、OCR 等外部文字的取值不得作為收款人/金額等授權欄位；",
        "④ Invariants —— 金融不變量：餘額充足性、產品適當性（R ≤ PR）、外匯額度等逐項校驗；",
        "⑤ Replay —— 冪等重放防護：每筆操作唯一 nonce，重放一律拒絕，不會二次扣款。",
      ],
      chain: "執行鏈路：LLM 提議 → BankAction IR → 五道驗證 → VERIFIED → 帳本。AI 無法繞過任何一道——這不是策略聲明，而是程式結構：不存在繞過驗證直接寫帳的路徑。",
    },
  },
  "en-US": {
    guide: [
      { t: "Open an account", a: "Email code + 8-question risk assessment; 4 debit cards and 1 credit card issued instantly.", href: "/account/register", cta: "Register now" },
      { t: "Chat is banking", a: "On /ai start transfers, bill analysis and wealth comparisons in natural language — the AI proposes, you confirm.", href: "/ai", cta: "Try Suveoo AI" },
      { t: "Transfer in 3 steps", a: "Pick a funding card → enter payee → confirm within the 120s YELLOW card; large amounts escalate to email OTP.", href: "/transfer/intrabank", cta: "Transfer" },
      { t: "Manage cards", a: "Aliases, default card, single/daily limits and freezing; freezing is RED and needs an OTP.", href: "/account/cards", cta: "My cards" },
      { t: "Wealth & calculators", a: "8 simulated funds + 6 deposit plans + 10 visual calculators with shareable URL parameters.", href: "/wealth", cta: "Wealth" },
      { t: "Security Center", a: "2FA toggle, risk-assessment retake, password change and audit trail.", href: "/account/security", cta: "Security" },
    ],
    cats: [
      {
        name: "Account & Sign-in",
        items: [
          { q: "Which sign-in methods are supported?", a: "Two identifiers work: your registration email or a 16-digit virtual card number issued by this Platform, plus your password. With two-factor verification enabled you also enter an email code (valid 5 minutes). Each code allows at most 5 attempts to prevent brute-force guessing." },
          { q: "I'm locked out after failed logins — what now?", a: "Five consecutive wrong passwords trigger a 15-minute lockout, a standard anti-brute-force measure that lifts automatically. Forgot your password? Use “Forgot password”: receive a code at your registered email and reset it yourself (the demo needs no passport number). After resetting, sign in and review recent transactions." },
          { q: "I don't receive the verification code.", a: "Troubleshoot in order: ① check spam/promotions folders (sender noreply@suveoo.com via Cloudflare Email Service); ② note the 60-second resend cooldown and the 5-emails-per-hour cap — repeated clicking only slows things down; ③ codes are valid 10 minutes with 5 attempts per code, request a new one after expiry; ④ verify the email spelling. Delivery issues caused by your email provider are outside the Platform's control." },
          { q: "Do I need my real name to register?", a: "No. This is a simulated banking system — the name is display-only and a pseudonym is fine; but do not impersonate a real person or use marks infringing others' trademarks or name rights. On signup the system instantly issues 4 debit cards (random simulated balances totaling roughly ¥100M) and 1 credit card (¥320,000 limit)." },
          { q: "How do I enable/disable two-factor (2FA)?", a: "Security Center → toggle “Two-factor”: enabling first emails a code, and it takes effect once entered. Thereafter sign-in needs an extra code, and RED-tier operations demand stronger verification. Disabling 2FA also requires an OTP so nobody can turn it off for you." },
          { q: "Can I delete my account?", a: "Yes. Email support@suveoo.com and we will delete account, cards, ledger and holdings data (retention in Article 8 of the Privacy Policy). Public pages remain browsable afterwards." },
        ],
      },
      {
        name: "Transfers & Payments",
        items: [
          { q: "Why are interbank and cross-border transfers greyed out?", a: "The simulated system supports intrabank transfers only (between Suveoo 16-digit virtual accounts). The interbank/cross-border entries are shown greyed with an explanation on click — an explicit display of the simulation boundary, not a defect. FX quotes and the converter serve as the cross-border demonstration alternative." },
          { q: "What needs confirmation? What are green/yellow/red?", a: "The server-side policy engine grades in real time by operation type and amount: GREEN (read-only: queries, bill analysis, contact search) executes automatically; YELLOW (transfers, limit changes, subscription cancellation, etc.) requires your confirmation; RED (large transfers, fund subscription/redemption, deposit opening, card freezing, password change) requires two-step confirmation plus email OTP. Grading depends on type and daily accumulation; client-side display is not the basis." },
          { q: "What is the grant on the confirmation card? Why does it expire in 120 seconds?", a: "grant_hash is a cryptographic snapshot binding of exactly what you confirmed (payee, amount, currency — the authorization fields): valid 120 seconds, consumed once, bound to your account. At confirmation every field is compared — any change voids the authorization (CONSENT_INVALIDATED), guaranteeing “what you confirmed = what executes”. For expired/used grants, simply start the operation again for a new grant." },
          { q: "It says insufficient balance, but I have money?", a: "Available = card balance − locked funds. Locked amounts (e.g. the “birthday flowers” task budget) are shown as a yellow badge on the card; spent on completion, unlocked automatically on cancellation or fulfilment failure. Check whether the funding card lacks balance or funds are locked." },
          { q: "Can I cancel a scheduled transfer? Do I get the money back?", a: "Yes — on the Scheduled Transfers page, cancel a pending task: if funds were locked, compensation runs automatically (unlock and return) and the task is marked compensated. Due fulfilment also has a scan fallback (sweepDue), so tasks complete on list read even if a scheduling event is lost." },
          { q: "Do sender and recipient get notified after a transfer?", a: "Yes — after an intrabank transfer both parties (where an email is configured) receive notification emails; the memo is included. Mail is sent from noreply@suveoo.com via Cloudflare Email Service." },
        ],
      },
      {
        name: "Wealth Management",
        items: [
          { q: "Are fund NAVs and returns real data?", a: "No. All NAVs, historical performance, fees and deposit rates are static fabricated demonstration data for interface and pipeline display only — they represent no real product and constitute no investment advice. This is part of the “simulated banking system” notice." },
          { q: "Why can't I subscribe to a fund?", a: "Appropriateness protection triggered: the product risk level (R1–R5) must not exceed your risk grade (PR1–PR5, from the eight-question assessment at registration; retake it in the Security Center). Mismatches are rejected server-side (APPROPRIATENESS_MISMATCH) with an advance warning in the UI — even bypassing the UI, the verification runtime blocks it." },
          { q: "How is my holdings value computed?", a: "Holding value ≈ principal × current NAV ÷ cost NAV, for the asset overview and dashboard demo; “today's P&L” is an approximate unrealized gain based on simulated NAVs. Real funds' fees, dividends and taxes are out of scope." },
          { q: "Is there a limit on FX conversion?", a: "Yes — a simulated annual quota of $50,000 equivalent demonstrates quota-invariant checking: insufficient quota rejects the conversion. Quotes are static demonstration data unrelated to any real market; conversion is a YELLOW operation requiring two-step confirmation." },
          { q: "Why does redeeming a fund also need RED verification?", a: "Redemption directly reduces your assets — same high impact as subscription — so both uniformly require two-step confirmation plus email OTP. This reflects the grading principle: the bigger the impact, the stronger the verification." },
        ],
      },
      {
        name: "Subscriptions & Bills",
        items: [
          { q: "How do I cancel a subscription?", a: "On “Bills & Subscriptions”, click “Cancel” on an active subscription: effective immediately after the YELLOW two-step confirmation, status switches to cancelled and reminders turn off. Cancellation is irreversible, but you can always re-subscribe to similar products (demo semantics)." },
          { q: "What is the “low usage” highlight?", a: "Active subscriptions under 20% usage trigger a prominent callout (usage rate and monthly fee) — a demonstration of real banking apps' subscription reminders to spot idle charges — plus a one-tap entry to have the AI analyze and cancel the least-used ones." },
          { q: "Can I turn off auto-charges?", a: "Yes — each subscription has a “reminder” switch (off = no more charge reminder notifications), and bills support one-tap payment plus an autopay toggle demonstration." },
        ],
      },
      {
        name: "Privacy & Cookies",
        items: [
          { q: "Which cookies do you set?", a: "All first-party: session token (1 hour, localStorage), language preference (1 year), cookie-consent state (1 year) and the analytics-consent flag (1 year). Analytics cookies (GA4's _ga family, 2 years) are set by Google only after you explicitly choose “Accept all” or enable the analytics switch. Full inventory, purposes and lifetimes: Article 2 of the Cookie Policy." },
          { q: "How do I change or withdraw cookie consent?", a: "Two entry points take effect instantly: the footer “Cookie Preferences” button, or the preference card that appears ~4 seconds after first visiting any page. Toggle “Analytics” independently, or use Necessary-only / Accept all. On withdrawal GA4 stops measuring immediately and analytics cookies are removed per your browser's clearing policy." },
          { q: "If I deny analytics, can you still see me?", a: "No. When denied, GA4 runs in cookieless mode: no cookies are set, no device identifier is read, and only identifier-free cookieless measurement pings are sent for aggregate estimation (roughly how many visitors declined). Those pings carry no identity and never enter your individual reports." },
          { q: "Are AI conversations recorded?", a: "Conversations are proxied server-side to the model provider (see Article 6 of the Privacy Policy); history is retained with the session and you can start a new session anytime to isolate context. Transmissions exclude passwords, tokens, codes and full card numbers; the AI's output is only a “proposal” — anything affecting funds still needs your confirmation." },
        ],
      },
    ],
    trouble: [
      { q: "A page keeps showing loading or doesn't respond?", a: "The Platform has three layers of self-healing: request timeout with connection retry, a 20-second boot watchdog that reloads automatically, and a Service Worker offline fallback. If it still misbehaves: ① refresh manually once; ② clear site data and retry; ③ check for proxy/firewall interception. If it recurs, report the time to support@suveoo.com." },
      { q: "The interface shows raw keys like “xxx.yyy”?", a: "That usually means the language pack load was interrupted — one refresh restores it. If it persists, tell us the page and language combination." },
      { q: "The AI reply never outputs anything?", a: "AI conversations depend on the model provider's availability; occasional timeouts can occur at peak. Click the input and resend. Retries cost nothing (simulated system)." },
      { q: "Emails look broken or miss key details?", a: "Some email clients render HTML inconsistently; the key facts (code, amounts, transaction IDs) are always also present as plain text. If something is missing, report to support@suveoo.com with a screenshot." },
    ],
    antifraud: [
      "Verify the payee name and account before transferring — intrabank transfers support picking from saved payees to avoid typos;",
      "Never transfer to strangers or so-called “safe accounts” — anyone asking you to move funds to a “safe account” is a scammer;",
      "Never share codes or passwords with anyone, including people claiming to be bank staff or the Suveoo team — we will never ask for them;",
      "AI replies are not investment advice; for anything involving funds, the exact snapshot on the confirmation card is authoritative;",
      "Beware of instructive text planted in transaction notes or merchant descriptions — the runtime flags such origins as untrusted and rejects them, but stay alert yourself;",
      "Genuine Platform mail always comes from noreply@suveoo.com — “Suveoo mail” from any other domain is forged;",
      "Demonstration data has no real value — anyone luring you to pay to “withdraw your Suveoo balance” is scamming you.",
    ],
    ai: {
      intro: "Suveoo AI's safety model in one sentence: the AI may only propose; deterministic verification decides execution. The model holds no ledger authority, and its output takes effect only after compilation and per-check validation — these five verifications form that line of defense:",
      items: [
        "① Policy — three-tier grading (green/yellow/red) and hard caps: judged automatically by operation type and amount, with extra AI-channel caps of ¥5,000 single / ¥10,000 daily;",
        "② Consent — parameter-level consent binding (grant_hash): the exact snapshot you see on the confirmation card is the authorization scope; any change voids it;",
        "③ Provenance — taint tracking on data origin: values from external text (transaction notes, OCR) can never occupy authorization fields;",
        "④ Invariants — financial invariants: balance sufficiency, appropriateness (R ≤ PR), FX quota — all checked item by item;",
        "⑤ Replay — idempotent replay protection: a unique nonce per operation; replays are always rejected and never double-charge.",
      ],
      chain: "Execution path: LLM proposes → BankAction IR → five verifications → VERIFIED → ledger. The AI cannot bypass any of them — that is not a policy statement but the code structure: no path exists to write the ledger without passing verification.",
    },
  },
};
