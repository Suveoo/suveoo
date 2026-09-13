/* charts/sparkline.js — 迷你走势（外汇/基金卡） */
S.charts = S.charts || {};
S.charts.spark = function (points, { w = 90, h = 28, color = "#1E2A78" } = {}) {
  if (!points || points.length < 2) return "";
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const path = points.map((v, i) => `${i ? "L" : "M"}${(i * w) / (points.length - 1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const c = up ? "#1F7A4D" : "#C0392B";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="none" stroke="${color === "auto" ? c : color}" stroke-width="1.6"/></svg>`;
};
