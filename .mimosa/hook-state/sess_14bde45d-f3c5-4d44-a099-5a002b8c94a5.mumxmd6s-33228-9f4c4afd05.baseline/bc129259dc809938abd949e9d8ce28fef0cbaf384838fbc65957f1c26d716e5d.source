/* charts/sparkline.js — 迷你走势（外汇/基金卡） */
S.charts = S.charts || {};
S.charts.spark = function (points, { w = 90, h = 28, color = "#1E2A78" } = {}) {
  if (!points || points.length === 0) return "";
  /* 单点（外汇 7D 序列按自然日积累的第一天）：一个点画不出线，以居中圆点占位——诚实呈现"当前只有一个真实值" */
  if (points.length === 1) {
    const c = color === "auto" ? "#1F7A4D" : color;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${w / 2}" cy="${h / 2}" r="2.2" fill="${c}"/></svg>`;
  }
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const path = points.map((v, i) => `${i ? "L" : "M"}${(i * w) / (points.length - 1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const c = up ? "#1F7A4D" : "#C0392B";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="none" stroke="${color === "auto" ? c : color}" stroke-width="1.6"/></svg>`;
};
