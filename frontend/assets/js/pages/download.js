/* download.js — 第六十八轮：APK 官方下载页（无任何站内入口，仅 URL 直达；noindex）。
 * 版本/大小/SHA-256 全部读 /dl/apk-manifest.json（R2 常驻，APK 升级只传新包+改 manifest，
 * 本页零改动）；manifest 拉取失败回落内置常量（页面永不空白）。i18n 四语即时切换
 * （S.i18n.set 会重跑本控制器）。响应式：桌面双栏 / ≤820px 单栏。 */
S.router.register("download", async () => {
  const c = document.getElementById("content");
  const FALLBACK = { file: "Suveoo-v2.5.apk", url: "/dl/Suveoo-v2.5.apk", version: "2.5", versionCode: 16, sizeBytes: 36854433, sha256: "60c7ff92d26990254984e8086f958bf9c798f9208c73330427f0513f495ead65", releasedAt: "2026-10-02", minAndroid: 7.0 };
  let m = FALLBACK;
  try {
    const r = await fetch("/dl/apk-manifest.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); if (j && j.url && j.sha256) m = j; }
  } catch { /* 回落内置常量 */ }
  const mb = (m.sizeBytes / 1024 / 1024).toFixed(1);
  const sha = String(m.sha256);
  c.innerHTML = `
  <section class="apk-hero">
    <div class="apk-hero-in">
      <img class="apk-icon" src="/assets/images/suveoo-logo-square.svg?v=${S.ui.v()}" alt="Suveoo">
      <div class="apk-hero-txt">
        <h1>${S.fmt.escape(S.t("apk.title"))}</h1>
        <p>${S.fmt.escape(S.t("apk.subtitle"))}</p>
        <a class="btn apk-dl-btn" id="apk-go" href="${S.fmt.escape(m.url)}" download="${S.fmt.escape(m.file)}" rel="nofollow">
          ${S.ui.icon("download", 20)} ${S.fmt.escape(S.t("apk.btn"))}</a>
      </div>
    </div>
  </section>
  <div class="apk-grid">
    <div class="card apk-card">
      <div class="apk-kv"><span class="muted">${S.fmt.escape(S.t("apk.version"))}</span><b>v${S.fmt.escape(String(m.version))} <span class="apk-vc">(${S.fmt.escape(String(m.versionCode))})</span></b></div>
      <div class="apk-kv"><span class="muted">${S.fmt.escape(S.t("apk.size"))}</span><b>${mb} MB</b></div>
      <div class="apk-kv"><span class="muted">${S.fmt.escape(S.t("apk.released"))}</span><b class="mono">${S.fmt.escape(String(m.releasedAt))}</b></div>
      <div class="apk-kv"><span class="muted">${S.fmt.escape(S.t("apk.require"))}</span><b>${S.fmt.escape(S.t("apk.requireVal"))}</b></div>
      <div class="apk-sha">
        <span class="lb">${S.fmt.escape(S.t("apk.sha"))}</span>
        <div class="apk-sha-row"><code class="mono" id="apk-sha">${S.fmt.escape(sha)}</code>
          <button class="btn btn-ghost btn-sm" id="apk-copy">${S.fmt.escape(S.t("apk.copy"))}</button></div>
      </div>
    </div>
    <div class="card apk-card">
      <h2 class="apk-h2">${S.fmt.escape(S.t("apk.stepsTitle"))}</h2>
      <ol class="apk-steps">
        ${[1, 2, 3, 4].map((i) => `<li><span class="apk-step-n">${i}</span><span>${S.fmt.escape(S.t("apk.step" + i))}</span></li>`).join("")}
      </ol>
    </div>
  </div>
  <section class="card apk-sec">
    <h2 class="apk-h2">${S.ui.icon("shield", 16)} ${S.fmt.escape(S.t("apk.secTitle"))}</h2>
    <p class="muted">${S.fmt.escape(S.t("apk.secBody"))}</p>
  </section>`;
  const copyBtn = document.getElementById("apk-copy");
  if (copyBtn) copyBtn.onclick = async () => {
    const ok = await S.ui.copy(sha);
    copyBtn.textContent = ok ? S.t("apk.copied") : S.t("apk.copy");
    setTimeout(() => (copyBtn.textContent = S.t("apk.copy")), 2000);
  };
  /* 第一百二十二轮：壳内（Capacitor Update 插件可用）下载按钮走原生下载+安装——
   * 不再 href 导航（壳内 /dl/ 相对路径会落到本地资产 404；绝对路径则进内嵌浏览器跳系统链路，
   * 均劣于原生：Update 插件带进度回执+FileProvider 直唤安装器）。Web 版保持默认 href 下载。 */
  const apkGo = document.getElementById("apk-go");
  if (apkGo && window.Capacitor?.Plugins?.Update) {
    apkGo.onclick = (e) => {
      e.preventDefault();
      const Upd = window.Capacitor.Plugins.Update;
      const url = ((S.api && S.api.base) || "") + m.url;
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
