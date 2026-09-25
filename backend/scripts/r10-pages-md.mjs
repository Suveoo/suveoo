/* 第十轮：pages.md §8.3 /contact 段落更新 */
import fs from "node:fs";
const p = "for-claude-code/pages.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "- 表单：姓名、Email、类别下拉（账户/转账/理财/安全/其他）、留言；提交 `POST /api/contact` → Worker 经 EMAIL binding 转发至 `support@suveoo.com`，页面显示“已收到，1-3 个工作日回复（模拟）”。";
if (!s.includes(anchor)) { console.error("ANCHOR NOT FOUND"); process.exit(1); }
const neu = `第十轮全面改版（v=b204）：

- **渐变 Hero**（135° navy + 径向光斑 + ai-deco，≤767 隐藏插画）：标题+副文+金胶囊"1-3 个工作日回复"（contact.sla）。
- **双列布局**（≤900 单列）：左表单卡 + 右侧栏（官方邮箱双卡+FAQ 速查）。
- **表单**：登录态 Email 自动预填（contact.prefilled 提示行）、必填星标（Email/留言）、留言字数计数（maxlength 2000 前后端同限）、行内校验（Email 格式/留言必填红边+行内错误文本，输入即清除）、提交三态（默认→发送中禁用→成功态面板翻转整卡：teal 圆勾+标题+说明+"再写一条"按钮回表单态且保留姓名/邮箱/类别）。
- **官方邮箱双卡**（ab-ct-row 样式复用）：ic-doc-navy 客户支持（账户/交易与一般咨询）/ ic-shield-rose 安全事务（安全漏洞与隐私事件报告），mailto 直达。
- **FAQ 速查行**："先看看帮助中心，也许更快解决"链接 /help（减少无效表单）。
- **邮件链路修复（本页实测抓出的存量 bug）**：\`/api/contact\` 两处端点（Worker+LedgerDO）此前只传 text 不传 html——\`sendMail\` 内 \`html + EMAIL_SIGNATURE_HTML\` 拼成 "undefined<div…>"，Tuta 等 HTML 优先客户端只渲染该串、text 四要素全部不可见。修复：① \`sendMail\` 加 \`textToHtml\` 兜底（html 缺省时 text 转义+pre-wrap 生成，防未来再踩）；② contact 补结构化 \`contactFormMail(b)\` 模板（字段表格+多行留言块全转义+mailto 一键回复）。Tuta 实测：姓名/邮箱(mailto)/类别/留言（多行+特殊字符 ¥ & 引号安全转义）全部可见。`;
fs.writeFileSync(p, s.replace(anchor, neu));
console.log("pages.md updated");
