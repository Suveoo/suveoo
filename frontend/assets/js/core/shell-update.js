/* shell-update.js — Android 壳内「检查更新」（第七十二轮手动；第七十五轮自动+强制两级；第九十二轮侵入式诊断）。
 * 仅由 build-apk.mjs 注入 APK 产物（Web HTML 不引用 → 网页版零加载零影响）。
 *
 * 三层入口：
 *  ① 手动：账户页偏好「检查更新」→ S.shellUpdate.open()（弹窗全流程，v2.8 行为保留）；
 *  ② 自动（第七十五轮）：注入后 ~2.5s 静默检查（sessionStorage 保证每次 App 会话一次；
 *     手动弹窗打开时让位）——新版本但未达强制线 → 可询问弹窗（"稍后提醒"记 24h 频控）；
 *  ③ 强制：versionCode < manifest.minVersionCode（服务端可调的最低安全版本线）→ 全屏阻断层
 *     .upd-force（无关闭途径；银行合规惯例：解释原因+立即更新）——更新完成前 App 不可用。
 * 下载进度条为公共渲染（手动卡/强制层同款）；安装走原生 install（Android 8+ 首次授权引导）。
 * 诊断（第九十二轮）：每步 console.error + DOM #upd-diag 可见标记（Chrome DevTools / logcat 可查）。 */
