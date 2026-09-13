/* docs-about.js — 关于页深度内容（三语，由 about.js 按 S.i18n.lang 取用；结构与 legal-docs 一致） */
window.S = window.S || {};
S.ABOUT_DOCS = {
  "zh-CN": [
    {
      t: "核心命题：用确定性驯服概率性",
      ps: ["银行业的下一个十年，绕不开一个根本矛盾：大模型是概率系统——会出错、会被注入、会漂移；而账本要求每一分钱的每一次变动都可解释、可重放、可追责。行业主流的回答是更长的提示词、更多的安全对齐训练；Suveoo 的回答是架构：把 AI 的输出在协议层面降级为「提议」（Proposal），提议必须编译为中间表示，再由一个与模型完全无关的确定性运行时裁决能否执行。AI 在本平台中没有任何直接执行权限——这不是提示词里的客套话，而是代码结构本身。"],
      ss: [
        { t: "执行链路", ps: ["LLM 提议 → BankAction IR（中间表示）→ 五道确定性验证 → VERIFIED → 账本。链路上的每一环都是可独立测试的纯函数或带明确契约的存储操作；任何一道验证不通过，操作即被拒绝，不产生任何账务变更。"] },
        { t: "一句话概括", ps: ["Suveoo 是一个 Agentic Banking Control Plane（银行智能体控制平面）：AI 负责理解与提议，控制平面负责裁决与执行，两者的信任边界被压缩到一个编译-验证环节中，使整个系统的安全性可以被穷举测试。"] },
      ],
    },
    {
      t: "系统架构：五层拓扑",
      ps: ["本平台的全部实现围绕「可审计性」展开，层与层之间只通过明确定义的数据结构通信。"],
      ss: [
        { t: "交互层", ps: ["无构建多页应用（约 50 个静态页面）+ PWA 离线壳。不使用打包器、不使用前端框架——构建链路为零意味着供应链攻击面为零，且仓库中的每一个字节都是浏览器直接执行的字节，评审者无需信任任何转译过程。图表（折线、柱状、环形、桑基、迷你走势）为自研 SVG 实现，无图表库依赖。"] },
        { t: "服务层", ps: ["单一 Cloudflare Worker 承载全部 API：认证（JWT/PBKDF2/限流）、MCP 工具网关（24 个注册工具，手写 JSON-RPC 2.0）、AI 编排器（工具调用往返自编排，单次对话上限 8 轮）、验证运行时与数据 API。选择单体而非微服务，是演示规模下的有意决策：一次代码审阅即可覆盖全部服务端逻辑（当前约 2,400 行）。"] },
        { t: "账本层", ps: ["两个 Durable Object：LedgerDO 以「注册表单例 + 每用户独立 SQLite 实例」托管账本，用户间数据边界由物理隔离保证；SagaDO 负责长程任务编排与到点履约，并带到期扫描兜底（sweepDue），即使调度事件丢失也不会漏单。"] },
        { t: "存储与通知", ps: ["KV 承载全部带 TTL 的会话态（验证码、授权绑定、吊销列表、对话历史）；R2 托管静态资产（不含用户数据）；月度报告由 pdf-lib 按请求即时生成并经鉴权流交付；邮件通知经 Cloudflare Email Service 发出。"] },
        { t: "模型层", ps: ["模型供应商经配置项声明（LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL），密钥经平台密钥管理注入，当前为阿里云百炼·通义千问（Anthropic 兼容接口）。更换供应商时，工具调用编排逻辑零改动——因为往返由本平台代码自行管理，不依赖任何「服务端代连」特性。"] },
      ],
    },
    {
      t: "BankAction IR：一切动作的唯一通道",
      ps: ["任何意图——无论来自表单通道、AI 通道还是定时任务通道——都必须先编译为 BankAction IR 才能触达账本。IR 固定包含：trace_id（bai_ 前缀追踪号）、nonce（一次性随机数，幂等防重放）、intent、facts（字段级事实，每项携带来源 provenance 与信任级 trust）、risk（三色分级与判定理由）、preconditions 与 compensation（补偿路径）。IR 的意义在于：把「不可信的自然语言」与「可信的执行机器」之间的接口压缩成一个可校验的数据结构——从此安全不再依赖模型的行为，而只依赖对 IR 的验证。"],
    },
    {
      t: "五道确定性验证运行时",
      ps: ["每一笔待执行操作依次通过五道验证，任何一道不通过即拒绝。五道验证是本平台的核心资产，其设计目标只有一个：让「AI 出错」成为可被系统捕获的普通事件，而非事故。"],
      ss: [
        { t: "① Policy（策略分级）", ps: ["工具注册表为每个工具声明基础风险级（GREEN 只读自动执行 / YELLOW 需确认 / RED 强验证）；金额硬校验（正数、两位小数、格式穷举拒绝）；AI 通道独立硬限额（单笔 ¥5,000、单日 ¥10,000，仅约束转账与外汇）；日累计越阈自动升级红色。"] },
        { t: "② Consent（同意绑定）", ps: ["授权型操作首次提交返回参数快照与授权哈希（SHA256(意图 ‖ 授权字段 ‖ 用户 ‖ 过期 ‖ nonce)），有效期 120 秒、一次性消费；确认时逐字段与快照比对，任何不一致即 CONSENT_INVALIDATED。该机制把「用户到底同意了什么」变成一个可数学验证的事实。"] },
        { t: "③ Provenance（来源污点）", ps: ["每个字段的信任级由服务端按来源表推导（用户输入可信、模型输出为系统级、商户备注/OCR 不可信），客户端只能声明降级、永远不能自报可信；不可信来源进入授权字段即拒绝（UNTRUSTED_PROVENANCE）。这是对提示注入的结构性免疫。"] },
        { t: "④ Invariants（金融不变量）", ps: ["可用余额 = 余额 − 锁定资金 ≥ 金额；产品风险等级 ≤ 用户 PR 等级（适当性）；外汇额度充足；任何违反即拒绝并返回可读错误码。"] },
        { t: "⑤ Replay（幂等重放）", ps: ["每笔操作携带唯一 nonce，进入不可逆的已消费集合；重放一律拒绝（REPLAY_DETECTED），且不产生二次扣款。"] },
      ],
    },
    {
      t: "三通道同规：安全是架构的属性",
      ps: ["表单通道、AI 通道与定时任务通道共用同一个守卫入口（runGuarded），验证链完全一致；每笔流水的 channel 字段如实记录来源通道，可交叉核对。这证明了本平台最重要的设计论断：安全性不是某个通道的附加功能，而是所有通道共同经过的架构瓶颈。攻击者无法通过「换一条路」绕过任何一道验证——四类 18 个自动化攻击模拟用例（同意篡改、越权、重放、提示注入）持续锁定这一性质。"],
    },
    {
      t: "质量保障：让测试说话",
      ps: ["当前自动化测试套件共 117 项，全部运行在真实 workerd 运行时（vitest + vitest-pool-workers），而非模拟环境：单元测试覆盖金额运算、策略分级、IR 编译、同意绑定、污点检查、不变量、幂等、认证加密与发卡计划；集成测试覆盖注册发卡、静态路由、双通道转账端到端、Saga 补偿与定时任务；攻击模拟覆盖前述四类对抗场景。测试数量随批次演进的轨迹（59 → 90 → 99 → 117）与每次发布的部署版本一一对应，全部可回溯。"],
    },
    {
      t: "安全设计要点与已知边界",
      ps: ["专业系统的标志之一是诚实列出自己没做的事。"],
      ss: [
        { t: "已实现", ps: ["密码 PBKDF2-SHA256 十万轮加盐；会话 JWT 一小时可吊销；验证码仅存哈希且多重限流；Consent 与用户绑定且一次性；授权字段污点追踪；AI 通道硬限额；DEMO_MODE 与生产配置隔离；全部密钥经密钥管理服务注入。"] },
        { t: "已知边界（路线图）", ps: ["KV 为最终一致，存在秒级窗口；Consent 消费目前为 KV 原子操作近似，生产加固方向是迁移至 Durable Object 事务；Passkey（WebAuthn）在规划中，当前红色验证依赖邮箱 OTP 送达；演示环境为单区域部署。这些边界在《安全自评估》文档中有完整记录。"] },
      ],
    },
    {
      t: "模型策略与数据治理",
      ps: ["模型供应商可配置、可替换，切换成本为零；对模型的全部要求只有一条——按工具模式输出合法提议，遵守与否都由验证运行时兜底。对话数据传输遵循最小化（不含密码、令牌、验证码与完整卡号），详见《隐私政策》第六条；平台不收集任何真实身份与真实资金数据。"],
    },
    {
      t: "技术栈与开源致谢",
      ps: ["Cloudflare Workers / KV / Durable Objects / R2 / Email Service（基础设施）；vitest 与 workerd（测试运行时）；pdf-lib（月度报告生成）；Google Analytics 4（仅在获得你的明确同意后启用，Consent Mode v2 默认拒绝）；字体 Inter 与 Noto Sans SC/TC/Mono 依 SIL Open Font License 自托管。除上述外，本平台无任何运行时依赖——无前端框架、无构建器、无服务端第三方库。"],
    },
  ],
  "zh-TW": [
    {
      t: "核心命題：用確定性馴服機率性",
      ps: ["銀行業的下一個十年，繞不開一個根本矛盾：大模型是機率系統——會出錯、會被注入、會漂移；而帳本要求每一分錢的每一次變動都可解釋、可重放、可追責。行業主流的回答是更長的提示詞、更多的安全對齊訓練；Suveoo 的回答是架構：把 AI 的輸出在協議層面降級為「提議」（Proposal），提議必須編譯為中間表示，再由一個與模型完全無關的確定性執行環境裁決能否執行。AI 在本平台中沒有任何直接執行權限——這不是提示詞裡的客套話，而是程式結構本身。"],
      ss: [
        { t: "執行鏈路", ps: ["LLM 提議 → BankAction IR（中間表示）→ 五道確定性驗證 → VERIFIED → 帳本。鏈路上的每一環都是可獨立測試的純函數或帶明確契約的儲存操作；任何一道驗證不通過，操作即被拒絕，不產生任何帳務變更。"] },
        { t: "一句話概括", ps: ["Suveoo 是一個 Agentic Banking Control Plane（銀行智慧體控制平面）：AI 負責理解與提議，控制平面負責裁決與執行，兩者的信任邊界被壓縮到一個編譯-驗證環節中，使整個系統的安全性可以被窮舉測試。"] },
      ],
    },
    {
      t: "系統架構：五層拓撲",
      ps: ["本平台的全部實作圍繞「可稽核性」展開，層與層之間只透過明確定義的資料結構通訊。"],
      ss: [
        { t: "互動層", ps: ["無建置多頁應用（約 50 個靜態頁面）+ PWA 離線殼。不使用打包器、不使用前端框架——建置鏈路為零意味著供應鏈攻擊面為零，且倉庫中的每一個位元組都是瀏覽器直接執行的位元組，評審者無需信任任何轉譯過程。圖表（折線、柱狀、環形、桑基、迷你走勢）為自研 SVG 實作，無圖表庫依賴。"] },
        { t: "服務層", ps: ["單一 Cloudflare Worker 承載全部 API：認證（JWT/PBKDF2/限流）、MCP 工具閘道（24 個註冊工具，手寫 JSON-RPC 2.0）、AI 編排器（工具呼叫往返自編排，單次對話上限 8 輪）、驗證執行環境與資料 API。選擇單體而非微服務，是示範規模下的有意決策：一次程式碼審閱即可覆蓋全部伺服器邏輯（當前約 2,400 行）。"] },
        { t: "帳本層", ps: ["兩個 Durable Object：LedgerDO 以「註冊表單例 + 每用戶獨立 SQLite 實例」託管帳本，用戶間資料邊界由實體隔離保證；SagaDO 負責長程任務編排與到點履約，並帶到期掃描備援（sweepDue），即使排程事件遺失也不會漏單。"] },
        { t: "儲存與通知", ps: ["KV 承載全部帶 TTL 的會話態（驗證碼、授權綁定、撤銷清單、對話歷史）；R2 託管靜態資產（不含用戶資料）；月度報告由 pdf-lib 按請求即時產生並經鑑權流交付；郵件通知經 Cloudflare Email Service 發出。"] },
        { t: "模型層", ps: ["模型供應商經配置項聲明（LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL），金鑰經平台金鑰管理注入，當前為阿里雲百煉·通義千問（Anthropic 相容介面）。更換供應商時，工具呼叫編排邏輯零改動——因為往返由本平台程式碼自行管理，不依賴任何「伺服器代連」特性。"] },
      ],
    },
    {
      t: "BankAction IR：一切動作的唯一通道",
      ps: ["任何意圖——無論來自表單通道、AI 通道還是定時任務通道——都必須先編譯為 BankAction IR 才能觸達帳本。IR 固定包含：trace_id（bai_ 前綴追蹤號）、nonce（一次性隨機數，冪等防重放）、intent、facts（欄位級事實，每項攜帶來源 provenance 與信任級 trust）、risk（三色分級與判定理由）、preconditions 與 compensation（補償路徑）。IR 的意義在於：把「不可信的自然語言」與「可信的執行機器」之間的介面壓縮成一個可校驗的資料結構——從此安全不再依賴模型的行為，而只依賴對 IR 的驗證。"],
    },
    {
      t: "五道確定性驗證執行環境",
      ps: ["每一筆待執行操作依序通過五道驗證，任何一道不通過即拒絕。五道驗證是本平台的核心資產，其設計目標只有一個：讓「AI 出錯」成為可被系統捕獲的普通事件，而非事故。"],
      ss: [
        { t: "① Policy（策略分級）", ps: ["工具註冊表為每個工具聲明基礎風險級（GREEN 唯讀自動執行 / YELLOW 需確認 / RED 強驗證）；金額硬校驗（正數、兩位小數、格式窮舉拒絕）；AI 通道獨立硬限額（單筆 ¥5,000、單日 ¥10,000，僅約束轉帳與外匯）；日累計越閾自動升級紅色。"] },
        { t: "② Consent（同意綁定）", ps: ["授權型操作首次提交返回參數快照與授權雜湊（SHA256(意圖 ‖ 授權欄位 ‖ 用戶 ‖ 到期 ‖ nonce)），有效期 120 秒、一次性消費；確認時逐欄位與快照比對，任何不一致即 CONSENT_INVALIDATED。該機制把「用戶到底同意了什麼」變成一個可數學驗證的事實。"] },
        { t: "③ Provenance（來源污點）", ps: ["每個欄位的信任級由伺服器按來源表推導（用戶輸入可信、模型輸出為系統級、商戶備註/OCR 不可信），用戶端只能聲明降級、永遠不能自報可信；不可信來源進入授權欄位即拒絕（UNTRUSTED_PROVENANCE）。這是對提示注入的結構性免疫。"] },
        { t: "④ Invariants（金融不變量）", ps: ["可用餘額 = 餘額 − 鎖定資金 ≥ 金額；產品風險等級 ≤ 用戶 PR 等級（適當性）；外匯額度充足；任何違反即拒絕並返回可讀錯誤碼。"] },
        { t: "⑤ Replay（冪等重放）", ps: ["每筆操作攜帶唯一 nonce，進入不可逆的已消費集合；重放一律拒絕（REPLAY_DETECTED），且不產生二次扣款。"] },
      ],
    },
    {
      t: "三通道同規：安全是架構的屬性",
      ps: ["表單通道、AI 通道與定時任務通道共用同一個守衛入口（runGuarded），驗證鏈完全一致；每筆流水的 channel 欄位如實記錄來源通道，可交叉核對。這證明了本平台最重要的設計論斷：安全性不是某個通道的附加功能，而是所有通道共同經過的架構瓶頸。攻擊者無法透過「換一條路」繞過任何一道驗證——四類 18 個自動化攻擊模擬用例（同意篡改、越權、重放、提示注入）持續鎖定這一性質。"],
    },
    {
      t: "品質保障：讓測試說話",
      ps: ["當前自動化測試套件共 117 項，全部運行在真實 workerd 執行環境（vitest + vitest-pool-workers），而非模擬環境：單元測試覆蓋金額運算、策略分級、IR 編譯、同意綁定、污點檢查、不變量、冪等、認證加密與發卡計劃；整合測試覆蓋註冊發卡、靜態路由、雙通道轉帳端到端、Saga 補償與定時任務；攻擊模擬覆蓋前述四類對抗情境。測試數量隨批次演進的軌跡（59 → 90 → 99 → 117）與每次發布的部署版本一一對應，全部可回溯。"],
    },
    {
      t: "安全設計要點與已知邊界",
      ps: ["專業系統的標誌之一是誠實列出自己沒做的事。"],
      ss: [
        { t: "已實現", ps: ["密碼 PBKDF2-SHA256 十萬輪加鹽；會話 JWT 一小時可撤銷；驗證碼僅存雜湊且多重限流；Consent 與用戶綁定且一次性；授權欄位污點追蹤；AI 通道硬限額；DEMO_MODE 與生產配置隔離；全部金鑰經金鑰管理服務注入。"] },
        { t: "已知邊界（路線圖）", ps: ["KV 為最終一致，存在秒級視窗；Consent 消費目前為 KV 原子操作近似，生產加固方向是遷移至 Durable Object 事務；Passkey（WebAuthn）在規劃中，當前紅色驗證依賴信箱 OTP 送達；示範環境為單區域部署。這些邊界在《安全自評估》文件中有完整記錄。"] },
      ],
    },
    {
      t: "模型策略與資料治理",
      ps: ["模型供應商可配置、可替換，切換成本為零；對模型的全部要求只有一條——按工具模式輸出合法提議，遵守與否都由驗證執行環境兜底。對話資料傳輸遵循最小化（不含密碼、權杖、驗證碼與完整卡號），詳見《隱私政策》第六條；平台不收集任何真實身份與真實資金資料。"],
    },
    {
      t: "技術棧與開源致謝",
      ps: ["Cloudflare Workers / KV / Durable Objects / R2 / Email Service（基礎設施）；vitest 與 workerd（測試執行環境）；pdf-lib（月度報告產生）；Google Analytics 4（僅在獲得你的明確同意後啟用，Consent Mode v2 預設拒絕）；字型 Inter 與 Noto Sans SC/TC/Mono 依 SIL Open Font License 自託管。除上述外，本平台無任何執行環境依賴——無前端框架、無建置器、無伺服器第三方函式庫。"],
    },
  ],
  "en-US": [
    {
      t: "The Core Thesis: Taming Probability with Determinism",
      ps: ["The coming decade of banking revolves around a fundamental contradiction: large language models are probabilistic systems — they err, they can be injected, they drift — while a ledger demands that every movement of every cent be explainable, replayable and accountable. The industry's mainstream answer is longer prompts and more alignment training. Suveoo's answer is architecture: the AI's output is demoted, at the protocol level, to a “proposal”; every proposal must be compiled into an intermediate representation, and then a deterministic runtime entirely independent of the model decides whether it may execute. Within this Platform the AI holds no direct execution authority whatsoever — that is not a pleasantry in a prompt, it is the structure of the code itself."],
      ss: [
        { t: "The execution path", ps: ["LLM proposes → BankAction IR (intermediate representation) → five deterministic verifications → VERIFIED → ledger. Every link in this chain is a pure function that can be tested in isolation, or a storage operation with an explicit contract; if any verification fails, the operation is rejected and no ledger change occurs."] },
        { t: "In one sentence", ps: ["Suveoo is an Agentic Banking Control Plane: the AI understands and proposes; the control plane adjudicates and executes. The trust boundary between the two is compressed into a single compile-and-verify step, which makes the safety of the whole system exhaustively testable."] },
      ],
    },
    {
      t: "System Architecture: A Five-Layer Topology",
      ps: ["Every part of the Platform is built around auditability; layers communicate only through explicitly defined data structures."],
      ss: [
        { t: "Interaction layer", ps: ["A no-build multi-page application (roughly 50 static pages) plus a PWA offline shell. No bundler, no front-end framework — a zero build chain means a zero supply-chain attack surface, and every byte in the repository is the byte the browser executes; reviewers need to trust no transpilation step. The charts (line, bar, donut, sankey, sparkline) are hand-built SVG with no chart library."] },
        { t: "Service layer", ps: ["A single Cloudflare Worker hosts every API: authentication (JWT/PBKDF2/rate limiting), the MCP tool gateway (24 registered tools, hand-written JSON-RPC 2.0), the AI orchestrator (tool-call round trips self-managed, 8 rounds per conversation) and the verification runtime with the data API. Choosing a monolith over microservices is a deliberate decision at demonstration scale: one code review covers all server-side logic (currently about 2,400 lines)."] },
        { t: "Ledger layer", ps: ["Two Durable Objects: LedgerDO hosts the ledger as a registry singleton plus a per-user isolated SQLite instance, so the data boundary between users is enforced physically; SagaDO orchestrates long-running tasks and due fulfilment, with a due-scan fallback (sweepDue) so no task is missed even if a scheduling event is lost."] },
        { t: "Storage and notifications", ps: ["KV carries all session state with TTLs (verification codes, consent bindings, revocation lists, conversation history); R2 hosts static assets (no user data); monthly statements are generated on demand with pdf-lib and delivered over an authenticated stream; notification email is sent via Cloudflare Email Service."] },
        { t: "Model layer", ps: ["The model provider is declared via configuration keys (LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL) with the key injected through platform secret management; today it is Alibaba Cloud Bailian · Qwen over an Anthropic-compatible interface. Switching providers requires zero changes to the tool-call orchestration, because the round trips are managed by this Platform's own code and depend on no “server-side connector” feature."] },
      ],
    },
    {
      t: "BankAction IR: The Only Path for Every Action",
      ps: ["Every intent — whether from the form channel, the AI channel or the scheduled-task channel — must first be compiled into a BankAction IR before it can touch the ledger. The IR invariably contains: trace_id (a bai_-prefixed trace number), nonce (a one-time random value guarding against replay), intent, facts (field-level facts, each carrying provenance and a trust level), risk (three-tier grading with reasons), preconditions and compensation paths. The point of the IR is to compress the interface between “untrusted natural language” and “a trusted execution machine” into one verifiable data structure — from then on, safety depends not on the model's behavior but solely on verifying the IR."],
    },
    {
      t: "The Five Deterministic Verifications",
      ps: ["Every pending operation passes through five verifications in sequence; failing any one rejects it. The five verifications are this Platform's core asset, designed for a single goal: to make “the AI made a mistake” an ordinary event the system catches, rather than an incident."],
      ss: [
        { t: "① Policy", ps: ["The tool registry declares a base risk tier per tool (GREEN read-only auto-executed / YELLOW confirmation required / RED strong verification); hard amount validation (positive, two decimals, exhaustive format rejection); independent AI-channel hard caps (¥5,000 single / ¥10,000 daily, transfers and FX only); automatic escalation to RED when the daily accumulation crosses the threshold."] },
        { t: "② Consent", ps: ["Authorization-type operations return a parameter snapshot and an authorization hash on first submission — SHA256(intent ‖ authorization fields ‖ user ‖ expiry ‖ nonce) — valid for 120 seconds and consumed once; at confirmation every field is compared against the snapshot, and any inconsistency voids the authorization (CONSENT_INVALIDATED). This turns “what the user actually agreed to” into a mathematically verifiable fact."] },
        { t: "③ Provenance", ps: ["Each field's trust level is derived server-side from an origin table (user input trusted; model output system-level; merchant notes/OCR untrusted); the client may only declare downgrades and can never self-report as trusted. An untrusted origin entering an authorization field is rejected (UNTRUSTED_PROVENANCE). This is structural immunity to prompt injection."] },
        { t: "④ Invariants", ps: ["Available balance = balance − locked funds ≥ amount; product risk level ≤ user PR grade (appropriateness); sufficient FX quota; any violation is rejected with a readable error code."] },
        { t: "⑤ Replay", ps: ["Every operation carries a unique nonce that enters an irreversible consumed set; replays are always rejected (REPLAY_DETECTED) and never cause a second debit."] },
      ],
    },
    {
      t: "Same Rules, Every Channel: Security as a Property of the Architecture",
      ps: ["The form channel, the AI channel and the scheduled-task channel share a single guard entry point (runGuarded) with an identical verification chain; each ledger entry's channel field honestly records its origin and can be cross-checked. This proves this Platform's most important design claim: security is not a feature bolted onto one channel — it is the architectural choke point every channel must pass. An attacker cannot route around any verification by “taking another path” — eighteen automated adversarial cases across four attack classes (consent tampering, privilege escalation, replay, prompt injection) continuously pin down this property."],
    },
    {
      t: "Quality Assurance: Let the Tests Speak",
      ps: ["The current automated suite runs 117 tests, all on the real workerd runtime (vitest + vitest-pool-workers) rather than a simulated one: unit tests cover money math, policy tiering, IR compilation, consent binding, taint checking, invariants, idempotency, authentication cryptography and the card-plan generator; integration tests cover registration provisioning, static routing, end-to-end dual-channel transfers, Saga compensation and scheduled tasks; adversarial tests cover the four attack classes above. The trajectory of the suite (59 → 90 → 99 → 117) maps one-to-one to each released deployment and is fully traceable."],
    },
    {
      t: "Security Posture and Known Boundaries",
      ps: ["A mark of a professional system is honesty about what it has not done."],
      ss: [
        { t: "Implemented", ps: ["PBKDF2-SHA256 password hashing with 100,000 iterations and salt; one-hour revocable session JWTs; verification codes stored only as hashes behind layered rate limits; account-bound one-time Consent Grants; provenance taint tracking on authorization fields; AI-channel hard caps; DEMO_MODE isolated from production configuration; all secrets injected via secret management."] },
        { t: "Known boundaries (roadmap)", ps: ["KV is eventually consistent, with a seconds-level window; Consent consumption is currently approximated with KV atomic operations — the production hardening path is a Durable Object transaction; Passkey (WebAuthn) is on the roadmap, with RED verification currently relying on email OTP delivery; the demonstration environment is single-region. These boundaries are fully documented in the Security Self-Assessment."] },
      ],
    },
    {
      t: "Model Strategy and Data Governance",
      ps: ["The model provider is configurable and replaceable at zero switching cost; the only requirement placed on the model is that it emit valid proposals per the tool schemas — compliance or not, the verification runtime is the backstop. Conversation data follows transmission minimization (no passwords, tokens, codes or full card numbers); see Article 6 of the Privacy Policy. The Platform collects no real-identity or real-funds data."],
    },
    {
      t: "Stack and Open-Source Acknowledgements",
      ps: ["Cloudflare Workers / KV / Durable Objects / R2 / Email Service (infrastructure); vitest and workerd (test runtime); pdf-lib (monthly statement generation); Google Analytics 4 (enabled only with your explicit consent, Consent Mode v2 denied by default); the fonts Inter and Noto Sans SC/TC/Mono are self-hosted under the SIL Open Font License. Beyond the above, the Platform has no runtime dependencies — no front-end framework, no bundler, no third-party server libraries."],
    },
  ],
};
