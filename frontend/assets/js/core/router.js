/* router.js — 登录守卫与页面注册 */
S.router = {
  pages: {},
  /* 公开页集合（无需登录可浏览）：boot 的 needAuth 与 api.js 的 401 全局守卫共用——
     过期 token 残留时公开页只清 token 静默降级为未登录态，不强制跳登录（第五期 idle 修：工具深链被弹登录） */
  PUBLIC_PAGES: new Set(["", "home", "login", "register", "recovery", "ai-benchmark", "tools", "about", "help", "contact", "privacy-policy", "cookie-privacy", "terms", "offline", "download",
    "savings-compound", "loan-compare", "goal-planner", "credit-payoff", "retirement", "deposit-compare", "fx-convert", "inflation-calculator", "split-bill-plus", "budget-allocator"]),
  register(name, fn) { this.pages[name] = fn; },
  async boot() {
    const page = document.body.dataset.page ?? "";
    const needAuth = !this.PUBLIC_PAGES.has(page);
    if (needAuth || page === "home") {
      const sess = await S.auth.session();
      if (needAuth && !sess) {
        /* 标记重定向中：app.js 的看门狗/完成校验检测到此标志即放弃 reload（防循环） */
        S.router.redirecting = true;
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(this.navPath(`/account/login`) + `?next=${next}`);
        return;
      }
    }
    const fn = this.pages[page];
    if (fn) await fn({ user: await S.auth.session() });
  },
  /* 壳内路径适配（第四十六轮）：WebView 纯静态，/xxx 不会自动补 /index.html → 404 → 根 index.html 的
   * 相对路径 home/index.html 从 /account/ 解析成 /account/home/index.html（队长 S22 Ultra 实测白屏根因）。
   * Web 版（suveoo.com）由 Worker 路由自动补，不受影响。 */
  navPath(p) {
    if (!S.api?.base || typeof p !== "string") return p;
    if (/\.[a-z0-9]+(\?|$|#)/i.test(p)) return p; /* 已有文件后缀 */
    if (p.includes("?") || p.includes("#")) {
      const u = new URL(p, "https://x");
      u.pathname = u.pathname.replace(/\/?$/, "/") + "index.html";
      return u.pathname + u.search + u.hash;
    }
    return p.replace(/\/?$/, "/") + "index.html";
  },
  go(path) { location.href = this.navPath(path); },
  ai(q) { location.href = "/ai?q=" + encodeURIComponent(q); },
};
