/* charts/bar.js — 分组柱状图（自研 SVG）。
   opts.padT / opts.padX：顶部与横向留白（默认 30——紧贴标题/满宽的图可传小值）；
   opts.noLegend：不输出图例行（调用方自行拼进标题行右侧等自定义位置）。 */
S.charts = S.charts || {};
S.charts.bar = function (series, { w = 640, h = 220, colors = ["#1E2A78", "#B7C0E8"], labels = [], padT = 30, padX = 30, noLegend = false } = {}) {
  // series: [{name, values:[...]}, ...]；labels 为 x 轴
  const n = series[0]?.values.length ?? 0;
  if (!n) return `<div class="muted small">${S.fmt.escape(S.t("common.noData"))}</div>`;
  const pad = 30, max = Math.max(...series.flatMap((s) => s.values), 1);
  const gw = (w - padX * 2) / n;
  const bars = series.map((s, si) => s.values.map((v, i) => {
    const bw = (gw - 10) / series.length;
    const bh = ((v / max) * (h - pad - padT));
    const x = padX + i * gw + 5 + si * bw;
    return `<rect x="${x.toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${colors[si % colors.length]}"><title>${S.fmt.escape(s.name)}: ${v}</title></rect>`;
  }).join("")).join("");
  const xl = labels.map((l, i) => `<text x="${padX + i * gw + gw / 2}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#666">${S.fmt.escape(l)}</text>`).join("");
  const legend = series.map((s, i) => `<span class="small" style="margin-right:12px"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[i % colors.length]};margin-right:4px"></i>${S.fmt.escape(s.name)}</span>`).join("");
  return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}">${bars}${xl}</svg>${noLegend ? "" : `<div style="padding:6px 2px">${legend}</div>`}</div>`;
};
