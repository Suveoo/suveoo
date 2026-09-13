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
      // 跟随 HTML 里的资源版本参数（?v=bN），i18n JSON 变更后立即生效而非等 max-age 过期
      const av = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1];
      const u = (p) => (av ? `${p}?v=${av}` : p);
      const [main, fb] = await Promise.all([
        withTimeout(fetch(u(`/i18n/${this.lang}.json`)).then((r) => (r.ok ? r.json() : {}))),
        this.lang === "zh-CN" ? Promise.resolve({}) : withTimeout(fetch(u("/i18n/fallback.json")).then((r) => (r.ok ? r.json() : {}))),
      ]);
      this.dict = { ...fb, ...main };
    } catch { this.dict = {}; }
    document.documentElement.lang = this.lang;
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
