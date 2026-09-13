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
  /* 行内：代码 span → 链接（仅 http/s）→ 粗体 → 斜体 → 还原代码 */
  inline(s) {
    const spans = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { spans.push(c); return "\u0000C" + (spans.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    s = s.replace(/\u0000C(\d+)\u0000/g, (m, k) => '<code class="md-code">' + spans[+k] + "</code>");
    return s;
  },
};
