/* ga4.js — gtag + Consent Mode v2（默认 denied；每次加载恢复已保存同意；分类化授权）
   注意：本文件先于 defer 的 core 脚本执行，必须自建命名空间。
   信号映射：全部=四信号 granted；自定义=仅 analytics_storage 按选择，ad_* 保持 denied；必要=全部 denied。
   存储双通道（第一百五十七轮）：cookie 为主（Web 不变）；localStorage 镜像兜底——
   客户端壳（Capacitor/Electron 本地协议 origin）的 document.cookie 不随导航持久，
   无兜底时 Cookie 偏好弹窗会每个页面重弹（队长实测）。 */
window.S = window.S || {};
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  const LS_CONSENT = "suveoo_cookie_consent";
  const LS_ANA = "suveoo_consent_analytics";
  /** 写：cookie（Web 主通道）+ localStorage 镜像（壳内兜底） */
  const setConsent = (v, ana) => {
    document.cookie = `suveoo_cookie_consent=${v}; max-age=31536000; path=/; Secure; SameSite=Lax`;
    document.cookie = `suveoo_consent_analytics=${ana}; max-age=31536000; path=/; Secure; SameSite=Lax`;
    try { localStorage.setItem(LS_CONSENT, v); localStorage.setItem(LS_ANA, String(ana)); } catch { }
  };
  /** 读：cookie 优先，无则回落 localStorage 镜像（壳内 cookie 不可读时） */
  const readConsent = () => {
    const c = (document.cookie.match(/suveoo_cookie_consent=(\w+)/) || [])[1] || null;
    if (c) return { v: c, ana: /(?:^|;\s*)suveoo_consent_analytics=1/.test(document.cookie) };
    try {
      const v = localStorage.getItem(LS_CONSENT);
      if (v) return { v, ana: localStorage.getItem(LS_ANA) === "1" };
    } catch { }
    return { v: null, ana: false };
  };
  const boot = readConsent();
  const saved = boot.v;
  const anaOn = boot.ana;
  gtag("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    analytics_storage: "denied", wait_for_update: 500,
  });
  if (saved === "all") {
    gtag("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" });
  } else if (saved === "custom" && anaOn) {
    gtag("consent", "update", { analytics_storage: "granted" });
  }
  gtag("config", "G-KLK499CDQF", { send_page_view: true });
  const upd = (o) => gtag("consent", "update", o);
  S.ga4 = {
    /** 接受全部：四信号 granted */
    grant() {
      upd({ ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" });
      setConsent("all", 1);
    },
    /** 仅必要：全部 denied */
    deny() {
      upd({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
      setConsent("necessary", 0);
    },
    /** 自定义：仅分析统计按选择（广告类保持 denied——本平台不投广告） */
    setAnalytics(on) {
      upd(on ? { analytics_storage: "granted" } : { analytics_storage: "denied" });
      setConsent("custom", on ? 1 : 0);
    },
    status() {
      return readConsent().v;
    },
    analyticsOn() {
      return this.status() === "all" || (this.status() === "custom" && readConsent().ana);
    },
    event(name, params = {}) { try { gtag("event", name, params); } catch { } },
  };
})();
