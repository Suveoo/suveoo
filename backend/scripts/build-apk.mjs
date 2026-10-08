/* build-apk.mjs — APK 构建脚本（第五十三轮 v1.2 定稿）
 * 本地资产模式 + MainActivity MpaWebViewClient（继承 BridgeWebViewClient，仅前置目录补全）
 *   + 全部 HTML 注入 core/back-button.js（返回手势 JS 侧 __suveooBack，壳内专用，网页版不引用零影响）。
 * 精简：剔 cards-front .jpg/.svg 源（Web 只用 .webp 36KB 版，APK 从 252→~46MB）。
 * 用法：cd backend && node scripts/build-apk.mjs */
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "../../frontend");
const SLIM = path.resolve(HERE, "../android/app/src/main/assets/public");
const ANDROID = path.resolve(HERE, "../android");
const OUT = path.resolve(HERE, "../../for_developer");
const JAVA = "C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot";
const SDK = "D:/android-sdk";

const shouldSkip = (rel) => /cards-front\/.*\.(jpg|svg)$/i.test(rel);
const totalSize = (dir) => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += totalSize(p); else n += statSync(p).size;
  }
  return n;
};
const walkCopy = () => {
  rmSync(SLIM, { recursive: true, force: true });
  mkdirSync(SLIM, { recursive: true });
  const rec = (d, base = "") => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue; /* 2026-10-02 教训：.mimosa 等工具缓存勿入包（同 deploy-frontend 修复） */
      const rel = base ? `${base}/${e.name}` : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { rec(full, rel); continue; }
      if (shouldSkip(rel)) continue;
      const dst = path.join(SLIM, rel);
      mkdirSync(path.dirname(dst), { recursive: true });
      /* HTML 注入返回手势脚本（第五十三轮）：</body> 前插 defer script；
       * 无 </body> 的畸形页兜底追加末尾。front-end 源文件不动（仅构建产物内注入） */
      if (e.name.endsWith(".html")) {
        let t = readFileSync(full, "utf8");
        if (!t.includes("back-button.js")) {
          const tag = '<script src="/assets/js/core/back-button.js?v=1" defer></script>';
          t = /<\/body>/i.test(t) ? t.replace(/<\/body>/i, tag + "</body>") : t + tag;
        }
        /* 第六十六轮：生物识别（场景③快捷重登）——与 back-button 同注入管线，Web 源不引用 */
        if (!t.includes("biometric-shell.js")) {
          const tag2 = '<script src="/assets/js/core/biometric-shell.js?v=1" defer></script>';
          t = /<\/body>/i.test(t) ? t.replace(/<\/body>/i, tag2 + "</body>") : t + tag2;
        }
        /* 第七十二轮：检查更新（壳内「我的账户→偏好」入口由 account.js isCapacitor 分支渲染） */
        if (!t.includes("shell-update.js")) {
          const tag3 = '<script src="/assets/js/core/shell-update.js?v=1" defer></script>';
          t = /<\/body>/i.test(t) ? t.replace(/<\/body>/i, tag3 + "</body>") : t + tag3;
        }
        writeFileSync(dst, t);
        continue;
      }
      cpSync(full, dst);
    }
  };
  rec(FRONTEND);
};

console.log("① cap sync android…");
execFileSync("node", [path.resolve(HERE, "../node_modules/@capacitor/cli/bin/capacitor"), "sync", "android"], { cwd: path.resolve(HERE, ".."), stdio: "inherit" });

console.log("② 精简 assets/public…");
walkCopy();
console.log(`   ${(totalSize(SLIM) / 1024 / 1024).toFixed(1)} MB（原 ${(totalSize(FRONTEND) / 1024 / 1024).toFixed(1)} MB）`);

console.log("③ gradlew assembleRelease…");
const env = { ...process.env, JAVA_HOME: JAVA, ANDROID_HOME: SDK };
execFileSync("cmd.exe", ["/c", path.join(ANDROID, "gradlew.bat"), "assembleRelease", "--no-daemon", "-Dorg.gradle.jvmargs=-Xmx2g"], { cwd: ANDROID, env, stdio: "inherit" });

const apk = path.join(ANDROID, "app/build/outputs/apk/release/app-release.apk");
if (!existsSync(apk)) throw new Error("APK not found");
mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, "Suveoo-v3.184.0.apk");
cpSync(apk, dest);
console.log(`✓ APK ${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB → ${dest}`);
