/* 本地复刻 generateReport 的绘制序列，定位 drawText NaN 来源 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const TILE = "M215 0H809A215 215 0 0 1 1024 215V809A215 215 0 0 1 809 1024H215A215 215 0 0 1 0 809V215A215 215 0 0 1 215 0Z";
const MARK = "M605.4 512H336.8c-63.2 0-110.6-47.4-110.6-110.6s47.4-110.6 110.6-110.6H637M257.8 733.2h426.6c63.2 0 110.6-47.4 110.6-110.6S747.6 512 684.4 512h-79M336.8 812.2l-79-79 79-79m460.98-363.4a79 79 0 1 0-158 0 79 79 0 1 0 158 0";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const page = doc.addPage([595.28, 841.89]);

console.log("step1: tile path");
page.drawSvgPath(TILE, { x: 50, y: 700, scale: 84 / 1024, color: rgb(0.118, 0.165, 0.471) });
console.log("step2: mark path");
page.drawSvgPath(MARK, { x: 50, y: 700, scale: 84 / 1024, borderColor: rgb(1, 1, 1), borderWidth: 79 });
console.log("step3: texts");
page.drawText("Suveoo", { x: 150, y: 738, size: 30, font: bold, color: rgb(0.118, 0.165, 0.471) });
const fmtC = (cents) => (Number(cents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const net = Number("123.45") - Number("45.67");
page.drawText((net >= 0 ? "+" : "") + fmtC(net), { x: 60, y: 500, size: 17, font: bold });
console.log("step4: rect");
page.drawRectangle({ x: 50, y: 520, width: 100, height: 64, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 0.5 });
console.log("step5: line");
page.drawLine({ start: { x: 50, y: 46 }, end: { x: 545, y: 46 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
console.log("ALL OK");
