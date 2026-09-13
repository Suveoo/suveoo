/* charts/donut.js — 环形图（自研 SVG） */
S.charts = S.charts || {};
S.charts.donut = function (items, { size = 200 } = {}) {
  // items: [{label, value, color}]
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
  const R = size / 2 - 10, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = items.map((it) => {
    const frac = it.value / total;
    const seg = `<circle r="${R}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${it.color}" stroke-width="22"
      stroke-dasharray="${(frac * C).toFixed(1)} ${(C).toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${S.fmt.escape(it.label)}: ${Math.round(frac * 100)}%</title></circle>`;
    acc += frac;
    return seg;
  }).join("");
  const legend = items.map((it) => `<div class="split-row"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${it.color};margin-right:8px"></i>${S.fmt.escape(it.label)}</span><span class="mono">${Math.round((it.value / total) * 100)}%</span></div>`).join("");
  return `<div class="row" style="align-items:center;gap:24px;flex-wrap:wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs}
    <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" font-size="13" fill="#666">${S.fmt.escape(S.t("common.total"))}</text></svg>
    <div style="flex:1;min-width:180px">${legend}</div></div>`;
};
