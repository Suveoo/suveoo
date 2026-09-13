/* charts/line.js — 折线图（自研 SVG） */
S.charts = S.charts || {};
S.charts.line = function (points, { w = 640, h = 200, color = "#1E2A78", labels = [] } = {}) {
  if (!points || points.length < 2) return `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
  const pad = 52, min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const X = (i) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const Y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const path = points.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${X(points.length - 1)},${h - pad} L${X(0)},${h - pad} Z`;
  const gid = "g" + Math.random().toString(36).slice(2, 7);
  // 大数压缩为"万"，避免 Y 轴标签超宽被裁切
  const fmtTick = (v) => Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(2) + S.t("chart.yi") : Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(1) + S.t("chart.wan") : String(Math.round(v * 100) / 100);
  const ticks = [min, (min + max) / 2, max].map((v) => `<text x="${pad - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#666">${S.fmt.escape(fmtTick(v))}</text>`).join("");
  const xlabels = labels.length ? labels.map((l, i) => i % Math.ceil(labels.length / 6 || 1) === 0 ? `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#666">${S.fmt.escape(l)}</text>` : "").join("") : "";
  return `<svg viewBox="0 0 ${w} ${h}" role="img"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.5" fill="${color}"/>`).join("")}
    ${ticks}${xlabels}</svg>`;
};
