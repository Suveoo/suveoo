/* ga4.js — gtag + Consent Mode v2（默认 denied；每次加载恢复已保存同意；分类化授权）
   注意：本文件先于 defer 的 core 脚本执行，必须自建命名空间。
   信号映射：全部=四信号 granted；自定义=仅 analytics_storage 按选择，ad_* 保持 denied；必要=全部 denied。 */
window.S = window.S || {};
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  const saved = (document.cookie.match(/suveoo_cookie_consent=(\w+)/) || [])[1] || null;
  const anaOn = /(?:^|;\s*)suveoo_consent_analytics=1/.test(document.cookie);
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
      document.cookie = "suveoo_cookie_consent=all; max-age=31536000; path=/; Secure; SameSite=Lax";
      document.cookie = "suveoo_consent_analytics=1; max-age=31536000; path=/; Secure; SameSite=Lax";
    },
    /** 仅必要：全部 denied */
    deny() {
      upd({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
      document.cookie = "suveoo_cookie_consent=necessary; max-age=31536000; path=/; Secure; SameSite=Lax";
      document.cookie = "suveoo_consent_analytics=0; max-age=31536000; path=/; Secure; SameSite=Lax";
    },
    /** 自定义：仅分析统计按选择（广告类保持 denied——本平台不投广告） */
    setAnalytics(on) {
      upd(on ? { analytics_storage: "granted" } : { analytics_storage: "denied" });
      document.cookie = "suveoo_cookie_consent=custom; max-age=31536000; path=/; Secure; SameSite=Lax";
      document.cookie = "suveoo_consent_analytics=" + (on ? "1" : "0") + "; max-age=31536000; path=/; Secure; SameSite=Lax";
    },
    status() {
      return /(?:^|;\s*)suveoo_cookie_consent=/.test(document.cookie)
        ? (document.cookie.match(/suveoo_cookie_consent=(\w+)/)?.[1] ?? null)
        : null;
    },
    analyticsOn() {
      return this.status() === "all" || (this.status() === "custom" && anaOn);
    },
    event(name, params = {}) { try { gtag("event", name, params); } catch { } },
  };
})();
