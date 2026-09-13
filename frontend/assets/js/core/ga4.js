/* ga4.js — gtag + Consent Mode v2（默认 denied，Cookie 同意后 grant）
   注意：本文件可能先于 defer 的 core 脚本执行，必须自建命名空间。 */
window.S = window.S || {};
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied", wait_for_update: 500 });
  gtag("config", "G-KLK499CDQF", { send_page_view: true });
  S.ga4 = {
    grant() {
      gtag("consent", "update", { ad_storage: "granted", analytics_storage: "granted" });
      document.cookie = "suveoo_cookie_consent=all; max-age=31536000; path=/; Secure; SameSite=Lax";
    },
    deny() {
      document.cookie = "suveoo_cookie_consent=necessary; max-age=31536000; path=/; Secure; SameSite=Lax";
    },
    status() {
      return /(?:^|;\s*)suveoo_cookie_consent=/.test(document.cookie)
        ? (document.cookie.match(/suveoo_cookie_consent=(\w+)/)?.[1] ?? null)
        : null;
    },
    event(name, params = {}) { try { gtag("event", name, params); } catch { } },
  };
})();
