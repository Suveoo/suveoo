/* Suveoo service worker — 应用壳预缓存 + HTML network-first + 离线兜底 */
const CACHE = "suveoo-v4";
const SHELL = [
  "/assets/css/tokens.css", "/assets/css/base.css", "/assets/css/layout.css", "/assets/css/components.css",
  "/assets/css/genui.css", "/assets/css/trust-console.css", "/assets/css/pages.css", "/assets/css/polish.css",
  "/assets/icons/sprite.svg", "/favicon/favicon.svg",
  "/assets/images/suveoo-logo-long.svg", "/assets/images/suveoo-logo-circular.svg", "/assets/images/suveoo-ai-logo.svg",
  "/assets/images/illustrations/empty-state.svg", "/assets/images/illustrations/offline.svg",
  "/i18n/zh-CN.json", "/i18n/zh-TW.json", "/i18n/en-US.json", "/manifest.json", "/404.html", "/offline/index.html",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
/* 连接停滞自愈：超时中止后换新连接重试一次；最终失败返回 undefined 交由调用方兜底 */
async function robustFetch(req, { timeout = 6500, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      return await fetch(new Request(req.url, { method: "GET", headers: req.headers }), { signal: ctrl.signal });
    } catch (err) { /* 超时或网络错误 → 重试 */ }
    finally { clearTimeout(timer); }
  }
  return undefined;
}

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/mcp")) return;
  if (/^\/assets\/(fonts|images)|^\/favicon|^\/flags\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || robustFetch(req).then((res) => { if (!res) return Response.error(); const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
    return;
  }
  e.respondWith((async () => {
    const res = await robustFetch(e.request);
    if (res && res.ok) {
      const cp = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
      return res;
    }
    const hit = await caches.match(e.request);
    if (hit) return hit;
    if (e.request.mode === "navigate") {
      const off = await caches.match("/offline/index.html");
      if (off) return off;
    }
    return res || Response.error();
  })());
});

/* ===== 第四十六轮：系统通知 ===== */
/* Web Push（将来如开通 VAPID 服务器推送可复用此 handler） */
self.addEventListener("push", (e) => {
  let data; try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  e.waitUntil(self.registration.showNotification(data.title || "Suveoo", {
    body: data.body || "", icon: "/favicon/notif-icon-192.png", badge: "/favicon/notif-icon-96.png", tag: data.tag || "suveoo-push",
  }));
});
/* 通知点击 → 按通知携带的目标页打开/聚焦（第五十六轮：按类别精确跳转，无 data.url 回落通知中心） */
self.addEventListener("notificationclick", (e) => {
  const url = e.notification.data?.url || "/notifications";
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
