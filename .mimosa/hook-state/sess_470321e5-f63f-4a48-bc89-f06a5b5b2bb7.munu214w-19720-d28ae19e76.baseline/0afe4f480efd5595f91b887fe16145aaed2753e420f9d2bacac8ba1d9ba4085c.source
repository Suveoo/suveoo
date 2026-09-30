/* about.js — P31 关于 Suveoo（第四十三轮改版：渐变 Hero + 亮点胶囊 + 图标章节头 + 激活态目录 + 徽章公告 + 大数字利率 + tint 免责卡；正文三语仍来自 docs-about.js） */
S.router.register("about", async () => {
  const c = document.getElementById("content");
  const ann = (await S.api.json("/assets/data/announcements.json")) ?? {};
  const deps = await Promise.all(["demand", "notice-7d", "term-3m", "term-6m", "term-1y", "term-3y"].map((s) => S.api.json(`/assets/data/deposits/${s}.json`)));
  const lang = S.i18n.lang;
  const arts = S.ABOUT_DOCS?.[lang] ?? S.ABOUT_DOCS?.["zh-CN"] ?? [];
  /* 章节图标按 docs-about 固定九节顺序对应（缺省回退 chart/navy） */
  const SEC_ICONS = ["ic-star-gold", "ic-bank-navy", "ic-doc-sky", "ic-shield-teal", "ic-lock-violet", "ic-trend-orange", "ic-card-rose", "ic-ai-sky", "ic-globe-teal"];
  const sec = (a, i) => `
    <h2 class="ab-sec" id="ab${i}"><span class="ab-sec-bar"></span><span class="ab-sec-ic">${S.ui.icon(SEC_ICONS[i] ?? "ic-chart-navy", 22)}</span><span class="ab-sec-t">${S.fmt.escape(a.t)}</span></h2>
    ${(a.ps ?? []).map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}
    ${(a.ss ?? []).map((sub, j) => `<h3 id="ab${i}-${j}">${S.fmt.escape(sub.t)}</h3>${(sub.ps ?? []).map((p) => `<p>${S.fmt.escape(p)}</p>`).join("")}`).join("")}`;
  const anns = ann.announcements ?? [];
  const head = (id, icon, key) => `<h2 class="ab-sec" id="${id}"><span class="ab-sec-bar"></span><span class="ab-sec-ic">${S.ui.icon(icon, 22)}</span><span class="ab-sec-t">${S.fmt.escape(S.t(key))}</span></h2>`;
  c.innerHTML = `
    <section class="ab-hero bg-grad-navy">
      <div class="ab-hero-txt">
        <h1>${S.fmt.escape(S.t("about.title"))}</h1>
        <p>${S.fmt.escape(S.t("about.intro"))}</p>
        <div class="ab-pills">
          <span class="ab-pill">${S.ui.icon("ai", 14)}${S.fmt.escape(S.t("about.pill1"))}</span>
          <span class="ab-pill">${S.ui.icon("shield", 14)}${S.fmt.escape(S.t("about.pill2"))}</span>
          <span class="ab-pill">${S.ui.icon("lock", 14)}${S.fmt.escape(S.t("about.pill3"))}</span>
          <span class="ab-pill">${S.ui.icon("bank", 14)}${S.fmt.escape(S.t("about.pill4"))}</span>
        </div>
      </div>
      <img class="ab-hero-art" src="/assets/images/illustrations/ai-deco.svg?v=${S.ui.v()}" alt="">
    </section>
    <div class="ab-toc-m" id="ab-toc-m"></div>
    <div class="legal-grid ab-grid">
      <nav class="ab-toc" id="ab-toc" aria-label="${S.fmt.escape(S.t("about.toc"))}">
        <h3>${S.fmt.escape(S.t("about.toc"))}</h3>
        <div class="muted small">${S.fmt.escape(S.t("legal.updated"))}</div>
        <div class="ab-toc-links">
          ${arts.map((a, i) => `<a href="#ab${i}" data-for="ab${i}">${S.fmt.escape(a.t)}</a>`).join("")}
          <a href="#ab-dis" data-for="ab-dis">${S.fmt.escape(S.t("about.disclaimer"))}</a>
          <a href="#ab-ann" data-for="ab-ann">${S.fmt.escape(S.t("about.announcements"))}</a>
          <a href="#ab-rates" data-for="ab-rates">${S.fmt.escape(S.t("about.rates"))}</a>
          <a href="#ab-contact" data-for="ab-contact">${S.fmt.escape(S.t("help.contactBtn"))}</a>
        </div>
      </nav>
      <article class="legal-body ab-body">
        ${arts.map(sec).join("")}
        <div class="ab-dis" id="ab-dis">
          <div class="ab-dis-h">${S.ui.icon("shield", 16)}<b>${S.fmt.escape(S.t("about.disclaimer"))}</b></div>
          <p>${S.fmt.escape(S.t("legal.simFirst"))}</p>
          <p class="muted">${S.fmt.escape(S.t("about.full"))}</p>
        </div>
        ${head("ab-ann", "ic-bell-navy", "about.announcements")}
        <div class="ab-anns">${anns.map((a, i) => `
          <div class="acc-item hacc ab-ann">
            <button class="acc-head" type="button" aria-expanded="false">
              <span class="ab-ann-l"><span class="ab-bell">${S.ui.icon("ic-bell-navy", 26)}</span><b>${S.fmt.escape(a.title)}</b>${i === 0 ? `<i class="ab-new">${S.fmt.escape(S.t("about.latest"))}</i>` : ""}</span>
              <span class="ab-ann-r mono small">${a.date}${S.ui.icon("chevron", 14)}</span>
            </button>
            <div class="acc-body"><div class="acc-inner">${S.fmt.escape(a.body)}</div></div>
          </div>`).join("")}</div>
        ${head("ab-rates", "ic-wealth-teal", "about.rates")}
        <div class="card ab-rates-card" style="margin-top:8px"><div class="table-wrap"><table class="table ab-rates"><thead><tr><th>${S.fmt.escape(S.t("about.depCol"))}</th><th>${S.fmt.escape(S.t("deps.term"))}</th><th>${S.fmt.escape(S.t("deps.rate"))}</th></tr></thead>
          <tbody>${deps.map((x) => `<tr><td>${S.fmt.escape(x.name)}</td><td>${S.fmt.escape(x.term)}</td><td class="ab-rate mono">${x.rate}%</td></tr>`).join("")}</tbody></table></div>
          <h3 class="ab-rh">${S.fmt.escape(S.t("about.rateHistory"))}</h3>
          <div class="ab-tl">${(ann.rate_changes ?? []).map((h) => `
            <div class="ab-tl-it"><i></i><span class="mono small muted ab-tl-d">${h.date}</span><span class="small">${S.fmt.escape(h.change)}</span></div>`).join("")}</div></div>
        ${head("ab-contact", "ic-globe-sky", "help.contactBtn")}
        <div class="ab-contact">
          <a class="ab-ct-row" href="mailto:support@suveoo.com">${S.ui.icon("ic-doc-navy", 30)}<span class="ab-ct-txt"><b>${S.fmt.escape(S.t("about.ctSupport"))}</b><span class="mono small">support@suveoo.com</span></span></a>
          <a class="ab-ct-row" href="mailto:security@suveoo.com">${S.ui.icon("ic-shield-rose", 30)}<span class="ab-ct-txt"><b>${S.fmt.escape(S.t("about.ctSec"))}</b><span class="mono small">security@suveoo.com</span></span></a>
        </div>
        <p class="muted small ab-updated">${S.fmt.escape(S.t("legal.updated"))}</p>
      </article>
    </div>`;
  /* 目录锚点：平滑滚动（respect prefers-reduced-motion），移动端 ctl 下拉 onChange 同用 */
  const smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const jump = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: smooth, block: "start" }); };
  S.ui.$$(".ab-toc-links a").forEach((a) => { a.onclick = (e) => { e.preventDefault(); jump(a.dataset.for); }; });
  /* 手风琴：JS 测高 + max-height 过渡（与 help.js 同法；open 箭头旋转由 hacc CSS 驱动） */
  S.ui.$$(".ab-ann .acc-head").forEach((btn) => {
    btn.onclick = () => {
      const item = btn.closest(".hacc"), body = item.querySelector(".acc-body");
      const opening = !item.classList.contains("open");
      item.classList.toggle("open", opening);
      btn.setAttribute("aria-expanded", opening);
      if (opening) {
        body.style.maxHeight = body.scrollHeight + "px";
        body.addEventListener("transitionend", function te(ev) {
          if (ev.propertyName === "max-height" && item.classList.contains("open")) body.style.maxHeight = "none";
          body.removeEventListener("transitionend", te);
        });
      } else {
        if (body.style.maxHeight === "none") { body.style.maxHeight = body.scrollHeight + "px"; void body.offsetHeight; }
        body.style.maxHeight = "0px";
      }
    };
  });
  /* 移动端目录：ctl 下拉（面板挂 body 突破容器；选项与桌面目录同源） */
  const tocEl = document.getElementById("ab-toc");
  const items = S.ui.$$(".ab-toc-links a").map((a) => ({ id: a.dataset.for, label: a.textContent }));
  const mSel = S.ctl.select({ label: S.t("about.toc"), options: items.map((it) => ({ v: it.id, label: it.label })), onChange: (id) => jump(id) });
  document.getElementById("ab-toc-m").appendChild(mSel);
  /* 滚动激活态：rAF 节流；页面被路由替换后自清（无 router 卸载钩子，判 document.contains 兜底） */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!document.contains(tocEl)) { window.removeEventListener("scroll", onScroll); return; }
      let cur = items[0]?.id ?? "";
      /* 阈值 120：scroll-margin 76 + 平滑滚动落点约 30px 的沉降容差（否则亮上一节） */
      for (const it of items) { const el = document.getElementById(it.id); if (el && el.getBoundingClientRect().top <= 120) cur = it.id; }
      /* 文档已滚到底：末节（联系我们）到不了视口顶，直接亮最后一项 */
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) cur = items[items.length - 1]?.id ?? cur;
      S.ui.$$(".ab-toc-links a", tocEl).forEach((a) => a.classList.toggle("on", a.dataset.for === cur));
      mSel.value = cur;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
