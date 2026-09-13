/* about.js — P31 关于 Suveoo（深度介绍 + 公告/利率；正文三语来自 docs-about.js） */
S.router.register("about", async () => {
  const c = document.getElementById("content");
  const ann = (await S.api.json("/assets/data/announcements.json")) ?? {};
  const deps = await Promise.all(["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)));
  const lang = S.i18n.lang;
  const arts = S.ABOUT_DOCS?.[lang] ?? S.ABOUT_DOCS?.["zh-CN"] ?? [];
  const sec = (a, i) => `
    <h2 id="ab${i}">${S.fmt.escape(a.t)}</h2>
    ${(a.ps ?? []).map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}
    ${(a.ss ?? []).map((sub, j) => `<h3 id="ab${i}-${j}">${S.fmt.escape(sub.t)}</h3>${(sub.ps ?? []).map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}`).join("")}`;
  c.innerHTML = `
    <div class="about-banner"><h1>${S.fmt.escape(S.t("about.title"))}</h1>
      <p>${S.fmt.escape(S.t("about.intro"))}</p></div>
    <div class="legal-grid" style="margin-top:var(--sp-6)">
      <nav class="legal-toc">
        <h3>${S.fmt.escape(S.t("about.title"))}</h3>
        <div class="muted small">${S.fmt.escape(S.t("legal.updated"))}</div>
        <ul style="list-style:none;padding:0;margin-top:12px;font-size:13px">
          ${arts.map((a, i) => `<li style="margin:6px 0"><a href="#ab${i}">${S.fmt.escape(a.t)}</a></li>`).join("")}
          <li style="margin:6px 0"><a href="#ab-ann">${S.fmt.escape(S.t("about.announcements"))}</a></li>
          <li style="margin:6px 0"><a href="#ab-rates">${S.fmt.escape(S.t("about.rates"))}</a></li>
        </ul>
      </nav>
      <article class="legal-body">
        ${arts.map(sec).join("")}
        <h2 id="ab-dis">${S.fmt.escape(S.t("about.disclaimer"))}</h2>
        <p>${S.fmt.escape(S.t("legal.simFirst"))}</p>
        <p class="muted">${S.fmt.escape(S.t("about.full"))}</p>
        <h2 id="ab-ann">${S.fmt.escape(S.t("about.announcements"))}</h2>
        <div class="card" style="margin-top:8px">${(ann.announcements ?? []).map((a) => `
          <div class="acc-item"><button class="acc-head"><span><b>${S.fmt.escape(a.title)}</b> <span class="muted small mono">${a.date}</span></span>${S.ui.icon("arrow-right", 14)}</button>
          <div class="acc-body">${S.fmt.escape(a.body)}</div></div>`).join("")}</div>
        <h2 id="ab-rates">${S.fmt.escape(S.t("about.rates"))}</h2>
        <div class="card" style="margin-top:8px"><div class="table-wrap"><table class="table"><thead><tr><th>${S.fmt.escape(S.t("about.depCol"))}</th><th>${S.fmt.escape(S.t("deps.term"))}</th><th>${S.fmt.escape(S.t("deps.rate"))}</th></tr></thead>
          <tbody>${deps.map((x) => `<tr><td>${S.fmt.escape(x.name)}</td><td>${S.fmt.escape(x.term)}</td><td class="mono">${x.rate}%</td></tr>`).join("")}</tbody></table></div>
          <h3 style="margin-top:16px">${S.fmt.escape(S.t("about.rateHistory"))}</h3>
          ${(ann.rate_changes ?? []).map((h) => `<div class="muted small">· ${h.date} — ${S.fmt.escape(h.change)}</div>`).join("")}</div>
        <h2 id="ab-contact">${S.fmt.escape(S.t("help.contactBtn"))}</h2>
        <p class="muted">support@suveoo.com · security@suveoo.com</p>
        <p class="muted small">${S.fmt.escape(S.t("legal.updated"))}</p>
      </article>
    </div>`;
  S.ui.$$(".acc-head").forEach((h) => { h.onclick = () => (h.nextElementSibling.style.display = h.nextElementSibling.style.display === "block" ? "none" : "block"); });
});
