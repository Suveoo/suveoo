/* help.js — P32 帮助中心（第十一轮改版：渐变 Hero + SEC_ICONS 章节头 + 分类 tint 胶囊头 + pills 滚动激活 + 图标化列表；
   功能零删减：实时搜索/命中计数/平滑手风琴/事件委托/滚动渐显 全保留。三语深度内容来自 docs-help.js） */
S.router.register("help", async () => {
  const c = document.getElementById("content");
  const lang = S.i18n.lang;
  const D = S.HELP_DOCS?.[lang] ?? S.HELP_DOCS?.["zh-CN"] ?? { cats: [], guide: [], trouble: [], antifraud: [], ai: {} };
  const esc = (s) => S.fmt.escape(s);
  /* 章节头（/about ab-sec 同款：渐变竖条+彩色 squircle 图标）与 FAQ 分类 tint 图标映射 */
  const secHead = (id, icon, key) => `<h2 class="ab-sec help-sec-h" id="${id}"><span class="ab-sec-bar"></span><span class="ab-sec-ic">${S.ui.icon(icon, 22)}</span><span class="ab-sec-t">${esc(S.t(key))}</span></h2>`;
  const CAT_META = [
    { icon: "ic-bank-navy", tint: "sky" }, { icon: "ic-pay-sky", tint: "sky" }, { icon: "ic-wealth-gold", tint: "gold" },
    { icon: "ic-star-orange", tint: "orange" }, { icon: "ic-lock-violet", tint: "violet" },
  ];
  const AI_STEPS = ["ic-shield-navy", "ic-lock-violet", "ic-doc-sky", "ic-exchange-teal", "ic-star-gold"];

  c.innerHTML = `
    <h1>${esc(S.t("help.title"))}</h1>
    <div class="help-search card">
      <span class="hs-ic">${S.ui.icon("doc", 18)}</span>
      <input class="input" id="help-q" type="search" placeholder="${esc(S.t("help.searchPh"))}" autocomplete="off">
      <span class="muted small mono" id="help-count"></span>
    </div>
    <div class="help-pills" id="help-pills"></div>
    <section class="help-sec" id="sec-guide">${secHead("sec-guide-h", "ic-doc-sky", "help.guideTitle")}<div id="guide-body"></div></section>
    <section class="help-sec" id="sec-faq">${secHead("sec-faq-h", "ic-ai-violet", "help.faq")}<div id="faq-body"></div></section>
    <section class="help-sec" id="sec-trouble">${secHead("sec-trouble-h", "ic-doc-orange", "trouble.title")}<div id="trouble-body"></div></section>
    <section class="help-sec" id="sec-anti">${secHead("sec-anti-h", "ic-shield-rose", "help.antifraud")}<div id="anti-body"></div></section>
    <section class="help-sec" id="sec-ai">${secHead("sec-ai-h", "ic-shield-teal", "help.aiSecurity")}<div id="ai-body"></div></section>
    <div class="help-cta card card-surface">${S.ui.icon("shield", 16)}<div>${esc(S.t("help.contactCta"))}</div>
      <a class="btn btn-sm btn-primary" href="/contact">${esc(S.t("help.contactBtn"))}</a></div>`;

  /* 手风琴条目（data-k 供搜索；aria-expanded 供无障碍） */
  const acc = (items) => items.map((it) => `
    <div class="acc-item hacc" data-k="${esc((it.q + " " + it.a).toLowerCase())}">
      <button class="acc-head" type="button" aria-expanded="false"><span>${esc(it.q)}</span>${S.ui.icon("arrow-right", 14)}</button>
      <div class="acc-body"><div class="acc-inner">${esc(it.a)}</div></div>
    </div>`).join("");

  /* 快速指引（编号步骤卡） */
  document.getElementById("guide-body").innerHTML = `<div class="help-grid">${(D.guide ?? []).map((g, i) => `
    <div class="help-step card"><span class="hs-num">${i + 1}</span><b>${esc(g.t)}</b><p class="muted small">${esc(g.a)}</p>
    ${g.href ? `<a class="btn btn-sm btn-light" href="${g.href}">${esc(g.cta)}</a>` : ""}</div>`).join("")}</div>`;

  /* FAQ 分类手风琴：分类头改 tint 胶囊+彩色图标（pye-gh 同族） */
  document.getElementById("faq-body").innerHTML = D.cats.map((cat, i) => {
    const meta = CAT_META[i % CAT_META.length];
    return `<div class="faq-cat" id="faq-cat-${i}"><h3 class="faq-cat-name"><span class="pye-gh bg-tint-${meta.tint}">${S.ui.icon(meta.icon, 18)} ${esc(cat.name)}</span></h3>${acc(cat.items)}</div>`;
  }).join("");

  /* 故障排查手风琴 */
  document.getElementById("trouble-body").innerHTML = acc(D.trouble ?? []);

  /* 防诈骗清单：警示语义 → shield-rose 行图标（列表语义保留） */
  document.getElementById("anti-body").innerHTML = `<div class="card card-surface"><ul class="help-ul">${(D.antifraud ?? []).map((s) => `<li>${S.ui.icon("ic-shield-rose", 20)} ${esc(s)}</li>`).join("")}</ul></div>`;

  /* AI 安全（五道验证：行首五族彩色 squircle 图标轮转） */
  document.getElementById("ai-body").innerHTML = `<div class="card">
    <p class="muted">${esc(D.ai?.intro ?? "")}</p>
    <div class="stack" style="gap:8px;margin-top:10px">${(D.ai?.items ?? []).map((s, i) => `<div class="task-step"><span class="st">${S.ui.icon(AI_STEPS[i % AI_STEPS.length], 24)}</span>${esc(s)}</div>`).join("")}</div>
    <p class="muted small" style="margin-top:12px">${esc(D.ai?.chain ?? "")}</p></div>`;

  /* 分类锚点 pills（粘性；滚动激活态由下方 observer 驱动） */
  const pillDefs = [
    ["sec-guide", S.t("help.guideTitle")],
    ...D.cats.map((n, i) => [`faq-cat-${i}`, n.name]),
    ["sec-trouble", S.t("trouble.title")],
    ["sec-anti", S.t("help.antifraud")],
    ["sec-ai", S.t("help.aiSecurity")],
  ];
  document.getElementById("help-pills").innerHTML =
    pillDefs.map(([id, label]) => `<a class="hpill" href="#${id}" data-for="${id}">${esc(label)}</a>`).join("");

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

  /* pills 滚动激活态（/about TOC 同款：rAF 节流；到底亮最后一枚；路由替换自清） */
  let ticking = false;
  const pillsEl = document.getElementById("help-pills");
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!document.contains(pillsEl)) { window.removeEventListener("scroll", onScroll); return; }
      let cur = pillDefs[0][0];
      for (const [id] of pillDefs) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 120) cur = id; }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) cur = pillDefs[pillDefs.length - 1][0];
      S.ui.$$(".hpill", pillsEl).forEach((a) => a.classList.toggle("on", a.dataset.for === cur));
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
