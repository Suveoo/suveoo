/* router.js — 登录守卫与页面注册 */
S.router = {
  pages: {},
  register(name, fn) { this.pages[name] = fn; },
  async boot() {
    const page = document.body.dataset.page ?? "";
    const needAuth = !["", "home", "login", "register", "recovery", "ai-benchmark", "tools", "about", "help", "contact", "privacy-policy", "cookie-privacy", "terms", "offline",
      "savings-compound", "loan-compare", "goal-planner", "credit-payoff", "retirement", "deposit-compare", "fx-convert", "inflation-calculator", "split-bill-plus", "budget-allocator"].includes(page);
    if (needAuth || page === "home") {
      const sess = await S.auth.session();
      if (needAuth && !sess) {
        /* 标记重定向中：app.js 的看门狗/完成校验检测到此标志即放弃 reload（防循环） */
        S.router.redirecting = true;
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`/account/login?next=${next}`);
        return;
      }
    }
    const fn = this.pages[page];
    if (fn) await fn({ user: await S.auth.session() });
  },
  go(path) { location.href = path; },
  ai(q) { location.href = "/ai?q=" + encodeURIComponent(q); },
};
