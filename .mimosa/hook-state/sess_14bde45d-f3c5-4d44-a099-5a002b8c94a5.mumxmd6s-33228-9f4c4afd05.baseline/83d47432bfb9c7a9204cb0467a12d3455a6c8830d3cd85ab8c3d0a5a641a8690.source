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

/* 多序列折线（基金 vs 基准对比）：series = [{ points, color, dash }]，同步比例尺 */
S.charts.multi = function (series, { w = 640, h = 220, labels = [], yFmt = null } = {}) {
  const all = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
  if (all.length < 2) return `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
  const pad = 52, min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const n = Math.max(...series.map((s) => s.points.length));
  const X = (i) => pad + (i * (w - pad * 2)) / (n - 1);
  const Y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const fmtTick = yFmt ?? ((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)));
  const ticks = [min, (min + max) / 2, max].map((v) => `<text x="${pad - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#666">${S.fmt.escape(String(fmtTick(v)))}</text>`).join("");
  const xlabels = labels.length ? labels.map((l, i) => i % Math.ceil(labels.length / 6 || 1) === 0 ? `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#666">${S.fmt.escape(String(l))}</text>` : "").join("") : "";
  const paths = series.map((s) => {
    const d = s.points.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash ? "5 4" : "none"}" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${ticks}${xlabels}${paths}</svg>`;
};

/* 蒙特卡洛扇形图：p10-p90 外带 + p25-p75 内带 + p50 中线，末端标注分位终值 */
S.charts.fan = function (proj, { w = 640, h = 230, labels = [] } = {}) {
  const { p10, p25, p50, p75, p90, years } = proj;
  const all = [...p10, ...p90];
  const pad = 52, min = Math.min(...all) * 0.98, max = Math.max(...all) * 1.02, span = max - min || 1;
  const n = years.length;
  const X = (i) => pad + (i * (w - pad * 2 - 46)) / (n - 1);
  const Y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const band = (lo, hi, fill) => {
    const up = hi.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const dn = lo.map((v, i) => `${(lo.length - 1 - i) ? "L" : "M"}${X(lo.length - 1 - i).toFixed(1)},${Y(lo[lo.length - 1 - i]).toFixed(1)}`).join(" ");
    return `<path d="${up} ${dn} Z" fill="${fill}"/>`;
  };
  const mid = p50.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max].map((v) => `<text x="${pad - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#666">${v.toFixed(2)}</text>`).join("");
  const xl = (labels.length ? labels : years.map((y) => `Y${y}`)).map((l, i) => i % 2 === 0 ? `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#666">${S.fmt.escape(String(l))}</text>` : "").join("");
  const endTag = (arr, txt, color) => `<text x="${X(n - 1) + 6}" y="${Y(arr[n - 1]) + 3}" font-size="10" fill="${color}">${txt} ${arr[n - 1].toFixed(2)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img">
    ${band(p10, p90, "rgba(30,42,120,.10)")}${band(p25, p75, "rgba(30,42,120,.18)")}
    <path d="${mid}" fill="none" stroke="#1E2A78" stroke-width="2.2" stroke-linejoin="round"/>
    ${endTag(p10, "P10", "#999")}${endTag(p50, "P50", "#1E2A78")}${endTag(p90, "P90", "#999")}
    ${ticks}${xl}</svg>`;
};
