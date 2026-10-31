/* api.js — fetch 封装（JWT、错误、两段式 Consent）
 * base（第四十五轮 Android 壳）：网页版（suveoo.com 域）相对路径照旧零变化；
 * 非 suveoo.com 源（Capacitor 壳 https://localhost / 本地开发 server）API 一律指向生产。 */
S.api = {
  base: /(^|\.)suveoo\.com$/.test(location.hostname) ? "" : "https://suveoo.com",
  tokenKey: "suveoo_token",
  get token() { return localStorage.getItem(this.tokenKey); },
  set token(v) { v ? localStorage.setItem(this.tokenKey, v) : localStorage.removeItem(this.tokenKey); },
  async req(method, path, body, { timeoutMs = 15000, headers: extraHeaders = null } = {}) {
    const headers = { ...(body != null ? { "content-type": "application/json" } : {}), ...(extraHeaders ?? {}) };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    // 超时必须覆盖到 body 读完（连接停滞时 header 可达而 body 永挂）；
    // 幂等 GET 超时后换新连接自动重试一次（等价于用户手点刷新，实测可恢复）
    const attempt = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(this.base + path, { method, headers, cache: "no-store", body: body != null ? JSON.stringify(body) : undefined, signal: ctrl.signal });
        let data = null;
        try { data = await res.json(); } catch { /* 非 JSON */ }
        return { status: res.status, ok: res.ok, data };
      } finally { clearTimeout(timer); }
    };
    let out;
    try {
      out = await attempt();
    } catch (e) {
      /* 断网/连接被拒（TypeError: Failed to fetch）与超时同构处理：统一回落 TIMEOUT
       * 错误对象——此前原生异常直接上抛，调用方多数未捕获（断网时登录按钮永久 spinner 的根因） */
      if (e.name !== "AbortError" && !(e instanceof TypeError)) throw e;
      if (method === "GET") {
        try { out = await attempt(); } catch { out = null; }
      }
      if (!out) out = { status: 0, ok: false, data: { error: { code: "TIMEOUT", message: S.t("common.timeout") } } };
    }
    /* /api/security/* 的 401 是业务性 OTP 错误（OTP_ 码），不应视为会话失效 */
    const isOtpBiz401 = out.data?.error?.code?.startsWith("OTP_");
    if (out.status === 401 && !isOtpBiz401) {
      /* 守卫的业务性 401（红级 OTP_REQUIRED）不是会话失效：不清令牌、不跳登录 */
      if (out.data?.status === "OTP_REQUIRED") return out;
      this.token = null; // 会话失效先清令牌，杜绝带着坏 token 循环
      // 已在登录页时不再跳转（否则 next 参数会无限嵌套）；公开页（工具/门户等）只静默降级为未登录态，不踢去登录页
      /* 会话级防抖：一次过期只触发一次跳转（并发 401 全部让位） */
      const onPublicPage = S.router?.PUBLIC_PAGES?.has(document.body?.dataset?.page ?? "") ?? false;
      if (!onPublicPage && !path.startsWith("/api/auth/") && !location.pathname.startsWith("/account/login") && !sessionStorage.getItem("suveoo_redirecting")) {
        sessionStorage.setItem("suveoo_redirecting", "1");
        sessionStorage.setItem("suveoo_session_expired", "1"); /* 登录页一次性显示"已过期"提示（第六十九轮） */
        /* P3-16：会话失效同样清 SW 缓存（避免离线回退泄露上一会话的页面快照） */
        try { navigator.serviceWorker?.controller?.postMessage({ type: "suveoo:clear-cache" }); } catch { /* ignore */ }
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace((S.router?.navPath?.("/account/login") ?? "/account/login") + `?next=${next}`);
        setTimeout(() => sessionStorage.removeItem("suveoo_redirecting"), 4000);
      }
      return { status: 401, ok: false, data: out.data };
    }
    return out;
  },
  get(path) { return this.req("GET", path); },
  post(path, body) { return this.req("POST", path, body === undefined ? {} : body); },
  patch(path, body) { return this.req("PATCH", path, body); },
  del(path, body) { return this.req("DELETE", path, body); },
  /** 静态数据请求：超时 + 换连接重试；最终失败返回 null（调用方以 if (!data) 兜底） */
  async json(path, { timeoutMs = 8000, retries = 1 } = {}) {
    /* /assets/data/* 追加部署版本参数：绕开 HTTP/SW 的 cache-first（版本随 HTML v= 递增） */
    let url = path;
    if (path.startsWith("/assets/data/")) {
      const v = (document.querySelector('script[src*="?v="]')?.src.match(/[?&]v=([a-z0-9]+)/) ?? [])[1];
      if (v) url = path + (path.includes("?") ? "&" : "?") + "v=" + v;
    }
    for (let i = 0; i <= retries; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
      } catch (err) { clearTimeout(timer); /* 超时/网络错误 → 重试，最终返回 null */ }
    }
    return null;
  },
  /** 下载（带鉴权的 PDF 等） */
  async download(path, filename) {
    const res = await fetch(this.base + path, { headers: this.token ? { authorization: `Bearer ${this.token}` } : {} });
    if (!res.ok) { S.ui.toast(S.t("common.downloadFailed"), true); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  /**
   * 两段式写操作：INPUT_REQUIRED → 弹确认卡（红级含 OTP）→ 带 grant_hash 重试。
   * 返回最终响应（或 {cancelled:true}）。这是表单通道走五道验证的统一入口。
   * opts.action/opts.subject 为确认卡展示提示（如存款页 action="deposit"）；缺省按 IR intent 推导。
   * opts.method 指定 HTTP 方法（默认 POST）——PATCH/DELETE 路由（收款人删除、卡片别名/默认卡）
   * 必须显式传，否则首段即 501（曾致 UI 删除收款人/改别名静默失败）。
   */
  async mutate(path, body, { onEvent = null, action = null, subject = null, method = "POST", proc = null } = {}) {
    let r = await this.req(method, path, body === undefined ? {} : body);
    if (r.data && r.data.status === "INPUT_REQUIRED") {
      const confirmed = await S.consent.modal(r.data, { onEvent, action, subject });
      if (!confirmed) return { cancelled: true };
      /* 第六十一轮：执行段（带 grant 的第二次请求）统一"处理中"反馈——此前确认卡已关、
       * 回执未到，画面完全静止（队长实测转账"像卡了"的窗口，弱网下最长 15s 超时）。
       * proc 传 { key, steps } 定制文案/步骤（转账页），缺省通用文案。 */
      const busy = S.ui.proc(proc ?? undefined);
      try {
        r = await this.req(method, path, { ...body, grant_hash: r.data.grant.grant_hash, otp: confirmed.otp || undefined });
      } finally {
        busy.close();
      }
    } else if (r.data && r.data.status === "OTP_REQUIRED") {
      S.ui.toast(S.t("consent.otpToast"), true);
    }
    return r;
  },
};
