/* docs-cookie.js — Cookie 政策深度内容（三语，由 legal.js 按 S.i18n.lang 取用；结构与 legal-docs 一致） */
window.S = window.S || {};
S.COOKIE_DOCS = {
  "zh-CN": [
    {
      t: "1. 什么是 Cookie 与同类技术",
      ps: ["Cookie 是网站存储在你设备上的小型文本文件，用于在浏览会话之间保留状态与偏好。「同类技术」指与 Cookie 具有类似识别或存储能力的机制，本政策中一并说明。理解它们的差异有助于你理解本平台的隐私实践："],
      ss: [
        { t: "1.1 第一方与第三方", ps: ["第一方 Cookie 由你正在访问的域（suveoo.com）直接设置与读取，仅服务于本平台自身功能；第三方 Cookie 由其他域设置，通常用于跨站追踪或广告。本平台默认不设置任何第三方 Cookie；唯一的第三方脚本 Google Analytics 4 仅在你明确同意后被加载。"] },
        { t: "1.2 会话型与持久型", ps: ["会话型 Cookie 在你关闭浏览器后即被删除；持久型 Cookie 则带到期时间，到期前一直保留（或被你提前清除）。本平台的必要 Cookie 全部为持久型但期限很短（详见第 2 条清单），分析类 Cookie 由 GA4 设置、期限为 2 年（仅在同意后存在）。"] },
        { t: "1.3 本地存储（localStorage / sessionStorage）", ps: ["与 Cookie 同属设备端存储，但不随 HTTP 请求自动发送，容量更大。本平台仅使用一个 localStorage 键（suveoo_token）存放登录会话令牌，属于「必要」类别；详见第 2 条。"] },
        { t: "1.4 指纹识别等追踪技术", ps: ["本平台不使用 Canvas 指纹、字体指纹、行为生物特征等任何形式的隐性追踪技术。"] },
      ],
    },
    {
      t: "2. 我们使用的 Cookie 与本地存储完整清单",
      ps: ["下表穷举本平台设置的全部第一方存储条目。除 GA4 分析类（需你的同意）外，其余均为维持站点运行所必需，无法关闭——但关闭后相应功能（登录、语言记忆）会失效，站点仍可浏览公开内容。"],
      ss: [
        { t: "2.1 必要 Cookie（始终开启）", ps: ["（一）suveoo_token —— 登录会话令牌（JWT），有效期 1 小时，登出即吊销；存放于 localStorage 而非 Cookie。（二）suveoo_lang —— 界面语言偏好，有效期 1 年。（三）suveoo_cookie_consent —— 记录你的 Cookie 同意选择（all/custom/necessary），有效期 1 年；它本身是为了记住你的选择、避免重复打扰而存在，属于合规实践中的「同意记忆」豁免。（四）suveoo_consent_analytics —— 记录你对分析类 Cookie 的单独选择，有效期 1 年，与上一条配套。"] },
        { t: "2.2 分析类 Cookie（仅在你同意后由 Google 设置）", ps: ["启用「分析与统计」后，Google Analytics 4 会设置以 _ga 开头的 Cookie（如 _ga、_ga_<容器ID>），期限最长 2 年，用于区分匿名访客与估算会话数。这些 Cookie 由 Google 以共同处理者身份设置，内容为随机客户端标识，不含任何个人身份信息。"] },
        { t: "2.3 不存在的 Cookie", ps: ["本平台不设置任何广告类 Cookie（如 IDE、IDEA 系列）、任何社交平台分享追踪 Cookie、任何 A/B 实验跨站 Cookie。"] },
      ],
    },
    {
      t: "3. 同意管理：Consent Mode v2 信号映射",
      ps: ["本平台按 Google Consent Mode v2 规范实现同意管理：在页面最早期（任何标签触发之前）将四个同意信号默认设为「拒绝」，随后依据你保存的选择即时调用 update 恢复。三种选择与四个信号的映射关系如下："],
      ss: [
        { t: "3.1 信号清单", ps: ["analytics_storage —— 是否允许分析与统计存储（对应 GA4）；ad_storage —— 是否允许广告存储；ad_user_data —— 是否允许将与广告相关的用户数据发送至 Google；ad_personalization —— 是否允许广告个性化/再营销。本平台不投放广告，后三个信号在任何选择下都不会被用于实际广告活动，但按 v2 规范完整声明与传输。"] },
        { t: "3.2 三种选择的映射", ps: ["「仅必要」：四信号全部 denied；「自定义 · 分析关闭」：与仅必要相同；「自定义 · 分析开启」或「接受全部」：analytics_storage granted，ad_* 仍 denied。即使全部 granted，ad_* 信号对本平台也无实际效果——因为我们没有广告活动。"] },
        { t: "3.3 拒绝时发生什么（Cookieless Ping）", ps: ["当分析存储被拒绝时，GA4 不会设置任何 Cookie、不会读取设备标识，仅发送不含客户端 ID 的无 Cookie 度量 ping，用于聚合估算（如「大约有多少访客拒绝」）。这些 ping 不携带你的身份，也不进入你的个体报告。"] },
        { t: "3.4 即时生效", ps: ["同意状态的任何变更（同意、撤回、自定义保存）都会即时通过 Consent Update 通知 Google 标签并写入 Cookie；从下一次页面加载起按新状态执行，无需刷新。"] },
      ],
    },
    {
      t: "4. Google Analytics 4 处理详情",
      ps: ["在你同意「分析与统计」后，本平台通过 Google Analytics 4（衡量 ID G-KLK499CDQF）收集匿名化的使用统计。本条披露其处理细节。"],
      ss: [
        { t: "4.1 收集的数据", ps: ["页面路径与标题、referrer（来源页）、大致地理区域（由国家/城市级别推断，非精确位置）、设备与浏览器类别、操作系统、屏幕分辨率（非精确）、会话与访问次数、站内事件（页面浏览、AI 对话发起、转账提交与确认、同意行为、注册）。事件参数中除聚合用金额外不含任何账户标识。"] },
        { t: "4.2 不收集的数据", ps: ["不收集：姓名、邮箱、卡号、交易对手方、精确 IP（GA4 默认不存储完整 IP 地址）、任何可反查身份的组合。GA4 事件与你的账户体系完全隔离——即使你已登录，分析事件也不携带用户 ID。"] },
        { t: "4.3 处理者与数据去向", ps: ["处理者为 Google Ireland Limited / Google LLC，数据存储于 Google 的全球数据中心；处理依据为你的同意，处理范围受 Google 与数据控制者之间的数据处理条款约束。本平台与其无任何额外数据共享协议。"] },
      ],
    },
    {
      t: "5. 保存期限",
      ps: ["必要 Cookie 期限均为 1 年（滚动刷新）：suveoo_lang、suveoo_cookie_consent、suveoo_consent_analytics；登录令牌（localStorage suveoo_token）1 小时且登出即吊销。分析类 Cookie（_ga 系列）期限 2 年，由 Google 在你同意后设置；你撤回同意或清除浏览器数据时即被删除。服务端与设备上均不存在超过 2 年期限的任何 Cookie 或本地存储条目。"],
    },
    {
      t: "6. 你的选择与控制权",
      ps: ["你拥有完整且随时可行的控制权，途径有三，效力相同："],
      ss: [
        { t: "6.1 站内偏好面板", ps: ["页脚「Cookie Preferences」或本页任意入口可重新打开偏好面板：两个类别各有独立开关，「保存偏好」即时生效（写入 Cookie 并通知 Google 标签），「接受全部」「仅必要」为快捷预设。"] },
        { t: "6.2 浏览器控制", ps: ["你可以随时在浏览器设置中清除本站 Cookie 与站点数据——清除后语言偏好重置、登录状态失效、同意状态回到「未选择」，分析测量随之停止。你也可以阻止本站设置 Cookie，本平台所有公开页面在不接受任何 Cookie 的情况下仍可正常浏览。"] },
        { t: "6.3 关于 Do Not Track", ps: ["DNT 尚无统一的法律定义与行业标准语义；本平台以「默认拒绝 + 主动同意」实现的效果强于 DNT 声明，故未单独实现 DNT 响应头处理。"] },
      ],
    },
    {
      t: "7. 政策的变更",
      ps: ["本政策可能随 Cookie 实践变化而更新（如新增分析工具、调整期限）。更新将在本页发布并同步「最近更新」日期；构成重大变更的（新增跟踪类别等），将在重新征得同意前不启用相应技术。历史版本可经 support@suveoo.com 索取。"],
    },
    {
      t: "8. 联系我们",
      ps: ["Cookie 与隐私事务：support@suveoo.com（一般）或 security@suveoo.com（安全）。更多信息请参阅《隐私政策》与《服务条款》。"],
    },
  ],
  "zh-TW": [
    {
      t: "1. 什麼是 Cookie 與同類技術",
      ps: ["Cookie 是網站儲存在你裝置上的小型文字檔，用於在瀏覽工作階段之間保留狀態與偏好。「同類技術」指與 Cookie 具有類似識別或儲存能力的機制，本政策中一併說明。理解它們的差異有助於你理解本平台的隱私實務："],
      ss: [
        { t: "1.1 第一方與第三方", ps: ["第一方 Cookie 由你正在造訪的網域（suveoo.com）直接設定與讀取，僅服務於本平台自身功能；第三方 Cookie 由其他網域設定，通常用於跨站追蹤或廣告。本平台預設不設定任何第三方 Cookie；唯一的第三方腳本 Google Analytics 4 僅在你明確同意後被載入。"] },
        { t: "1.2 工作階段型與持久型", ps: ["工作階段型 Cookie 在你關閉瀏覽器後即被刪除；持久型 Cookie 則帶到期時間，到期前一直保留（或被你提前清除）。本平台的必要 Cookie 全部為持久型但期限很短（詳見第 2 條清單），分析類 Cookie 由 GA4 設定、期限為 2 年（僅在同意後存在）。"] },
        { t: "1.3 本地儲存（localStorage / sessionStorage）", ps: ["與 Cookie 同屬裝置端儲存，但不隨 HTTP 請求自動發送，容量更大。本平台僅使用一個 localStorage 鍵（suveoo_token）存放登入會話權杖，屬於「必要」類別；詳見第 2 條。"] },
        { t: "1.4 指紋識別等追蹤技術", ps: ["本平台不使用 Canvas 指紋、字型指紋、行為生物特徵等任何形式的隱性追蹤技術。"] },
      ],
    },
    {
      t: "2. 我們使用的 Cookie 與本地儲存完整清單",
      ps: ["下表窮舉本平台設定的全部第一方儲存條目。除 GA4 分析類（需你的同意）外，其餘均為維持站台運行所必需，無法關閉——但關閉後相應功能（登入、語言記憶）會失效，站台仍可瀏覽公開內容。"],
      ss: [
        { t: "2.1 必要 Cookie（始終開啟）", ps: ["（一）suveoo_token —— 登入會話權杖（JWT），有效期 1 小時，登出即撤銷；存放於 localStorage 而非 Cookie。（二）suveoo_lang —— 介面語言偏好，有效期 1 年。（三）suveoo_cookie_consent —— 記錄你的 Cookie 同意選擇（all/custom/necessary），有效期 1 年；它本身是為了記住你的選擇、避免重複打擾而存在，屬於合規實務中的「同意記憶」豁免。（四）suveoo_consent_analytics —— 記錄你對分析類 Cookie 的單獨選擇，有效期 1 年，與上一條配套。"] },
        { t: "2.2 分析類 Cookie（僅在你同意後由 Google 設定）", ps: ["啟用「分析與統計」後，Google Analytics 4 會設定以 _ga 開頭的 Cookie（如 _ga、_ga_<容器ID>），期限最長 2 年，用於區分匿名訪客與估算會話數。這些 Cookie 由 Google 以共同處理者身份設定，內容為隨機用戶端標識，不含任何個人身份資訊。"] },
        { t: "2.3 不存在的 Cookie", ps: ["本平台不設定任何廣告類 Cookie（如 IDE、IDEA 系列）、任何社交平台分享追蹤 Cookie、任何 A/B 實驗跨站 Cookie。"] },
      ],
    },
    {
      t: "3. 同意管理：Consent Mode v2 訊號映射",
      ps: ["本平台按 Google Consent Mode v2 規範實現同意管理：在頁面最早期（任何標籤觸發之前）將四個同意訊號預設為「拒絕」，隨後依據你保存的選擇即時呼叫 update 恢復。三種選擇與四個訊號的映射關係如下："],
      ss: [
        { t: "3.1 訊號清單", ps: ["analytics_storage —— 是否允許分析與統計儲存（對應 GA4）；ad_storage —— 是否允許廣告儲存；ad_user_data —— 是否允許將與廣告相關的用戶資料發送至 Google；ad_personalization —— 是否允許廣告個人化/再行銷。本平台不投放廣告，後三個訊號在任何選擇下都不會被用於實際廣告活動，但按 v2 規範完整聲明與傳輸。"] },
        { t: "3.2 三種選擇的映射", ps: ["「僅必要」：四訊號全部 denied；「自訂 · 分析關閉」：與僅必要相同；「自訂 · 分析開啟」或「接受全部」：analytics_storage granted，ad_* 仍 denied。即使全部 granted，ad_* 訊號對本平台也無實際效果——因為我們沒有廣告活動。"] },
        { t: "3.3 拒絕時發生什麼（Cookieless Ping）", ps: ["當分析儲存被拒絕時，GA4 不會設定任何 Cookie、不會讀取裝置標識，僅發送不含用戶端 ID 的無 Cookie 度量 ping，用於聚合估算（如「大約有多少訪客拒絕」）。這些 ping 不攜帶你的身份，也不進入你的個體報告。"] },
        { t: "3.4 即時生效", ps: ["同意狀態的任何變更（同意、撤回、自訂保存）都會即時透過 Consent Update 通知 Google 標籤並寫入 Cookie；從下一次頁面載入起按新狀態執行，無需重新整理。"] },
      ],
    },
    {
      t: "4. Google Analytics 4 處理詳情",
      ps: ["在你同意「分析與統計」後，本平台透過 Google Analytics 4（衡量 ID G-KLK499CDQF）收集匿名化的使用統計。本條揭露其處理細節。"],
      ss: [
        { t: "4.1 收集的資料", ps: ["頁面路徑與標題、referrer（來源頁）、大致地理區域（由國家/城市級別推斷，非精確位置）、裝置與瀏覽器類別、作業系統、螢幕解析度（非精確）、會話與訪問次數、站內事件（頁面瀏覽、AI 對話發起、轉帳提交與確認、同意行為、註冊）。事件參數中除聚合用金額外不含任何帳戶標識。"] },
        { t: "4.2 不收集的資料", ps: ["不收集：姓名、信箱、卡號、交易對手方、精確 IP（GA4 預設不儲存完整 IP 位址）、任何可反查身份的組合。GA4 事件與你的帳戶體系完全隔離——即使你已登入，分析事件也不攜帶用戶 ID。"] },
        { t: "4.3 處理者與資料去向", ps: ["處理者為 Google Ireland Limited / Google LLC，資料儲存於 Google 的全球資料中心；處理依據為你的同意，處理範圍受 Google 與資料控制者之間的資料處理條款約束。本平台與其無任何額外資料共享協議。"] },
      ],
    },
    {
      t: "5. 保存期限",
      ps: ["必要 Cookie 期限均為 1 年（滾動刷新）：suveoo_lang、suveoo_cookie_consent、suveoo_consent_analytics；登入權杖（localStorage suveoo_token）1 小時且登出即撤銷。分析類 Cookie（_ga 系列）期限 2 年，由 Google 在你同意後設定；你撤回同意或清除瀏覽器資料時即被刪除。伺服器與裝置上均不存在超過 2 年期限的任何 Cookie 或本地儲存條目。"],
    },
    {
      t: "6. 你的選擇與控制權",
      ps: ["你擁有完整且隨時可行的控制權，途徑有三，效力相同："],
      ss: [
        { t: "6.1 站內偏好面板", ps: ["頁尾「Cookie Preferences」或本頁任意入口可重新開啟偏好面板：兩個類別各有獨立開關，「保存偏好」即時生效（寫入 Cookie 並通知 Google 標籤），「接受全部」「僅必要」為快捷預設。"] },
        { t: "6.2 瀏覽器控制", ps: ["你可以隨時在瀏覽器設定中清除本站 Cookie 與站台資料——清除後語言偏好重置、登入狀態失效、同意狀態回到「未選擇」，分析測量隨之停止。你也可以阻止本站設定 Cookie，本平台所有公開頁面在不接受任何 Cookie 的情況下仍可正常瀏覽。"] },
        { t: "6.3 關於 Do Not Track", ps: ["DNT 尚無統一的法律定義與行業標準語義；本平台以「預設拒絕 + 主動同意」實現的效果強於 DNT 聲明，故未單獨實現 DNT 回應標頭處理。"] },
      ],
    },
    {
      t: "7. 政策的變更",
      ps: ["本政策可能隨 Cookie 實務變化而更新（如新增分析工具、調整期限）。更新將在本頁發布並同步「最近更新」日期；構成重大變更的（新增追蹤類別等），將在重新徵得同意前不啟用相應技術。歷史版本可經 support@suveoo.com 索取。"],
    },
    {
      t: "8. 聯絡我們",
      ps: ["Cookie 與隱私事務：support@suveoo.com（一般）或 security@suveoo.com（安全）。更多資訊請參閱《隱私政策》與《服務條款》。"],
    },
  ],
  "en-US": [
    {
      t: "1. What Cookies and Similar Technologies Are",
      ps: ["Cookies are small text files a website stores on your device to preserve state and preferences across browsing sessions. “Similar technologies” refers to mechanisms with comparable identification or storage capabilities, covered here as well. Understanding the differences helps you make sense of this Platform's privacy practices:"],
      ss: [
        { t: "1.1 First-party vs third-party", ps: ["First-party cookies are set and read by the domain you are visiting (suveoo.com) and serve only this Platform's own functions; third-party cookies are set by other domains, typically for cross-site tracking or advertising. The Platform sets no third-party cookies by default; the only third-party script, Google Analytics 4, is loaded solely after your explicit consent."] },
        { t: "1.2 Session vs persistent", ps: ["Session cookies are deleted when you close your browser; persistent cookies carry an expiry and remain until it passes (or you clear them earlier). All of the Platform's necessary cookies are persistent but short-lived (see the inventory in Article 2); analytics cookies are set by GA4 with a 2-year maximum lifetime and exist only after you consent."] },
        { t: "1.3 Local storage (localStorage / sessionStorage)", ps: ["Device-side storage like cookies, but not automatically sent with HTTP requests and larger in capacity. The Platform uses a single localStorage key (suveoo_token) to hold the login session token, which belongs to the “necessary” category; see Article 2."] },
        { t: "1.4 Fingerprinting and covert tracking", ps: ["The Platform uses no canvas fingerprinting, font fingerprinting, behavioral biometrics or any other form of covert tracking."] },
      ],
    },
    {
      t: "2. Complete Inventory of Cookies and Local Storage We Use",
      ps: ["The table below exhaustively lists every first-party storage entry the Platform sets. Except for GA4 analytics (which requires your consent), all are strictly necessary to run the site and cannot be switched off — doing so would break the corresponding features (login, language memory), though public pages would remain browsable."],
      ss: [
        { t: "2.1 Necessary cookies (always on)", ps: ["(1) suveoo_token — login session token (JWT), valid 1 hour, revoked at logout; stored in localStorage rather than a cookie. (2) suveoo_lang — interface language preference, 1 year. (3) suveoo_cookie_consent — records your cookie choice (all/custom/necessary), 1 year; it exists to remember your choice and avoid re-prompting, a recognized “consent memory” exemption. (4) suveoo_consent_analytics — records your separate choice about analytics cookies, 1 year, paired with the previous entry."] },
        { t: "2.2 Analytics cookies (set by Google only after you consent)", ps: ["With “Analytics” enabled, Google Analytics 4 sets cookies prefixed with _ga (e.g. _ga, _ga_<container ID>) with a maximum lifetime of 2 years, used to distinguish anonymous visitors and estimate sessions. They are set by Google as a joint controller and contain random client identifiers with no personal information."] },
        { t: "2.3 Cookies that do not exist", ps: ["The Platform sets no advertising cookies (e.g. the IDE/IDEA families), no social-platform share-tracking cookies, and no cross-site A/B experiment cookies."] },
      ],
    },
    {
      t: "3. Consent Management: Consent Mode v2 Signal Mapping",
      ps: ["The Platform implements consent per Google Consent Mode v2: at the earliest point of each page — before any tag fires — all four consent signals default to “denied”, and your saved choice is then restored immediately via an update call. The mapping between the three choices and the four signals:"],
      ss: [
        { t: "3.1 The signals", ps: ["analytics_storage — whether analytics storage is allowed (GA4); ad_storage — whether advertising storage is allowed; ad_user_data — whether ad-related user data may be sent to Google; ad_personalization — whether advertising personalization/remarketing is allowed. The Platform runs no advertising, so the last three signals are never used for actual ad activity under any choice — but they are fully declared and transmitted per the v2 specification."] },
        { t: "3.2 Mapping of the three choices", ps: ["“Necessary only”: all four signals denied. “Custom · analytics off”: identical to necessary-only. “Custom · analytics on” or “Accept all”: analytics_storage granted while ad_* remain denied. Even when granted, the ad_* signals have no practical effect here because we run no ad campaigns."] },
        { t: "3.3 What happens when denied (cookieless pings)", ps: ["When analytics storage is denied, GA4 sets no cookies and reads no device identifier; it only sends identifier-free cookieless measurement pings for aggregate estimation (e.g. roughly how many visitors declined). These pings carry no identity and never appear in your individual reports."] },
        { t: "3.4 Immediate effect", ps: ["Any change to your consent (grant, withdrawal, custom save) is immediately transmitted to the Google tag via a Consent Update and written to cookies; the new state applies from your next page load with no refresh needed."] },
      ],
    },
    {
      t: "4. Google Analytics 4 Processing Details",
      ps: ["After you consent to “Analytics”, this Platform collects anonymized usage statistics via Google Analytics 4 (measurement ID G-KLK499CDQF). This Article discloses the processing in detail."],
      ss: [
        { t: "4.1 Data collected", ps: ["Page path and title, referrer, coarse geographic region (country/city level inference, not precise location), device and browser category, operating system, screen resolution (non-precise), session and visit counts, and in-site events (page views, AI conversations started, transfer submissions and confirmations, consent actions, registration). Event parameters carry no account identifiers apart from amounts used in aggregate."] },
        { t: "4.2 Data not collected", ps: ["Not collected: name, email, card numbers, transaction counterparties, precise IP (GA4 by default does not store full IP addresses), or any combination that could re-identify you. GA4 events are fully decoupled from your account — even when logged in, analytics events carry no user ID."] },
        { t: "4.3 Processor and data flows", ps: ["The processor is Google Ireland Limited / Google LLC, with data stored across Google's global data centers; the processing basis is your consent, and its scope is governed by the data-processing terms between Google and the controller. The Platform has no additional data-sharing agreements with Google."] },
      ],
    },
    {
      t: "5. Retention Periods",
      ps: ["Necessary cookies last 1 year (rolling refresh): suveoo_lang, suveoo_cookie_consent, suveoo_consent_analytics; the login token (localStorage suveoo_token) lasts 1 hour and is revoked at logout. Analytics cookies (the _ga family) last up to 2 years, set by Google after you consent; they are deleted when you withdraw consent or clear your browser data. No cookie or local-storage entry older than 2 years exists on the server or your device."],
    },
    {
      t: "6. Your Choices and Control",
      ps: ["You have complete, always-available control through three equivalent routes:"],
      ss: [
        { t: "6.1 In-site preference panel", ps: ["The footer “Cookie Preferences” (or any entry point on this page) reopens the preference panel: each category has its own switch, “Save preferences” takes effect instantly (writing cookies and notifying the Google tag), and “Accept all” / “Necessary only” are quick presets."] },
        { t: "6.2 Browser controls", ps: ["You can clear this site's cookies and site data anytime in your browser settings — doing so resets language preference, ends your login state, and returns consent to “not chosen”, stopping analytics measurement. You may also block cookies for this site entirely; all public pages remain fully browsable without any cookies."] },
        { t: "6.3 On Do Not Track", ps: ["DNT lacks a unified legal definition and standard semantics; this Platform's “deny by default + opt-in analytics” delivers stronger protection than a DNT header, so a separate DNT response handler is not implemented."] },
      ],
    },
    {
      t: "7. Changes to This Policy",
      ps: ["This Policy may be updated as our cookie practices evolve (new analytics tools, changed lifetimes). Updates are published on this page with the “Last updated” date refreshed; material changes (such as adding a tracking category) will not activate the relevant technology without re-obtaining your consent. Historical versions are available at support@suveoo.com."],
    },
    {
      t: "8. Contact Us",
      ps: ["Cookie and privacy matters: support@suveoo.com (general) or security@suveoo.com (security). For more information, see the Privacy Policy and the Terms of Service."],
    },
  ],
};
