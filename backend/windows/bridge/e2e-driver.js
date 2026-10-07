/**
 * e2e-driver.js — Suveoo for Windows E2E 页面侧驱动器（page world）
 * ----------------------------------------------------------------
 * 由壳在 SVEOO_E2E=1 时经协议注入（bridge 目录，frontend 仓库零改动）。
 * 套件经 URL ?e2e=<suite> 启动（sessionStorage 续航跨页导航），按「当前路径」
 * 执行状态机步骤；进度与结论经 console.log("__e2e:" + JSON) 回报主进程。
 * 仅使用公开演示账户（demo@suveoo.com，README 已发布的演示凭据）。
 */
(function () {
  if (window.__e2eDriverLoaded) return;
  window.__e2eDriverLoaded = true;

  const q = new URLSearchParams(location.search);
  if (q.get("e2e")) { try { sessionStorage.setItem("e2eSuite", q.get("e2e")); } catch {} }
  const suite = (() => { try { return sessionStorage.getItem("e2eSuite"); } catch { return null; } })();
  if (!suite) return;

  const emit = (m) => { try { console.log("__e2e:" + JSON.stringify(Object.assign({ suite }, m))); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (fn, timeout, poll) => { const t0 = Date.now(); for (;;) { let v = false; try { v = !!fn(); } catch {} if (v) return true; if (Date.now() - t0 > (timeout || 15000)) return false; await sleep(poll || 400); } };
  const val = (id, v) => { const el = document.getElementById(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); return true; };
  const click = (id) => { const el = document.getElementById(id); if (el) el.click(); return !!el; };
  const token = () => { try { return localStorage.getItem("suveoo_token"); } catch { return null; } };
  const api = async (p, init, tok) => {
    const base = (window.S && S.api && S.api.base) || "";
    const r = await fetch(base + p, Object.assign({ cache: "no-store" }, init || {}, { headers: Object.assign({ "content-type": "application/json" }, tok ? { authorization: "Bearer " + tok } : {}) }));
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const shot = (name) => emit({ t: "shot", name });
  const dbg = (msg) => emit({ t: "dbg", msg: String(msg).slice(0, 200) });
  const done = (pass, detail) => emit({ t: "done", pass, detail: String(detail).slice(0, 400) });
  const nav = (p) => location.assign(p);

  const DEMO = { id: "demo@suveoo.com", pw: "jinrongkeji2026" }; // 公开演示凭据（README 已发布）
  /* OTP 回填轮询：/__win/e2e-otp.txt 由外部脚本（browser-use 读 Gmail 后）写入；取到即清零防串用 */
  async function waitOtpFromFile(timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 180000)) {
      await sleep(500);
      try {
        const r = await fetch("/__win/e2e-otp.txt", { cache: "no-store" });
        const t = (await r.text()).trim();
        if (/^\d{6}$/.test(t)) return t;
      } catch {}
    }
    return null;
  }

  /* 壳内黄卡确认卡会触发 Windows Hello 在场校验（consent.js Biometric.verify）——
   * E2E 隐藏窗口无人应答系统弹窗会卡死。transfer 套件桩为通过；Hello 真实路径由
   * 专项套件（credential）单独验证。 */
  function stubBiometricVerifyForAutomation() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Biometric) {
        window.Capacitor.Plugins.Biometric.verify = () => Promise.resolve({ ok: true });
        dbg("Biometric.verify 已桩（自动化隔离）");
      }
    } catch {}
  }

  /* fetch 观测（响应后记录，失败也记录——诊断 CORS/网络问题的唯一窗口） */
  if (!window.__e2eFetchHooked) {
    window.__e2eFetchHooked = true;
    const of_ = window.fetch;
    window.fetch = function (...a) {
      const p = of_.apply(this, a);
      const u = String(a[0]);
      if (u.indexOf("/api/") >= 0) {
        p.then((r) => dbg("fetch " + u.slice(-34) + " → " + r.status), () => dbg("fetch失败 " + u.slice(-34)));
      }
      return p;
    };
    window.addEventListener("error", (e) => dbg("window.error: " + String(e.message).slice(0, 140) + " @" + String(e.filename || "").slice(-40)));
    window.addEventListener("unhandledrejection", (e) => dbg("unhandledRejection: " + String((e.reason && e.reason.message) || e.reason).slice(0, 140)));
  }

  async function fillLoginAndSubmit() {
    if (!await wait(() => document.getElementById("l-go"), 10000)) { dbg("l-go 未出现"); return false; }
    await sleep(1000); // i18n 就绪会重跑控制器重渲染——等表单稳定再填
    val("l-id", DEMO.id); val("l-pw", DEMO.pw);
    await sleep(200);
    click("l-go");
    const ok = await wait(() => token(), 25000, 500);
    if (!ok) shot("login-fail");
    return ok;
  }

  const ROUTES = {
    "demo-login": {
      "/home": async () => done(!!token(), "登录成功落地 /home，token=" + !!token()),
      "/account/login": async () => {
        const ok = await fillLoginAndSubmit();
        if (!ok) return done(false, "25s 内未取得 token");
        dbg("token 已取得，等待 /home 落地");
      },
    },

    "transfer-yellow": {
      "/home": async () => { if (!token()) return done(false, "落地 /home 但无 token"); nav("/transfer/intrabank"); },
      "/account/login": async () => {
        if (!await fillLoginAndSubmit()) return done(false, "登录失败");
        nav("/transfer/intrabank");
      },
      "/transfer/intrabank": async () => {
        if (!await wait(() => document.getElementById("t-go"), 10000)) return done(false, "转账表单未出现");
        stubBiometricVerifyForAutomation();
        const pr = await api("/api/payees", null, token());
        const payee = pr.body && (pr.body.payees || [])[0];
        if (!payee || !payee.name) return done(false, "demo 无种子收款人");
        val("t-name", String(payee.name));
        val("t-acct", String(payee.account || payee.card || payee.card_no || ""));
        val("t-amt", "10");
        await sleep(1500);
        click("t-go");
        if (!await wait(() => document.getElementById("ck-ok"), 20000)) { shot("no-card"); return done(false, "确认卡未出现"); }
        shot("confirm-card");
        const before = await api("/api/transfers?scope=all", null, token());
        /* 红级 OTP 流：点「发送验证码」→ 外部脚本从邮箱读码写入 e2e-otp.txt → 轮询取码回填 */
        if (document.getElementById("ck-otp")) {
          const send = document.getElementById("ck-send");
          if (send) { send.click(); dbg("已请求验证码（等待外部回填）"); emit({ t: "otp-wait" }); }
          let code = "";
          for (let i = 0; i < 360; i++) { // 最长 180s
            await sleep(500);
            try { const r = await fetch("/__win/e2e-otp.txt", { cache: "no-store" }); const t = (await r.text()).trim(); if (/^\d{6}$/.test(t)) { code = t; break; } } catch {}
          }
          if (!code) { shot("otp-timeout"); return done(false, "180s 内未取到验证码"); }
          dbg("验证码已取到，回填确认");
          document.getElementById("ck-otp").value = code;
        }
        const okBtn = document.getElementById("ck-ok");
        okBtn && okBtn.click();
        await sleep(800);
        const headTxt = (document.querySelector(".gc-head") || {}).textContent || "";
        dbg("点击后 mask=" + !!document.querySelector(".modal-mask") + " 卡头=" + headTxt.replace(/\s+/g, " ").slice(0, 60));
        const finished = await wait(() => !document.querySelector(".modal-mask"), 30000);
        await sleep(1500);
        shot("executed");
        const after = await api("/api/transfers?scope=all", null, token());
        const cnt = (x) => ((x.body && (x.body.tx || x.body.transfers)) || []).length;
        const grew = cnt(after) > cnt(before);
        done(finished && grew, "确认卡→执行=" + finished + "；流水 " + cnt(before) + "→" + cnt(after) + "；收款人=" + payee.name);
      },
    },

    "transfer-red-xyz": {
      /* 登录成功的落地页（应用 login.js 会 location.replace 到 /home）→ 直奔转账页 */
      "/home": async () => {
        dbg("/home 落地 token=" + !!token() + " readyState=" + document.readyState);
        if (!token()) return done(false, "落地 /home 但无 token");
        nav("/transfer/intrabank");
      },
      /* 第一步：登录（2FA 邮箱码）。账户凭据经 /__win/e2e-creds.json 注入（E2E 专用文件，不入仓库） */
      "/account/login": async () => {
        if (!await wait(() => document.getElementById("l-go"), 10000)) return done(false, "登录表单未出现");
        let creds = null;
        try { const r = await fetch("/__win/e2e-creds.json", { cache: "no-store" }); creds = await r.json(); } catch {}
        if (!creds || !creds.id || !creds.pw) return done(false, "e2e-creds.json 未注入");
        /* 已有有效会话且账户匹配 → 直接进转账页（省一轮 OTP） */
        if (token()) {
          try {
            const s = await api("/api/session", null, token());
            if (s.body && (s.body.email === creds.id || (s.body.user && s.body.user.email === creds.id))) {
              dbg("复用既有会话：" + creds.id);
              return nav("/transfer/intrabank");
            }
          } catch {}
        }
        try {
          const suiteBak = sessionStorage.getItem("e2eSuite"); // clear 会连带清掉套件名——先备份
          localStorage.removeItem("suveoo_token");
          sessionStorage.clear();
          if (suiteBak) sessionStorage.setItem("e2eSuite", suiteBak);
        } catch {} // 清残留会话（防止假阳性登录判定）
        await sleep(1000);
        val("l-id", creds.id); val("l-pw", creds.pw);
        await sleep(200);
        click("l-go");
        if (!await wait(() => document.getElementById("l-otp"), 20000)) { shot("no-2fa"); return done(false, "2FA 表单未出现"); }
        await sleep(600);
        shot("2fa-form");
        /* 默认通道=短信（绑手机号账户）：点切换条改邮箱发码（60s 冷却则等待重试） */
        for (let attempt = 0; attempt < 3; attempt++) {
          const btn = document.querySelector("#l-form2 .ph-switch-btn[data-ch=email], .ph-switch-btn[data-ch=email]");
          if (!btn) break; // 已切换（切换条重建为反向）或本就无切换条
          btn.click();
          await sleep(3000);
          if (!document.querySelector(".ph-switch-btn[data-ch=email]")) break; // 切换成功
          dbg("切换通道冷却，60s 后重试 #" + (attempt + 1));
          await sleep(61000);
        }
        dbg("otp-need:login（邮箱通道）");
        emit({ t: "otp-wait", phase: "login" });
        const code = await waitOtpFromFile(180000);
        if (!code) { shot("otp-login-timeout"); return done(false, "登录码 180s 未回填"); }
        document.getElementById("l-otp").value = code;
        click("l-go2");
        const ok = await wait(() => token(), 25000, 500);
        if (!ok) { shot("2fa-fail"); return done(false, "2FA 验证未通过"); }
        dbg("登录成功（2FA）");
        nav("/transfer/intrabank");
      },
      /* 第二步：红级转账 ¥10 —— 确认卡(RED) → 通道切邮箱 → 发码 → 回填 → 执行 → 流水核对 */
      "/transfer/intrabank": async () => {
        if (!await wait(() => document.getElementById("t-go"), 10000)) return done(false, "转账表单未出现");
        stubBiometricVerifyForAutomation();
        const pr = await api("/api/payees", null, token());
        const payee = pr.body && (pr.body.payees || [])[0];
        if (!payee || !payee.name) return done(false, "XYZ 无收款人");
        val("t-name", String(payee.name));
        val("t-acct", String(payee.account || payee.card || ""));
        val("t-amt", "10");
        await sleep(1500);
        click("t-go");
        if (!await wait(() => document.getElementById("ck-ok"), 20000)) { shot("no-card"); return done(false, "确认卡未出现"); }
        shot("confirm-card");
        const headTxt = (document.querySelector(".gc-head") || {}).textContent || "";
        dbg("确认卡：" + headTxt.replace(/\s+/g, " ").slice(0, 40));
        const before = await api("/api/transfers?scope=all", null, token());
        if (document.getElementById("ck-otp")) {
          dbg("红卡带 OTP：默认通道切换邮箱 + 发码");
          const sw = document.querySelector(".ph-switch");
          if (sw) { sw.dispatchEvent(new CustomEvent("phswitch", { detail: { channel: "email" }, bubbles: true })); dbg("通道已切邮箱（事件）"); }
          await sleep(300);
          click("ck-send");
          /* 60s 邮箱池冷却：按钮没进入倒计时即首发失败——等 61s 重发（最多 3 轮） */
          for (let attempt = 0; attempt < 3; attempt++) {
            await sleep(2500);
            const sb = document.getElementById("ck-send");
            if (!sb) break;
            const cooling = sb.disabled || /\d+\s*s|重发|resend/i.test(sb.textContent);
            dbg("发码按钮态：" + sb.textContent.trim().slice(0, 16) + " disabled=" + sb.disabled + (cooling ? "（冷却/已发）" : "（需重试）"));
            if (cooling) break;
            await sleep(61000);
            const sb2 = document.getElementById("ck-send");
            if (sb2 && !sb2.disabled) { sb2.click(); }
          }
          dbg("otp-need:redstep");
          emit({ t: "otp-wait", phase: "redstep" });
          const code = await waitOtpFromFile(200000);
          if (!code) { shot("otp-red-timeout"); return done(false, "红级码 200s 未回填"); }
          document.getElementById("ck-otp").value = code;
        }
        click("ck-ok");
        const finished = await wait(() => !document.querySelector(".modal-mask"), 40000);
        await sleep(1800);
        shot("executed");
        const after = await api("/api/transfers?scope=all", null, token());
        const cnt = (x) => ((x.body && (x.body.tx || x.body.transfers)) || []).length;
        const grew = cnt(after) > cnt(before);
        done(finished && grew, "红卡OTP→执行=" + finished + "；流水 " + cnt(before) + "→" + cnt(after) + "；收款人=" + payee.name + "；卡=" + headTxt.replace(/\s+/g, "").slice(0, 20));
      },
    },

    "i18n-switch": {
      "/home": async () => {
        if (!await wait(() => window.S && S.i18n, 10000)) return done(false, "i18n 未就绪");
        const marks = [];
        for (const lang of ["zh-CN", "zh-TW", "en-US"]) {
          try { S.i18n.set(lang); } catch (e) { return done(false, "set(" + lang + ") 抛错"); }
          await sleep(700);
          const missing = (document.body.innerHTML.match(/\[missing[^\]]*\]/g) || []).length;
          shot("lang-" + lang);
          marks.push(lang + ":missing=" + missing + ",title=" + document.title.slice(0, 16));
        }
        try { S.i18n.set("zh-CN"); } catch {}
        done(marks.every((m) => m.indexOf("missing=0") >= 0), marks.join(" | "));
      },
    },

    "external-browser": {
      "/home": async () => {
        await wait(() => window.S, 10000);
        window.open("https://example.com", "_blank");
        emit({ t: "ext-opened" });
        await sleep(6500); // 主进程在此窗口内完成子窗校验+截图
        done(true, "外链已发起，子窗校验由主进程记录");
      },
    },

    "offline-resilience": {
      "/account/login": async () => {
        if (!await wait(() => document.getElementById("l-go"), 10000)) return done(false, "断网下登录表单未渲染（本地资产失效）");
        shot("offline-login");
        emit({ t: "phase", phase: "offline" });
        await sleep(600);
        val("l-id", DEMO.id); val("l-pw", DEMO.pw);
        await sleep(200);
        click("l-go");
        let errSeen = false;
        for (let i = 0; i < 60; i++) { // 15s 超时 + toast 展示窗
          await sleep(300);
          if (!errSeen && document.querySelector(".toast,.banner,[class*=err],[role=alert]")) errSeen = true;
          const b = document.getElementById("l-go");
          if (b && !b.disabled) break; // 首次请求终态（超时回落后按钮解锁）
        }
        if (!errSeen) dbg("无提示：btn.disabled=" + document.getElementById("l-go").disabled + " wrap=" + !!document.querySelector(".toast-wrap"));
        const errVisible = errSeen;
        emit({ t: "phase", phase: "online" });
        await sleep(1200);
        /* 等首段请求完全落定后重试（按钮仍 busy 时点击无效） */
        for (let i = 0; i < 70; i++) { const b = document.getElementById("l-go"); if (b && !b.disabled) break; await sleep(300); }
        click("l-go");
        const recovered = await wait(() => token(), 25000, 500);
        shot("recovered");
        done(errVisible && recovered, "断网本地渲染=true；错误提示=" + errVisible + "；恢复登录=" + recovered);
      },
    },

    "update-ask": {
      "/home": async () => {
        const ok = await wait(() => document.querySelector(".upd-mask"), 85000, 800);
        shot("ask");
        done(ok, ok ? "发现新版本询问弹窗出现（soft 级）" : "85s 内未出现询问弹窗");
      },
    },

    "update-force": {
      "/home": async () => {
        const ok = await wait(() => document.querySelector(".upd-force"), 85000, 800);
        shot("force");
        done(ok, ok ? "强制更新阻断层出现（force 级）" : "85s 内未出现阻断层");
      },
    },
  };

  const run = async () => {
    const routes = ROUTES[suite];
    if (!routes) return done(false, "未知套件: " + suite);
    dbg("driver 启动 path=" + location.pathname + " S=" + (typeof window.S) + " Capacitor=" + (typeof window.Capacitor));
    const handler = Object.keys(routes).find((p) => location.pathname.indexOf(p) >= 0);
    if (!handler) {
      dbg("无处理器页：" + location.pathname + "，跳回入口");
      return nav(Object.keys(routes)[0]);
    }
    try { await routes[handler](); } catch (e) { shot("error"); done(false, String((e && e.message) || e)); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => run(), { once: true });
  else run();
})();
