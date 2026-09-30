/* legal.js — P34/35/36 法律三页共用控制器（HTML data-page 为 privacy-policy/terms/cookie-privacy，逐一注册别名）
   /terms 与 /privacy-policy 的长篇条款正文由 legal-docs.js（S.LEGAL_DOCS，三语）提供；Cookie 页仍用 i18n 键。 */
const legalPage = async () => {
  const c = document.getElementById("content");
  const which = location.pathname.startsWith("/privacy-policy") ? "privacy"
    : location.pathname.startsWith("/cookie-privacy") ? "cookie" : "terms";
  const titles = { privacy: S.t("legal.privacy"), cookie: S.t("legal.cookie"), terms: S.t("legal.terms") };

  /* 统一为 [{h, ps:[], ss:[{h, ps:[]}]}] 结构；cookie 页同样使用深度文档（docs-cookie.js） */
  const lang = S.i18n.lang;
  const arts = which === "cookie"
    ? (S.COOKIE_DOCS?.[lang] ?? S.COOKIE_DOCS?.["zh-CN"] ?? [])
    : (S.LEGAL_DOCS?.[which]?.[lang] ?? S.LEGAL_DOCS?.[which]?.["zh-CN"] ?? []);
  const sections = arts.map((a) => ({
    h: a.t,
    ps: a.ps ?? [],
    ss: (a.ss ?? []).map((s) => ({ h: s.t, ps: s.ps ?? [] })),
  }));

  c.innerHTML = `<div class="legal-grid">
    <nav class="legal-toc">
      <h3>${S.fmt.escape(titles[which])}</h3>
      <div class="muted small">${S.fmt.escape(S.t("legal.updated"))}</div>
      <ul style="list-style:none;padding:0;margin-top:12px;font-size:13px">
        ${sections.map((s, i) => `<li style="margin:6px 0"><a href="#sec${i}">${S.fmt.escape(s.h)}</a></li>`).join("")}
        <li style="margin:6px 0"><a href="/terms">${S.fmt.escape(S.t("legal.terms"))}</a> · <a href="/privacy-policy">${S.fmt.escape(S.t("legal.privacy"))}</a> · <a href="/cookie-privacy">${S.fmt.escape(S.t("legal.cookie"))}</a></li>
      </ul>
    </nav>
    <article class="legal-body">
      <h1>${S.fmt.escape(titles[which])}</h1>
      <div class="banner" style="margin-top:12px">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.t("legal.simFirst"))}</div></div>
      ${sections.map((s, i) => `
        <h2 id="sec${i}">${S.fmt.escape(s.h)}</h2>
        ${s.ps.map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}
        ${(s.ss ?? []).map((sub, j) => `<h3 id="sec${i}-${j}">${S.fmt.escape(sub.h)}</h3>${sub.ps.map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}`).join("")}
      `).join("")}
      <p class="muted small">${S.fmt.escape(S.t("legal.updated"))}</p>
    </article></div>`;
};
for (const n of ["legal", "privacy-policy", "terms", "cookie-privacy"]) S.router.register(n, legalPage);
