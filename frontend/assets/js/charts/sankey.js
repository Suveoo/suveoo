/* charts/sankey.js — 支出流向简图（账单分析场景；简化双列桑基） */
S.charts = S.charts || {};
S.charts.sankey = function (rows, { w = 640, h = 260 } = {}) {
  // rows: [{category, total(number)}]
  const total = rows.reduce((a, b) => a + b.total, 0);
  if (!total || !rows.length) return `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
  const palette = ["#1E2A78", "#3A4FA5", "#5B7C99", "#7A6A53", "#2C6E63", "#A44A3F", "#666B8F", "#8C8C9A"];
  const left = 90, right = w - 140, gap = 6;
  const unit = (h - 40) / total;
  let y0 = 20;
  const bands = rows.map((r, i) => {
    const bh = Math.max(r.total * unit, 3);
    const seg = { y: y0, h: bh, color: palette[i % palette.length], ...r };
    y0 += bh + gap;
    return seg;
  }).filter((b) => b.y < h - 10);
  const node = bands.map((b) => `
    <rect x="${left}" y="${b.y.toFixed(1)}" width="10" height="${b.h.toFixed(1)}" fill="${b.color}"><title>${S.fmt.escape(b.category)}</title></rect>
    <rect x="${right}" y="${b.y.toFixed(1)}" width="10" height="${b.h.toFixed(1)}" fill="${b.color}" rx="2"><title>${S.fmt.escape(b.category)}</title></rect>
    <text x="${left - 6}" y="${(b.y + b.h / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#000">${S.fmt.escape(b.category)}</text>
    <text x="${right + 16}" y="${(b.y + b.h / 2 + 4).toFixed(1)}" font-size="11" fill="#666">¥${b.total.toFixed(0)}</text>
    <path d="M${left + 10},${(b.y).toFixed(1)} C${(left + right) / 2},${b.y.toFixed(1)} ${(left + right) / 2},${(b.y).toFixed(1)} ${right},${(b.y).toFixed(1)} L${right},${(b.y + b.h).toFixed(1)} C${(left + right) / 2},${(b.y + b.h).toFixed(1)} ${(left + right) / 2},${(b.y + b.h).toFixed(1)} ${left + 10},${(b.y + b.h).toFixed(1)} Z" fill="${b.color}" fill-opacity=".18"/>`).join("");
  return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}">
    <text x="${left - 6}" y="12" text-anchor="end" font-size="10" fill="#666">${S.fmt.escape(S.t("dash.spendSource"))}</text>
    <text x="${right + 16}" y="12" font-size="10" fill="#666">${S.fmt.escape(S.t("dash.spendCategory"))}</text>${node}</svg></div>`;
};
