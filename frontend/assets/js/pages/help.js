/* help.js — P32 帮助中心（FAQ/防诈骗/AI 安全） */
S.router.register("help", async () => {
  const c = document.getElementById("content");
  const d = (await S.api.json("/assets/data/faq.json")) ?? { categories: [] };
  c.innerHTML = `<h1>${S.fmt.escape(S.t("help.title"))}</h1>
    <div class="section-title" id="faq"><h2>${S.fmt.escape(S.t("help.faq"))}</h2></div>
    ${d.categories.map((cat) => `
      <h3 style="margin:12px 0 6px">${S.fmt.escape(cat.name)}</h3>
      ${cat.items.map((it) => `
      <div class="acc-item"><button class="acc-head"><span>${S.fmt.escape(it.q)}</span>${S.ui.icon("arrow-right", 14)}</button>
        <div class="acc-body">${S.fmt.escape(it.a)}</div></div>`).join("")}`).join("")}
    <div class="section-title" id="antifraud"><h2>${S.fmt.escape(S.t("help.antifraud"))}</h2></div>
    <div class="card card-surface"><ul style="margin:0;padding-left:18px;color:var(--color-ink-2)">
      <li style="margin:6px 0">${S.fmt.escape(S.t("help.af1"))}</li><li style="margin:6px 0">${S.fmt.escape(S.t("help.af2"))}</li>
      <li style="margin:6px 0">${S.fmt.escape(S.t("help.af3"))}</li><li style="margin:6px 0">${S.fmt.escape(S.t("help.af4"))}</li>
      <li style="margin:6px 0"><b>${S.fmt.escape(S.t("help.af5"))}</b></li></ul></div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("help.aiSecurity"))}</h2></div>
    <div class="card">
      <p class="muted">${S.fmt.escape(S.t("help.v5intro"))}</p>
      <div class="stack" style="gap:6px">
        ${["help.v5p", "help.v5c", "help.v5prov", "help.v5i", "help.v5r"].map((k) => `<div class="task-step"><span class="st">·</span>${S.fmt.escape(S.t(k))}</div>`).join("")}
      </div>
      <p class="muted small" style="margin-top:12px">${S.fmt.escape(S.t("help.v5chain"))}</p>
    </div>
    <a class="btn btn-primary" style="margin-top:16px" href="/contact">${S.fmt.escape(S.t("help.contactBtn"))}</a>`;
  S.ui.$$(".acc-head").forEach((h) => { h.onclick = () => (h.nextElementSibling.style.display = h.nextElementSibling.style.display === "block" ? "none" : "block"); });
});
