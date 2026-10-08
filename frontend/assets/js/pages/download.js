/* download.js — 第六十八轮 APK 下载页；第一百五十轮双平台改版（Android + Windows）；
 * 第一百五十六轮三平台（+ macOS）。
 * 结构：Hero（品牌+主张，无平台按钮）→ 三平台卡片（版本 chip/大小/日期/SHA-256/主次按钮）
 *      → 三平台安装步骤 → 安全说明。manifest 拉取失败：APK 回落内置常量、Windows/macOS 整卡隐藏。
 * 关键路径修正：manifest/按钮一律绝对地址（S.api.base）——壳内（Capacitor/Electron 本地
 * origin）相对 /dl/ 会落到本地资产 404；Windows/macOS 壳内点按钮由主进程 /dl/ 拦截转下载流。 */
S.router.register("download", async () => {
  const c = document.getElementById("content");
  const FALLBACK = { file: "Suveoo-v3.184.0.apk", url: "/dl/Suveoo-v3.184.0.apk", version: "3.184.0", versionCode: 78, sizeBytes: 36951501, sha256: "9d87b3c7426b587e6f0fba2cd2850075fd5a5c507247359b7870935034736d08", releasedAt: "2026-10-08", minAndroid: 7.0 };
  const base = (S.api && S.api.base) || "";
  const mb = (n) => (n ? (n / 1024 / 1024).toFixed(1) + " MB" : "—");
  let m = FALLBACK;
  try {
    const r = await fetch(base + "/dl/apk-manifest.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); if (j && j.url && j.sha256) m = j; }
  } catch { /* 回落内置常量 */ }
  let w = null;
  try {
    const r = await fetch(base + "/dl/windows-manifest.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); if (j && j.url && j.versionName) w = j; }
  } catch { /* 未发布 Windows 线：整卡隐藏 */ }
  let mc = null;
  try {
    const r = await fetch(base + "/dl/macos-manifest.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); if (j && j.url && j.versionName && j.sha256) mc = j; }
  } catch { /* 未发布 macOS 线：整卡隐藏 */ }

  const esc = (s) => S.fmt.escape(String(s ?? ""));
  const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
  /* 第一百六十轮：Android/Windows 图标换路径（zwicon Android 机器人填充版 + Windows 四格）——
   * 徽章容器（dl-pf-ico）风格形式维持，仅换 svg 本体；与 macOS 图标同为 fill 体系。 */
  const ICO_ANDROID = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.97535,3.01886l.95982-1.73159a.19342.19342,0,0,0-.33833-.18756l-.97045,1.75078a6.54141,6.54141,0,0,0-5.25275,0L8.40316,1.09971a.19342.19342,0,0,0-.33833.18756l.95985,1.7316A5.54614,5.54614,0,0,0,5.93152,7.89522h12.137A5.54615,5.54615,0,0,0,14.97535,3.01886ZM9.19911,5.67446a.5068.5068,0,1,1,.5068-.5068A.50737.50737,0,0,1,9.19911,5.67446Zm5.60178,0a.5068.5068,0,1,1,.5068-.5068A.50737.50737,0,0,1,14.80089,5.67446Zm-8.86946,11.497a1.46713,1.46713,0,0,0,1.46713,1.46713h.9736v3.00095a1.36046,1.36046,0,1,0,2.72091,0V18.63859h1.81386v3.00095a1.36046,1.36046,0,1,0,2.72091,0V18.63859h.97364a1.46713,1.46713,0,0,0,1.46713-1.46713V8.37532H5.93143ZM4.06415,8.14191A1.362,1.362,0,0,0,2.7037,9.50237v5.66846a1.36046,1.36046,0,1,0,2.72091,0V9.50237A1.362,1.362,0,0,0,4.06415,8.14191Zm15.8717,0a1.362,1.362,0,0,0-1.36046,1.36046v5.66846a1.36046,1.36046,0,1,0,2.72091,0V9.50237A1.362,1.362,0,0,0,19.93585,8.14191Z"/></svg>';
  const ICO_WINDOWS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8.3v8.3H3V3zm9.7 0H21v8.3h-8.3V3zM3 12.7h8.3V21H3v-8.3zm9.7 0H21V21h-8.3v-8.3z"/></svg>';
  const ICO_MAC = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.7 12.9c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.1-.8-2.1-3.4zM14.4 5.9c.6-.7 1-1.7.9-2.7-.9.1-2 .6-2.6 1.3-.6.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z"/></svg>';
  const shaRow = (id, hash) => `
      <div class="apk-sha"><span class="lb">${esc(t("apk.sha", "SHA-256 校验"))}</span>
        <div class="apk-sha-row"><code class="mono" id="${id}">${esc(hash || "—")}</code>
        <button class="btn btn-ghost btn-sm" data-copy="${id}">${esc(t("apk.copy", "复制"))}</button></div></div>`;
  const steps = (n, prefix) => Array.from({ length: n }, (_, i) =>
    `<li><span class="apk-step-n">${i + 1}</span><span>${esc(t(prefix + (i + 1), ""))}</span></li>`).join("");

  c.innerHTML = `
  <section class="apk-hero dl-hero">
    <div class="apk-hero-in">
      <img class="apk-icon" src="/assets/images/suveoo-logo-square.svg?v=${S.ui.v()}" alt="Suveoo">
      <div class="apk-hero-txt">
        <h1>${esc(t("apk.title", "下载 Suveoo 客户端"))}</h1>
        <p>${esc(t("apk.subtitle", "一套账户，双端体验。"))}</p>
      </div>
    </div>
  </section>

  <div class="dl-grid dl-grid-cards">
    <div class="card dl-card">
      <div class="dl-card-head">
        <span class="dl-pf-ico">${ICO_ANDROID}</span>
        <div class="dl-card-t"><b>${esc(t("dl.andTitle", "Suveoo for Android"))}</b>
          <span class="dl-pf-sub">${esc(t("apk.requireVal", "Android 7.0 及以上"))}</span></div>
        <div class="dl-actions">
          <a class="btn btn-primary" id="apk-go" href="${esc(base + m.url)}" download="${esc(m.file || "")}" rel="nofollow">
            ${S.ui.icon("download", 18)} ${esc(t("apk.btn", "下载 Android 版"))}</a>
        </div>
      </div>
      <div class="dl-kv-flow">
        <div class="apk-kv"><span class="muted">${esc(t("apk.version", "版本"))}</span><b class="mono">v${esc(m.version)} (${esc(m.versionCode)})</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.size", "大小"))}</span><b>${mb(m.sizeBytes)}</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.released", "发布日期"))}</span><b class="mono">${esc(m.releasedAt)}</b></div>
      </div>
      ${shaRow("apk-sha", m.sha256)}
    </div>

    ${w ? `
    <div class="card dl-card">
      <div class="dl-card-head">
        <span class="dl-pf-ico">${ICO_WINDOWS}</span>
        <div class="dl-card-t"><b>${esc(t("dl.winTitle", "Suveoo for Windows"))}</b>
          <span class="dl-pf-sub">${esc(t("dl.winRequireVal", "Windows 10 1809 及以上（x64）"))}</span></div>
        <div class="dl-actions">
          <a class="btn btn-primary" id="win-go" href="${esc(base + w.url)}" download rel="nofollow">
            ${S.ui.icon("download", 18)} ${esc(t("dl.winBtn", "下载 Windows 安装版"))}</a>
          ${w.portableUrl ? `<a class="btn" href="${esc(base + w.portableUrl)}" download rel="nofollow">${esc(t("dl.winPortable", "便携版（免安装）"))}</a>` : ""}
        </div>
      </div>
      <div class="dl-kv-flow">
        <div class="apk-kv"><span class="muted">${esc(t("apk.version", "版本"))}</span><b class="mono">v${esc(w.versionName ?? w.version)} (${esc(w.versionCode ?? "")})</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.size", "大小"))}</span><b>${mb(w.sizeBytes)}</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.released", "发布日期"))}</span><b class="mono">${esc(w.releasedAt ?? "—")}</b></div>
      </div>
      ${shaRow("win-sha", w.sha256)}
      <p class="dl-note">${esc(t("dl.winNote", "安装包未做代码签名：首次运行若遇 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。"))}</p>
    </div>` : ""}

    ${mc ? `
    <div class="card dl-card">
      <div class="dl-card-head">
        <span class="dl-pf-ico">${ICO_MAC}</span>
        <div class="dl-card-t"><b>${esc(t("dl.macTitle", "Suveoo for macOS"))}</b>
          <span class="dl-pf-sub">${esc(t("dl.macRequireVal", "macOS 11 及以上（Intel 与 Apple Silicon 通用）"))}</span></div>
        <div class="dl-actions">
          <a class="btn btn-primary" id="mac-go" href="${esc(base + mc.url)}" download rel="nofollow">
            ${S.ui.icon("download", 18)} ${esc(t("dl.macBtn", "下载 macOS 安装版"))}</a>
          ${mc.zipUrl ? `<a class="btn" href="${esc(base + mc.zipUrl)}" download rel="nofollow">${esc(t("dl.macZip", "压缩版（zip）"))}</a>` : ""}
        </div>
      </div>
      <div class="dl-kv-flow">
        <div class="apk-kv"><span class="muted">${esc(t("apk.version", "版本"))}</span><b class="mono">v${esc(mc.versionName ?? mc.version)} (${esc(mc.versionCode ?? "")})</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.size", "大小"))}</span><b>${mb(mc.sizeBytes)}</b></div>
        <div class="apk-kv"><span class="muted">${esc(t("apk.released", "发布日期"))}</span><b class="mono">${esc(mc.releasedAt ?? "—")}</b></div>
      </div>
      ${shaRow("mac-sha", mc.sha256)}
      <p class="dl-note">${esc(t("dl.macNote", "安装包未做公证：首次打开若提示「无法验证开发者」，右键点击 Suveoo 选「打开」，或在「系统设置 → 隐私与安全性」点「仍要打开」。"))}</p>
    </div>` : ""}
  </div>

  <div class="dl-grid">
    <div class="card apk-card">
      <h2 class="apk-h2">${S.ui.icon("download", 16)} ${esc(t("dl.andStepsTitle", "Android 安装步骤"))}</h2>
      <ol class="apk-steps">${steps(4, "apk.step")}</ol>
    </div>
    ${w ? `
    <div class="card apk-card">
      <h2 class="apk-h2">${S.ui.icon("download", 16)} ${esc(t("dl.winStepsTitle", "Windows 安装步骤"))}</h2>
      <ol class="apk-steps">${steps(3, "dl.wstep")}</ol>
    </div>` : ""}
    ${mc ? `
    <div class="card apk-card">
      <h2 class="apk-h2">${S.ui.icon("download", 16)} ${esc(t("dl.macStepsTitle", "macOS 安装步骤"))}</h2>
      <ol class="apk-steps">${steps(3, "dl.mstep")}</ol>
    </div>` : ""}
  </div>

  <section class="card apk-sec">
    <h2 class="apk-h2">${S.ui.icon("shield", 16)} ${esc(t("apk.secTitle", "安全说明"))}</h2>
    <p class="muted">${esc(t("apk.secBody", ""))}</p>
  </section>`;

  /* SHA-256 复制（双卡通用） */
  c.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = async () => {
      const code = document.getElementById(btn.dataset.copy);
      const ok = await S.ui.copy(code ? code.textContent : "");
      btn.textContent = ok ? S.t("apk.copied") : S.t("apk.copy");
      setTimeout(() => (btn.textContent = S.t("apk.copy")), 2000);
    };
  });

  /* 壳内（Android）APK 按钮走原生下载+安装（Update 插件带进度回执+直唤安装器）；
   * Windows/macOS 壳内不走此路——由主进程 /dl/ 拦截转下载流（mac 壳拉起 APK 安装器无意义）。
   * Web 版保持 href 下载。 */
  const apkGo = document.getElementById("apk-go");
  if (apkGo && window.Capacitor?.Plugins?.Update && window.Capacitor.getPlatform?.() !== "windows" && window.Capacitor.getPlatform?.() !== "macos") {
    apkGo.onclick = (e) => {
      e.preventDefault();
      const Upd = window.Capacitor.Plugins.Update;
      const url = base + m.url;
      if (!/^https:\/\/([\w-]+\.)?suveoo\.com\//.test(url)) { S.ui.toast(S.t("apk.updFail"), true); return; }
      let lastToast = 0;
      const li = Upd.addListener("update-progress", (p) => {
        const now = Date.now();
        if (p?.percent != null && now - lastToast > 1500) { lastToast = now; S.ui.toast(S.t("apk.updProg", String(Math.floor(p.percent)) + "%")); }
      });
      S.ui.toast(S.t("apk.updStart"));
      Upd.download({ url }).then((r) => { li?.remove?.(); return Upd.install({ fileUri: r.fileUri }); })
        .catch(() => { li?.remove?.(); S.ui.toast(S.t("apk.updFail"), true); });
    };
  }
});
