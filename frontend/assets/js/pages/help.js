/* help.js — P32 帮助中心（实时搜索 + 分类锚点 + 平滑手风琴 + 滚动渐显；三语深度内容来自 docs-help.js） */
S.router.register("help", async () => {
  const c = document.getElementById("content");
  const lang = S.i18n.lang;
  const D = S.HELP_DOCS?.[lang] ?? S.HELP_DOCS?.["zh-CN"] ?? { cats: [], guide: [], trouble: [], antifraud: [], ai: {} };
  const esc = (s) => S.fmt.escape(s);

  c.innerHTML = `
    <h1>${esc(S.t("help.title"))}</h1>
    <div class="help-search card">
      <span class="hs-ic">${S.ui.icon("doc", 18)}</span>
      <input class="input" id="help-q" type="search" placeholder="${esc(S.t("help.searchPh"))}" autocomplete="off">
      <span class="muted small mono" id="help-count"></span>
    </div>
    <div class="help-pills" id="help-pills"></div>
    <section class="help-sec" id="sec-guide"><h2>${esc(S.t("help.guideTitle"))}</h2><div id="guide-body"></div></section>
    <section class="help-sec" id="sec-faq"><h2>${esc(S.t("help.faq"))}</h2><div id="faq-body"></div></section>
    <section class="help-sec" id="sec-trouble"><h2>${esc(S.t("trouble.title"))}</h2><div id="trouble-body"></div></section>
    <section class="help-sec" id="sec-anti"><h2>${esc(S.t("help.antifraud"))}</h2><div id="anti-body"></div></section>
    <section class="help-sec" id="sec-ai"><h2>${esc(S.t("help.aiSecurity"))}</h2><div id="ai-body"></div></section>
    <div class="help-cta card card-surface">${S.ui.icon("shield", 16)}<div>${esc(S.t("help.contactCta"))}</div>
      <a class="btn btn-sm btn-primary" href="/contact">${esc(S.t("help.contactBtn"))}</a></div>`;

  /* 手风琴条目（data-k 供搜索；aria-expanded 供无障碍） */
  const acc = (items) => items.map((it) => `
    <div class="acc-item hacc" data-k="${esc((it.q + " " + it.a).toLowerCase())}">
      <button class="acc-head" type="button" aria-expanded="false"><span>${esc(it.q)}</span>${S.ui.icon("arrow-right", 14)}</button>
      <div class="acc-body"><div class="acc-inner">${esc(it.a)}</div></div>
    </div>`).join("");
  /* 手风琴：JS 测高 + max-height 过渡（兼容所有浏览器；关时回 0 便于再次测高） */
  const wireAcc = (root) => {
    S.ui.$(".hacc .acc-head", root).forEach((btn) => {
      btn.onclick = () => {
        const item = btn.closest(".hacc");
        const body = item.querySelector(".acc-body");
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
  };

  /* 快速指引（编号步骤卡） */
  document.getElementById("guide-body").innerHTML = `<div class="help-grid">${(D.guide ?? []).map((g, i) => `
    <div class="help-step card"><span class="hs-num">${i + 1}</span><b>${esc(g.t)}</b><p class="muted small">${esc(g.a)}</p>
    ${g.href ? `<a class="btn btn-sm btn-light" href="${g.href}">${esc(g.cta)}</a>` : ""}</div>`).join("")}</div>`;

  /* FAQ 分类手风琴 */
  document.getElementById("faq-body").innerHTML = D.cats.map((cat, i) => `
    <div class="faq-cat" id="faq-cat-${i}"><h3 class="faq-cat-name">${esc(cat.name)}</h3>${acc(cat.items)}</div>`).join("");

  /* 故障排查手风琴 */
  document.getElementById("trouble-body").innerHTML = acc(D.trouble ?? []);

  /* 防诈骗清单 */
  document.getElementById("anti-body").innerHTML = `<div class="card card-surface"><ul class="help-ul">${(D.antifraud ?? []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`;

  /* AI 安全（五道验证） */
  document.getElementById("ai-body").innerHTML = `<div class="card">
    <p class="muted">${esc(D.ai?.intro ?? "")}</p>
    <div class="stack" style="gap:6px">${(D.ai?.items ?? []).map((s) => `<div class="task-step"><span class="st">·</span>${esc(s)}</div>`).join("")}</div>
    <p class="muted small" style="margin-top:12px">${esc(D.ai?.chain ?? "")}</p></div>`;

  /* 分类锚点 pills（粘性） */
  document.getElementById("help-pills").innerHTML =
    `<a class="hpill" href="#sec-guide">${esc(S.t("help.guideTitle"))}</a>` +
    D.cats.map((n, i) => `<a class="hpill" href="#faq-cat-${i}">${esc(n.name)}</a>`).join("") +
    `<a class="hpill" href="#sec-trouble">${esc(S.t("trouble.title"))}</a>` +
    `<a class="hpill" href="#sec-anti">${esc(S.t("help.antifraud"))}</a>` +
    `<a class="hpill" href="#sec-ai">${esc(S.t("help.aiSecurity"))}</a>`;

  /* 实时搜索过滤：FAQ + 故障排查联动隐藏，命中计数 */
  const applyFilter = () => {
    const q = document.getElementById("help-q").value.trim().toLowerCase();
    let hits = 0;
    S.ui.$$("#faq-body .hacc, #trouble-body .hacc").forEach((el) => {
      const show = !q || el.dataset.k.includes(q);
      el.style.display = show ? "" : "none";
      if (show) hits++;
    });
    S.ui.$$(".faq-cat").forEach((cat) => {
      cat.style.display = [...cat.querySelectorAll(".hacc")].some((el) => el.style.display !== "none") ? "" : "none";
    });
    document.getElementById("help-count").textContent = q ? hits + " " + S.t("help.results") : "";
  };
  document.getElementById("help-q").addEventListener("input", applyFilter);

  /* 手风琴与渐显改用 #content 级事件委托 + 一次性守卫：
     #content 元素跨控制器重渲染恒存，绑定不受任何 innerHTML 重建影响（语言切换等场景零丢失）。 */
  const content = document.getElementById("content");
  if (!content.dataset.haccDelegated) {
    content.dataset.haccDelegated = "1";
    content.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".hacc .acc-head");
      if (!btn) return;
      const item = btn.closest(".hacc");
      const body = item.querySelector(".acc-body");
      const opening = !item.classList.contains("open");
      item.classList.toggle("open", opening);
      btn.setAttribute("aria-expanded", opening);
      if (opening) {
        body.style.maxHeight = body.scrollHeight + "px";
        body.addEventListener("transitionend", function te(e2) {
          if (e2.propertyName === "max-height" && item.classList.contains("open")) body.style.maxHeight = "none";
          body.removeEventListener("transitionend", te);
        });
      } else {
        if (body.style.maxHeight === "none") { body.style.maxHeight = body.scrollHeight + "px"; void body.offsetHeight; }
        body.style.maxHeight = "0px";
      }
    });
  }

  /* 滚动渐显（IO 一次观察 + 短兜底；re-run 安全：未 .in 的重新观察） */
  const revealAll = () => S.ui.$$(".help-sec:not(.in)").forEach((s) => s.classList.add("in"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.06 });
    S.ui.$$(".help-sec").forEach((sec) => io.observe(sec));
    setTimeout(revealAll, 1200);
  } else revealAll();
});
