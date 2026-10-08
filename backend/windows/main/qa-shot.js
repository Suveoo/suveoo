/**
 * Suveoo for Windows — QA 截图模式
 * ----------------------------------
 * electron . --shot=<url> --size=<WxH> --out=<file.png>
 * 隐藏窗口加载目标 URL（不挂导航守卫——允许直接加载远程页），加载完成 + 1.5s 后
 * capturePage 落盘退出。用于 /download 等页面的三端宽度排版 QA。
 * 落盘边界：--out 只允许 backend/windows 仓库内或 userData 内（防路径穿越）。
 */
"use strict";

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");

async function runShot(argv) {
  const { app, BrowserWindow } = require("electron");
  const get = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const url = get("shot", "https://suveoo.com/download");
  const [w, h] = String(get("size", "1280x1400")).split("x").map(Number);
  const userData = app.getPath("userData");
  const rawOut = get("out", "qa-shot.png");
  const abs = path.resolve(ROOT, rawOut); // 相对路径锚定仓库；绝对路径原样
  const allowed = abs === ROOT || abs.startsWith(ROOT + path.sep) || abs.startsWith(userData + path.sep);
  const out = allowed ? abs : path.join(ROOT, "qa-shot.png");

  const win = new BrowserWindow({ show: false, width: w || 1280, height: h || 1400, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await win.webContents.loadURL(url);
  await new Promise((r) => setTimeout(r, 1500)); // 等 manifest 拉取与渲染
  let img;
  try {
    img = await win.webContents.capturePage();
  } catch (e) {
    process.stdout.write(`[shot] capturePage 失败：${e && e.message}\n`);
    app.exit(1);
    return;
  }
  // 打包态 asar 只读——若 out 落在应用目录内则改落 userData（Windows 轮遗留项，mac 轮正解回同步）
  let outFinal = out;
  try {
    if (app.isPackaged && !outFinal.startsWith(userData + path.sep)) outFinal = path.join(userData, path.basename(rawOut));
  } catch { /* 保持原路径 */ }
  fs.mkdirSync(path.dirname(outFinal), { recursive: true });
  fs.writeFileSync(outFinal, img.toPNG());
  process.stdout.write(`[shot] ${outFinal} (${w}x${h}, ${(img.toPNG().length / 1024).toFixed(0)} KB)\n`);
  app.exit(0);
}

module.exports = { runShot };
