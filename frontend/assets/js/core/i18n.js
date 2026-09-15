/* i18n.js — 三语（zh-CN 默认 / zh-TW / en-US），fallback 兜底 */
S.i18n = {
  dict: {},
  lang: localStorage.getItem("suveoo.lang") || "zh-CN",
  langs: [
    { code: "zh-CN", name: "简体中文（中国大陆）", flag: "/flags/cn.svg" },
    { code: "zh-TW", name: "繁體中文", flag: "/flags/cn.svg" },
    { code: "en-US", name: "English（US）", flag: "/flags/us.svg" },
  ],
  t(key, ...args) {
    let s = this.dict[key] ?? key;
    args.forEach((v, i) => { s = s.replace(`{${i}}`, v); });
    return s;
  },
  async init() {
    try {
      const withTimeout = (p, ms = 4000) => Promise.race([p, new Promise((r) => setTimeout(() => r({}), ms))]);
      /* 跟随 HTML 资产版本（?v=bNN），语言包更新随部署立即生效；404 → fallback 机制照旧 */
      const av = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1];
      const u = (f) => `/i18n/${f}.json${av ? "?v=" + av : ""}`;
      const load = (f) => fetch(u(f)).then((r) => (r.ok ? r.json() : {}));
      const list = this.lang === "zh-CN" ? ["zh-CN"] : [this.lang, "zh-CN"];
      const parts = await Promise.all(list.map((f) => withTimeout(load(f))));
      this.dict = Object.assign({}, ...parts.filter(Boolean));
      document.documentElement.lang = this.lang;
    } catch { this.dict = {}; }
  },
  async set(code) {
    if (code === this.lang) return;
    localStorage.setItem("suveoo.lang", code);
    document.cookie = `suveoo_lang=${code}; max-age=31536000; path=/; Secure; SameSite=Lax`;
    this.lang = code;
    try {
      // 即时生效：加载新词典后就地重建 chrome 与当前页面，不再整页刷新
      await this.init();
      if (!Object.keys(this.dict).length) throw new Error("dict empty");
      if (S.chrome?.rerender) await S.chrome.rerender();
      else throw new Error("no chrome");
      const fn = S.router.pages[document.body.dataset.page ?? ""];
      if (fn) await fn({ user: await S.auth.session(true) });
    } catch (e) {
      console.error("[i18n] live switch failed, reloading", e);
      location.reload();
    }
  },
};
S.t = (key, ...args) => S.i18n.t(key, ...args);
