/* sim-notice.js — 模拟系统声明组件（pages.md §2.7） */
S.sim = {
  text: () => S.t("sim.notice"),
  banner(extra = "") {
    return `<div class="banner" role="note">${S.ui.icon("shield", 16)}<div>${S.fmt.escape(S.sim.text())}${extra}</div></div>`;
  },
  footnote() { return `<p class="footnote-sim">${S.fmt.escape(S.sim.text())}</p>`; },
  pill() { return `<a class="sim-info" href="/about#disclaimer" title="${S.fmt.escape(S.sim.text())}" aria-label="${S.fmt.escape(S.sim.text())}">${S.ui.icon("info", 20)}</a>`; },
};
