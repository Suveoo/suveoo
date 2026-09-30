/* prefetch.js — 第二十一轮：访问时预热策略（不动缓存规则）。
   当前页面就绪后，在浏览器 idle 时段按「其他页面 HTML → 其引用资源」的顺序串行低优先级预取；
   请求与正常导航同源同路径，经既有 SW robustFetch / HTTP 缓存自然存储，后续跳转直接命中。
   策略约束：每会话至多完整预热一次（sessionStorage）；省流模式（saveData）/2g 网络跳过；
   只预取同源静态资源，绝不触碰 /api/*；页面清单来自 /sitemap.xml（免维护）。 */
S.prefetch = (() => {
  const MARK = "suveoo.pf.done";
  const queue = [];
  /* seen = 已入队或已完成的 URL。必须在入队时同步标记（而非取数时）：
     各页静态 HTML 引用 ~30 个全站共享资源，若取数时才标记，前 68 页收割时共享资源
     尚未入 seen，会各自重复推入队列（实测虚胀至 ~1900 项）；入队即标记则队列 ≈ 唯一 URL 总数 */
  const seen = new Set();
  let started = false, doneCount = 0, retries = 0;

  const allowed = () => {
    try {
      if (sessionStorage.getItem(MARK) === "1") return false;
      const c = navigator.connection;
      if (c && (c.saveData || /(^2g$|^slow-2g$)/.test(c.effectiveType || ""))) return false;
      return location.pathname.startsWith("/account/login") === false;
    } catch { return false; }
  };

  /* 从一份 HTML 文本提取同源资源引用（css/js/img），预取请求与页面加载同形 */
  const harvest = (htmlText, pageUrl) => {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const urls = [];
    doc.querySelectorAll('link[rel="stylesheet"][href], script[src], img[src]').forEach((el) => {
      const u = el.getAttribute("href") || el.getAttribute("src");
      if (u && !u.startsWith("data:")) urls.push(u);
    });
    return urls
      .map((u) => { try { return new URL(u, pageUrl).href; } catch { return null; } })
      .filter((u) => u && u.startsWith(location.origin) && !u.includes("/api/") && !seen.has(u));
  };

  const fetchOne = async (url) => {
    try {
      const r = await fetch(url, { priority: "low", credentials: "same-origin" });
      /* 站内页面全部是无扩展名干净 URL（sitemap loc），不能靠 .html 后缀判定，按 content-type 判定。
         页面 HTML：读取正文触发完整缓存并收割其引用资源入队。
         SW robustFetch 返回的响应 body 可能已被 SW 侧消费——一律 clone() 后读取，原响应交给缓存链 */
      if (r.ok && (r.headers.get("content-type") || "").includes("text/html")) {
        const text = await r.clone().text();
        harvest(text, url).forEach((u) => { if (!seen.has(u)) { seen.add(u); queue.push(u); } });
      } else {
        await r.clone().blob().catch(() => {});
      }
      doneCount++;
    } catch { /* 单个资源预取失败静默跳过，不影响队列其余项 */ }
  };

  /* idle 泵：每个空闲片段处理 1-2 个请求，队列未清空则继续排队（timeout 5s 防饿死） */
  const pump = () => {
    const slice = (deadline) => {
      let budget = 2;
      while (deadline.timeRemaining() > 8 && queue.length && budget-- > 0) fetchOne(queue.shift());
      if (queue.length) schedule();
      else { try { sessionStorage.setItem(MARK, "1"); } catch { /* 静默 */ } }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(slice, { timeout: 5000 });
    else setTimeout(() => slice({ timeRemaining: () => 30 }), 800);
  };
  const schedule = () => ("requestIdleCallback" in window ? requestIdleCallback(pump, { timeout: 5000 }) : setTimeout(pump, 800));

  const start = async () => {
    if (started || !allowed()) return;
    started = true;
    try {
      /* 页面清单：sitemap.xml（69 indexable loc）→ 各页 HTML 入队（当前页排最前，其资源随后收割）。
         SW robustFetch 的响应 body 可能已被消费——clone() 后读取。
         页面加载早期 SW 可能未稳定致 fetch 失败：失败不锁死，退避 15s 重试（最多 3 次）。 */
      const smRes = await fetch("/sitemap.xml", { priority: "low" });
      const sm = await smRes.clone().text().catch(() => "");
      if (!sm) { started = false; if (retries < 3) { retries++; setTimeout(() => S.prefetch.start(), 15000); } return; }
      const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, ""));
      const pages = locs.filter((u) => !u.includes("/demo-lab") && !seen.has(u));
      const cur = location.origin + location.pathname.replace(/\/$/, "");
      const ordered = [cur, ...pages.filter((u) => u !== cur)];
      ordered.forEach((u) => { if (!seen.has(u)) { seen.add(u); queue.push(u); } });
      pump();
    } catch {
      started = false;
      if (retries < 3) { retries++; setTimeout(() => S.prefetch.start(), 15000); }
    }
  };

  return { start, stats: () => ({ queued: queue.length, done: doneCount }) };
})();

/* 启动：首屏渲染让路——load 完成后的首个空闲片启动（无 rIC 环境退 600ms 定时器）；
   8s 兜底定时器防 load 迟迟不触发；boot 幂等，同会话再次进入页面由 MARK 拦截 */
(() => {
  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    if ("requestIdleCallback" in window) requestIdleCallback(() => S.prefetch.start(), { timeout: 3000 });
    else setTimeout(() => S.prefetch.start(), 600);
  };
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
  setTimeout(boot, 8000);
})();
