/* md.js — 极简安全 Markdown 渲染器（AI 对话气泡用）
   安全模型：先整体 HTML 转义，再仅生成白名单标签（strong/em/code/pre/a[http(s)]/ul/ol/table/blockquote/hr/h3-h5）；
   链接仅接受 http(s) 并强制 target/rel；不引入任何外部依赖。 */
S.md = {
  render(src) {
    if (!src) return "";
    let text = String(src).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    /* 1. 围栏代码块先摘出（占位符保护） */
    const fences = [];
    text = text.replace(/```([a-zA-Z0-9+#-]*)\r?\n?([\s\S]*?)(```|$)/g, (m, lang, code) => {
      fences.push(code.replace(/\r?\n$/, ""));
      return "\u0000F" + (fences.length - 1) + "\u0000";
    });
    /* 2. 行级块解析 */
    const lines = text.split("\n");
    const out = [];
    let i = 0;
    const isTableSep = (l) => /^\s*\|?[\s:\-|]+\|[\s:\-|]*$/.test(l) && l.includes("-");
    const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const listRe = /^(\s*)(?:[-*•·]|\d+[.、)])\s+(.*)$/;
    while (i < lines.length) {
      const line = lines[i];
      const fm = line.match(/^\u0000F(\d+)\u0000\s*$/);
      if (fm) { out.push('<pre class="md-pre"><code>' + fences[+fm[1]] + "</code></pre>"); i++; continue; }
      if (/^\s*$/.test(line)) { i++; continue; }
      const h = line.match(/^(#{1,4})\s+(.+)$/);
      if (h) { const lv = Math.min(h[1].length + 2, 5); out.push("<h" + lv + ' class="md-h">' + this.inline(h[2]) + "</h" + lv + ">"); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr class="md-hr">'); i++; continue; }
      if (/^\s*&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*&gt;\s?/, "")); i++; }
        out.push('<blockquote class="md-quote">' + buf.map((b) => this.inline(b)).join("<br>") + "</blockquote>");
        continue;
      }
      if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>'
          + head.map((c) => "<th>" + this.inline(c) + "</th>").join("")
          + "</tr></thead><tbody>"
          + rows.map((r) => "<tr>" + head.map((_, k) => "<td>" + this.inline(r[k] == null ? "" : r[k]) + "</td>").join("") + "</tr>").join("")
          + "</tbody></table></div>");
        continue;
      }
      if (listRe.test(line)) {
        const ordered = /\d/.test(line.match(listRe)[1] + line.match(listRe)[2].slice(0, 1)) && /^\s*\d/.test(line);
        const base = (line.match(listRe)[1] || "").length;
        const items = [];
        while (i < lines.length) {
          if (/^\s*$/.test(lines[i])) { if (i + 1 < lines.length && listRe.test(lines[i + 1])) { i++; continue; } break; }
          const m2 = lines[i].match(listRe);
          if (!m2) break;
          const ind = (m2[1] || "").length;
          if (!items.length || ind <= base + 1) items.push(m2[2]);
          else if (items.length) items[items.length - 1] += "<br>" + m2[2]; // 深缩进视为上一项续行
          i++;
        }
        const tag = ordered && /^\s*\d/.test(line) ? "ol" : "ul";
        out.push("<" + tag + ' class="md-list">' + items.map((it) => "<li>" + this.inline(it) + "</li>").join("") + "</" + tag + ">");
        continue;
      }
      /* 段落：连续普通行 */
      const para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\u0000F\d+\u0000\s*$/.test(lines[i])
        && !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
        && !/^\s*&gt;\s?/.test(lines[i]) && !(lines[i].trim().startsWith("|") && isTableSep(lines[i + 1] || ""))
        && !listRe.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      if (para.length) out.push('<p class="md-p">' + para.map((p) => this.inline(p)).join("<br>") + "</p>");
    }
    return out.join("");
  },
  /* 工具深链按钮卡：匹配工具页带参 URL（Markdown 链接或裸 URL 均识别）。
     注：整体转义后 URL 中的 & 已成 &amp;，作为 href 属性恰是合法转义，无需还原。
     第五期 idle：按钮卡下方追加 .tool-embed 隐藏占位（携带 slug+query），由 S.tools.hydrate
     在消息定稿后渲染完整可交互工具（/ai 页已引入全部工具页脚本；未引入的页面占位保持隐藏、跳页能力不受影响）。 */
  toolLinkRe: /^https:\/\/suveoo\.com\/wealth\/tools\/[a-z-]+\?.+$/,
  /* 第一百二十二轮：壳内（S.api.base 非空 = APK https://localhost origin）站内绝对链接剥 origin → 相对路径。
   * WebView 把相对链接解析回 localhost → 壳内原生加载（Java shouldOverrideUrlLoading 映射为二道兜底）。
   * Web（base=""）原样返回，行为零变化。 */
  siteHref(url) {
    if (!S.api || !S.api.base) return url;
    const m = url.match(/^https:\/\/(www\.)?suveoo\.com(\/[^\s?#]*)?([?#][^\s]*)?$/i);
    return m ? (m[2] || "/") + (m[3] || "") : url;
  },
  toolCard(url) {
    const m = url.match(/^https:\/\/suveoo\.com\/wealth\/tools\/([a-z-]+)(?:\?([^"<]*))?$/);
    const embed = m && S.toolPages ? `<div class="tool-embed" data-tool="${m[1]}" data-query="${m[2] ?? ""}" hidden></div>` : "";
    /* 壳内去 target=_blank：无多窗口支持本就同窗导航，剥 origin 后相对直达，返回手势可回聊天 */
    const tgt = !S.api || !S.api.base ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a class="tool-open" href="${this.siteHref(url)}"${tgt}>${S.ui.icon("calc", 18)}<span>${S.fmt.escape(S.t("ai.toolOpen"))}</span>${S.ui.icon("arrow-right", 16)}</a>${embed}`;
  },
  /* 行内：代码 span → 工具深链按钮（先于普通链接；输出经 \u0000T 占位符保护，防后续裸 URL 正则嵌套命中已生成的 href）→
     站内裸 URL（仅 suveoo.com 域；工具深链转按钮卡，其余渲染为同窗可点链接，外链裸形式不放行）→
     Markdown 链接（站内同窗 / 外链 target=_blank）→ 粗体 → 斜体 → 还原占位符 */
  inline(s) {
    const spans = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { spans.push(c); return "\u0000C" + (spans.length - 1) + "\u0000"; });
    const cards = [];
    const keep = (html) => { cards.push(html); return "\u0000T" + (cards.length - 1) + "\u0000"; };
    /* markdown 自动链接 <https://suveoo.com/...>：拆掉角括号（转义后为 &lt;/&gt;），交由下方裸 URL 统一处理——
       否则结尾 &gt; 会被吞进 URL，深链参数带脏字符（qwen 实测会出现该格式） */
    s = s.replace(/&lt;(https:\/\/suveoo\.com\/[^\s<)）」』】。，；、！？：]+?)&gt;/g, "$1");
    s = s.replace(/\[[^\]]*\]\((https:\/\/suveoo\.com\/wealth\/tools\/[a-z-]+\?[^\s)]+)\)/g, (m, url) => (this.toolLinkRe.test(url) ? keep(this.toolCard(url)) : m));
    /* 裸 URL：前缀不得是 URL 字符或 '('（避免截断 markdown 链接括号内的地址）；句读全角标点不入链；结尾实体剥除 */
    s = s.replace(/(?<![\w\/.=&,(])(https:\/\/suveoo\.com\/[^\s<)）」』】。，；、！？：]+)/g, (m) => {
      const url = m.replace(/(?:&gt;|&amp;)+$/, "");
      return this.toolLinkRe.test(url) ? keep(this.toolCard(url)) : `<a href="${this.siteHref(url)}">${url}</a>`;
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, url) => {
      if (/^https:\/\/(www\.)?suveoo\.com\//i.test(url)) return `<a href="${this.siteHref(url)}">${t}</a>`;
      /* 外链：Web 新标签；壳内同窗（Java 路由进 App 内嵌浏览器，_blank 无多窗口支持本就同窗） */
      return !S.api || !S.api.base
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${t}</a>`
        : `<a href="${url}">${t}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    s = s.replace(/\u0000C(\d+)\u0000/g, (m, k) => '<code class="md-code">' + spans[+k] + "</code>");
    s = s.replace(/\u0000T(\d+)\u0000/g, (m, k) => cards[+k]);
    return s;
  },
};