(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Update) {
    /* 第九十二轮诊断：guard 失败时的可见标记（区分"插件桥不可见" vs "代码跑了但后续失败"） */
    console.error("[upd] guard fail: Capacitor=" + typeof window.Capacitor + " Plugins=" + typeof (window.Capacitor && window.Capacitor.Plugins) + " Update=" + typeof (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Update));
    try {
      document.addEventListener("DOMContentLoaded", () => {
        const d = document.createElement("div");
        d.id = "upd-diag";
        d.style.cssText = "position:fixed;bottom:2px;left:2px;z-index:99999;font-size:9px;color:red;pointer-events:none";
        d.textContent = "[upd] guard fail — Update plugin not visible";
        document.body.appendChild(d);
      }, { once: true });
    } catch {}
    return;
  }
  const Upd = window.Capacitor.Plugins.Update;
  const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
  const esc = (s) => { try { return S.fmt.escape(String(s)); } catch { return String(s); } };
  const mb = (n) => (n / 1048576).toFixed(1);
  const SKIP_KEY = "suveoo_upd_skip_until", CHK_KEY = "suveoo_upd_checked"; /* SKIP_KEY 已退役（保留声明防误用），贪睡改用 suveoo_upd_skip_<versionCode> */

  let mask = null, card = null, forceEl = null, closing = false;

  const lock = () => { try { S.ui._lockScroll(); } catch {} };
  const unlock = () => { try { S.ui._unlockScroll(); } catch {} };

  const close = () => {
    if (closing || !mask) return;
    closing = true;
    try { Upd.cancelDownload(); } catch {}
    try { Upd.removeAllListeners(); } catch {}
    mask.remove();
    mask = null;
    unlock();
    closing = false;
  };

  const stage = (html) => { card.innerHTML = html; };
  const bindClose = () => { card.querySelectorAll("[data-close]").forEach((b) => { b.onclick = close; }); };

  /* —— 第九十二轮：侵入式诊断标记（每步 console.error+DOM，定位自动检查在哪一步失败） —— */
  const diag = (msg) => {
    /* 第九十三轮：诊断已确认功能正常（队长 v2.30 实测 autoCheck 全链路通），DOM 可见标记退役；
       console.error 保留（logcat 仍可查，零视觉干扰） */
    console.error("[upd]", msg);
  };
  /* 第一百零一轮：诊断环形持久化（localStorage 最近 8 条）——手动弹窗页脚展示"上次自动检查"，
   * 队长点一下手动检查即可看到自动链路跑到哪一步（远程可观测，不再依赖 logcat） */
  const diagLog = (msg) => {
    diag(msg);
    try {
      const arr = JSON.parse(localStorage.getItem("suveoo_upd_diag") ?? "[]");
      arr.push({ t: Date.now(), m: msg });
      localStorage.setItem("suveoo_upd_diag", JSON.stringify(arr.slice(-8)));
    } catch {}
  };
  const autoLogHtml = () => {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem("suveoo_upd_diag") ?? "[]"); } catch {}
    if (!arr.length) return "";
    const last = arr[arr.length - 1];
    try { return `<div class="muted small" style="margin-top:12px;border-top:1px dashed var(--color-line,#e2e8f0);padding-top:8px">上次自动检查：${new Date(last.t).toLocaleString()} · ${esc(last.m)}</div>`; } catch { return ""; }
  };
  /* sessionStorage 访问一律经 try 包裹的读写器（隐私模式/WebView 禁写不致整链静默死） */
  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };

  /* —— 公共：下载进度渲染（手动卡与强制层同款；host=承载容器） —— */
  const renderDownload = (host, info, onDone, onFail) => {
    host.innerHTML = `
      <div class="upd-dl-ing">
        <div class="upd-dl-top"><span class="upd-dl-t">${esc(t("upd.downloading", "正在下载新版本"))} v${esc(info.version)}</span><span class="spin sm" aria-hidden="true"></span></div>
        <div class="upd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="upd-fill"></div></div>
        <div class="upd-dl-meta"><span class="upd-pct">0%</span><span class="upd-mb">0 / ${mb(info.sizeBytes)} MB</span><span class="upd-eta"></span></div>
      </div>`;
    const fill = host.querySelector(".upd-fill"), pct = host.querySelector(".upd-pct"),
      mbEl = host.querySelector(".upd-mb"), eta = host.querySelector(".upd-eta");
    let lastT = Date.now(), lastB = 0, speed = 0, sub = null;
    try {
      sub = Upd.addListener("update-progress", (p) => {
        const now = Date.now();
        const dt = (now - lastT) / 1000;
        if (dt > 0.4) { const v = (p.bytes - lastB) / dt; speed = speed ? speed * 0.6 + v * 0.4 : v; lastT = now; lastB = p.bytes; }
        const pc = p.percent >= 0 ? p.percent : 50;
        fill.style.width = pc + "%";
        pct.textContent = pc + "%";
        mbEl.textContent = mb(p.bytes) + " / " + mb(p.total > 0 ? p.total : p.bytes) + " MB";
        /* 第一百二十三轮修复：剩余时间曾误用 mb()（除以 1048576 的 MB 格式化器）格式化秒数——
         * 任何现实秒数（几秒~几百秒）都被压成 "0.0s"。现按秒数人性化：<60s 一位小数，≥60s 分秒。 */
        if (speed > 0 && pc < 100) {
          const sec = (p.total - p.bytes) / Math.max(speed, 1);
          const etaTxt = sec >= 60 ? Math.floor(sec / 60) + "m" + Math.round(sec % 60) + "s" : sec.toFixed(1) + "s";
          eta.textContent = etaTxt + " · " + mb(speed) + " MB/s";
        }
      });
    } catch { /* 事件桥异常：进度条停在不确定态，下载本身仍会完成 */ }
    Upd.download({ url: info.url }).then((r) => { /* info.url 已由 fetchState 归一为绝对地址（白名单校验后） */
      if (sub) sub.remove?.();
      fill.style.width = "100%";
      pct.textContent = "100%";
      onDone(r.fileUri);
    }).catch((e) => {
      if (sub) sub.remove?.();
      onFail(e);
    });
  };

  /* —— 公共：安装（NEED_INSTALL_PERM 首次授权引导 + 重试） —— */
  const renderInstall = (host, fileUri, info, failBack) => {
    host.innerHTML = `
      <div class="upd-ok">
        <span class="upd-ok-ico" aria-hidden="true">${S.ui.icon("check", 26)}</span>
        <div><div class="upd-ok-t">${esc(t("upd.done", "下载完成"))} · v${esc(info.version)}</div>
        <div class="muted small">${esc(t("upd.installHint", "正在唤起系统安装器，请按屏幕提示完成安装。"))}</div></div>
      </div>
      <div class="upd-actions"><button type="button" class="btn btn-primary upd-install">${esc(t("upd.install", "安装"))}</button></div>`;
    const go = () => {
      Upd.install({ fileUri }).then(() => { /* 安装器已唤起；强制层保持阻断直至安装完成重启 */ })
        .catch((e) => {
          if (String(e?.message ?? "").includes("NEED_INSTALL_PERM")) {
            host.innerHTML = `
              <div class="upd-err">${esc(t("upd.needPerm", "首次安装需允许「安装未知应用」。我们已为你打开系统授权页，请开启后返回并重试。"))}</div>
              <div class="upd-actions"><button type="button" class="btn btn-primary upd-retry">${esc(t("upd.retry", "重试"))}</button></div>`;
            host.querySelector(".upd-retry").onclick = () => renderInstall(host, fileUri, info, failBack);
          } else if (failBack) failBack();
        });
    };
    host.querySelector(".upd-install").onclick = go;
    go(); /* 下载完成直接触发系统安装（需求原文） */
  };

  /* —— 手动弹窗（v2.8 行为） —— */
  const open = () => {
    if (mask || forceEl) return;
    closing = false;
    mask = document.createElement("div");
    mask.className = "modal-mask upd-mask";
    card = document.createElement("div");
    card.className = "modal upd-card";
    card.setAttribute("role", "dialog");
    card.addEventListener("click", (e) => e.stopPropagation());
    mask.appendChild(card);
    mask.addEventListener("click", () => { if (!mask.querySelector(".upd-dl-ing")) close(); });
    mask.addEventListener("updclose", close);
    document.body.appendChild(mask);
    lock();
    runManual();
  };

  const checking = () => {
    stage(`<h3 class="upd-h">${esc(t("upd.title", "检查更新"))}</h3>
      <div class="upd-checking"><span class="spin" aria-hidden="true"></span><span>${esc(t("upd.checking", "正在检查更新…"))}</span></div>`);
  };

  const failed = (retry) => {
    stage(`<h3 class="upd-h">${esc(t("upd.title", "检查更新"))}</h3>
      <div class="upd-err">${esc(t("upd.netFail", "检查更新失败，请检查网络后重试"))}</div>
      <div class="upd-actions"><button type="button" class="btn" data-close="1">${esc(t("common.close", "关闭"))}</button>
      ${retry ? `<button type="button" class="btn btn-primary" id="upd-retry">${esc(t("upd.retry", "重试"))}</button>` : ""}</div>
      ${autoLogHtml()}`);
    bindClose();
    const r = card.querySelector("#upd-retry");
    if (r) r.onclick = () => runManual();
  };

  const showLatest = (vname, vcode) => {
    stage(`<h3 class="upd-h">${esc(t("upd.title", "检查更新"))}</h3>
      <div class="upd-ok">
        <span class="upd-ok-ico" aria-hidden="true">${S.ui.icon("check", 26)}</span>
        <div><div class="upd-ok-t">${esc(t("upd.latest", "已是最新版本"))}</div>
        <div class="muted small">Suveoo v${esc(vname)}（build ${esc(vcode)}）</div></div>
      </div>
      <div class="upd-actions"><button type="button" class="btn btn-primary" data-close="1">${esc(t("common.close", "关闭"))}</button></div>
      ${autoLogHtml()}`);
    bindClose();
  };

  const showFound = (info, cur) => {
    const date = String(info.releasedAt ?? "").replace(/-/g, ".");
    stage(`<h3 class="upd-h">${esc(t("upd.title", "检查更新"))}</h3>
      <div class="upd-found rise-in">
        <span class="upd-badge">${esc(t("upd.found", "发现新版本"))}</span>
        <div class="upd-ver">v${esc(info.version)}<span class="muted small"> · build ${esc(info.versionCode)}</span></div>
        <div class="upd-kv">
          <span class="muted">${esc(t("upd.size", "大小"))}</span><span>${mb(info.sizeBytes)} MB</span>
          <span class="muted">${esc(t("upd.date", "发布日期"))}</span><span>${esc(date)}</span>
          <span class="muted">${esc(t("upd.cur", "当前版本"))}</span><span>v${esc(cur.versionName)}（build ${esc(cur.versionCode)}）</span>
        </div>
      </div>
      <div class="upd-actions">
        <button type="button" class="btn" data-close="1">${esc(t("upd.later", "稍后再说"))}</button>
        <button type="button" class="btn btn-primary" id="upd-dl">${esc(t("upd.download", "下载并安装"))}</button>
      </div>
      ${autoLogHtml()}`);
    bindClose();
    card.querySelector("#upd-dl").onclick = () => startDownload(card, info);
  };

  const startDownload = (host, info) => {
    renderDownload(host, info,
      (fileUri) => renderInstall(host, fileUri, info, () => failed(false)),
      () => {
        host.innerHTML = `<h3 class="upd-h">${esc(t("upd.title", "检查更新"))}</h3>`;
        const box = document.createElement("div");
        host.appendChild(box);
        box.innerHTML = `<div class="upd-err">${esc(t("upd.dlFail", "下载失败，请重试"))}</div>
          <div class="upd-actions"><button type="button" class="btn btn-primary" id="upd-retry2">${esc(t("upd.retry", "重试"))}</button></div>`;
        box.querySelector("#upd-retry2").onclick = () => startDownload(host, info);
      });
  };

  const runManual = async () => {
    checking();
    try {
      const { info, cur } = await fetchState();
      if (Number(info.versionCode) > Number(cur.versionCode)) showFound(info, cur);
      else showLatest(cur.versionName, cur.versionCode);
    } catch (e) { diag("manual ERROR: " + String(e && e.message ? e.message : e)); failed(true); }
  };

  /* —— 数据：manifest + 当前版本（自动/手动共用）——
     URL 安全：manifest.url 一直为相对路径（/dl/xxx.apk，拼 S.api.base=suveoo.com 域）；
     归一为绝对后做白名单校验（仅 https+suveoo.com 及子域）。第七十六轮修复：v2.11 曾直接
     以绝对正则校验相对 url → 恒 fail（队长多网络环境实测"检查更新失败"的根因）。 —— */
  const fetchState = async () => {
    const [infoRes, cur] = await Promise.all([
      fetch((S.api && S.api.base ? S.api.base : "") + "/dl/apk-manifest.json?t=" + Date.now(), { cache: "no-store" }),
      Upd.getInfo(),
    ]);
    if (!infoRes.ok) throw new Error("manifest " + infoRes.status);
    const raw = await infoRes.json();
    if (!raw || !raw.versionCode || !raw.url) throw new Error("manifest bad");
    /* 仅两种合法形态：https 绝对地址，或单斜杠开头的站内相对路径（协议相对 //evil.com 拒收） */
    const isAbs = /^https:\/\//i.test(raw.url), isRel = /^\/(?!\/)/.test(raw.url);
    if (!isAbs && !isRel) throw new Error("url bad form");
    const abs = isAbs ? raw.url : ((S.api && S.api.base) || "https://suveoo.com") + raw.url;
    if (!/^https:\/\/([\w-]+\.)?suveoo\.com\//.test(abs)) throw new Error("url not allowed");
    /* 第一百五十九轮：manifest 版本字段归一——Android apk-manifest 用 version，双 Electron 壳
     * manifest 用 versionName；统一回落防 "vundefined"（历史 manifest 缺字段时旧壳也能正确显示） */
    const info = { ...raw, version: raw.version || raw.versionName || "", url: abs };
    return { info, cur };
  };

  /* ===== 第七十五轮：自动检查 + 强制更新 ===== */

  const fetchCur = async () => {
    try { return await fetchState(); } catch (e) { diag("fetchState error: " + String(e && e.message ? e.message : e)); return null; }
  };

  /* 可选更新询问弹窗（白卡同款；"稍后提醒"=24h 频控） */
  const askOptional = (info, cur) => {
    if (mask || forceEl) return;
    mask = document.createElement("div");
    mask.className = "modal-mask upd-mask";
    card = document.createElement("div");
    card.className = "modal upd-card";
    card.setAttribute("role", "dialog");
    card.innerHTML = `<h3 class="upd-h">${esc(t("upd.found", "发现新版本"))}</h3>
      <div class="upd-found rise-in">
        <div class="upd-ver">v${esc(info.version)}<span class="muted small"> · build ${esc(info.versionCode)}</span></div>
        <p class="muted small" style="margin:2px 0 10px">${esc(t("upd.autoAsk", "是否立即更新？更新期间请保持网络畅通。"))}</p>
        <div class="upd-kv">
          <span class="muted">${esc(t("upd.size", "大小"))}</span><span>${mb(info.sizeBytes)} MB</span>
          <span class="muted">${esc(t("upd.cur", "当前版本"))}</span><span>v${esc(cur.versionName)}（build ${esc(cur.versionCode)}）</span>
        </div>
      </div>
      <div class="upd-actions">
        <button type="button" class="btn" data-close="1">${esc(t("upd.skip24", "稍后提醒"))}</button>
        <button type="button" class="btn btn-primary" id="upd-dl">${esc(t("upd.download", "下载并安装"))}</button>
      </div>`;
    mask.appendChild(card);
    /* 稍后提醒=对"这个版本"贪睡 24h（第一百零一轮：键带 versionCode——新版本发布后立即可问，
     * 旧全局键 suveoo_upd_skip_until 跨版本粘住 24h 的问题一并废除） */
    const skipKeyV = "suveoo_upd_skip_" + info.versionCode;
    const dismiss = () => { close(); try { localStorage.setItem(skipKeyV, String(Date.now() + 86400_000)); } catch {} };
    card.querySelectorAll("[data-close]").forEach((b) => { b.onclick = dismiss; });
    card.querySelector("#upd-dl").onclick = () => startDownload(card, info);
    card.addEventListener("click", (e) => e.stopPropagation());
    mask.addEventListener("click", () => { dismiss(); }); /* 遮罩=稍后提醒（可推迟是软更新的权利） */
    mask.addEventListener("updclose", close);
    document.body.appendChild(mask);
    lock();
  };

  /* 强制更新：全屏阻断层（无关闭；银行合规惯例——解释原因+立即更新） */
  const forceScreen = (info, cur) => {
    if (forceEl) return;
    close(); /* 让位手动弹窗（若开） */
    forceEl = document.createElement("div");
    forceEl.className = "upd-force";
    forceEl.innerHTML = `
      <div class="upd-force-card rise-in">
        <span class="upd-force-ico" aria-hidden="true">${S.ui.icon("shield", 30)}</span>
        <h3>${esc(t("upd.forceTitle", "需要更新"))}</h3>
        <p class="muted">${esc(t("upd.forceBody", "当前版本过旧，为保障账户安全与正常使用，请更新到最新版本后继续使用 Suveoo。"))}</p>
        <div class="upd-kv">
          <span class="muted">${esc(t("upd.cur", "当前版本"))}</span><span>v${esc(cur.versionName)}（build ${esc(cur.versionCode)}）</span>
          <span class="muted">${esc(t("upd.found", "发现新版本"))}</span><span>v${esc(info.version)}（build ${esc(info.versionCode)}）</span>
        </div>
        <div class="upd-force-body"></div>
      </div>`;
    document.body.appendChild(forceEl);
    lock();
    const body = forceEl.querySelector(".upd-force-body");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.style.cssText = "width:100%;margin-top:16px";
    btn.textContent = t("upd.download", "下载并安装");
    body.appendChild(btn);
    btn.onclick = () => {
      const host = document.createElement("div");
      body.replaceChildren(host);
      renderDownload(host, info,
        (fileUri) => renderInstall(host, fileUri, info, null),
        () => {
          host.innerHTML = `<div class="upd-err">${esc(t("upd.dlFail", "下载失败，请重试"))}</div>
            <div class="upd-actions"><button type="button" class="btn btn-primary">${esc(t("upd.retry", "重试"))}</button></div>`;
          host.querySelector(".upd-actions .btn").onclick = () => btn.onclick();
        });
    };
  };

  let autoTried = 0;
  const autoCheck = async () => {
    diagLog("autoCheck fired (page=" + location.pathname + ")");
    if (mask || forceEl) { diagLog("skip: dialog open"); return; }
    if (ssGet(CHK_KEY)) { diagLog("skip: checked this session"); return; }
    const st = await fetchCur();
    if (!st) {
      /* 第一百零一轮修复 A/B：判定未完成不写 CHK_KEY（旧版 fetch 失败也标记 → 冷启 2.5s
       * 网络未就绪即烧掉整个会话，后续页面全跳过=队长双机实测"自动从不弹"的头号候选根因）；
       * 同页 20s/60s 两次重试，页面导航由下页 IIFE 接棒 */
      autoTried++;
      if (autoTried <= 2) {
        const wait = autoTried === 1 ? 20000 : 60000;
        diagLog("fetchCur=null, retry #" + autoTried + " in " + (wait / 1000) + "s");
        setTimeout(autoCheck, wait);
      } else diagLog("fetchCur=null after 2 retries");
      return;
    }
    ssSet(CHK_KEY, "1"); /* 判定成功才记"本会话已查" */
    const { info, cur } = st;
    diagLog("cur=vc" + cur.versionCode + " manifest=vc" + info.versionCode + " min=vc" + (info.minVersionCode ?? 0));
    try {
      if (Number(cur.versionCode) < Number(info.minVersionCode ?? 0)) { diagLog("→ forceScreen"); forceScreen(info, cur); return; }
      if (Number(info.versionCode) > Number(cur.versionCode)) {
        /* 第一百零一轮修复 D：贪睡按"被问的版本"隔离（suveoo_upd_skip_<versionCode>）——
         * 旧版全局 suveoo_upd_skip_until 会跨版本粘住 24h（对 vN 点稍后，vN+1 已发布仍静默）；
         * 旧全局键不再读取（历史粘住值一次性清除，新键只对同版本生效） */
        const skipUntil = Number(localStorage.getItem("suveoo_upd_skip_" + info.versionCode) ?? 0);
        if (skipUntil > Date.now()) { diagLog("snooze v" + info.versionCode + " until " + new Date(skipUntil).toISOString()); return; }
        diagLog("→ askOptional");
        askOptional(info, cur);
      } else {
        diagLog("already latest — no prompt (correct)");
      }
    } catch (e) {
      diagLog("ERROR: " + String(e && e.message ? e.message : e));
    }
  };

  /* 注入即挂自动检查：延迟 3s 避开首屏渲染与 WebView 资源争抢；失败有 20s/60s 重试，
   * 快速重定向页（/ → /home → /login）的定时器被导航取消属预期——用户停留的页面必然接棒 */
  diagLog("IIFE loaded, timer 3000ms armed");
  setTimeout(() => { autoCheck(); }, 3000);

  window.S = window.S || {};
  S.shellUpdate = { open, close, autoCheck, active: () => !!mask || !!forceEl, forced: () => !!forceEl };
})();
