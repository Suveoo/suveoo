/* tools.js — P20 金融计算工具（支持 URL 参数直达） */
S.router.register("tools", async () => {
  const c = document.getElementById("content");
  const T = [
    ["deposit", S.t("tools.deposit"), "calc"], ["fund", S.t("tools.fund"), "calc"], ["loan", S.t("tools.loan"), "calc"],
    ["fxCalc", S.t("tools.fxCalc"), "calc"], ["split", S.t("tools.split"), "calc"], ["inflation", S.t("tools.inflation"), "calc"],
  ];
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tools.title"))}</h1>${S.sim.footnote()}
    <div class="tabs" id="t-tabs">${T.map(([id, name], i) => `<button class="tab${i === 0 ? " active" : ""}" data-t="${id}">${S.fmt.escape(name)}</button>`).join("")}</div>
    <div class="card" style="max-width:520px" id="pane"></div>
    <p class="muted small" style="margin-top:12px">${S.fmt.escape(S.t("tools.deeplink", "/wealth/tools?tool=split&total=860&n=3"))}</p>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.navTitle"))}</h2></div>
    <div class="tool-grid">${(S.toolCatalog ?? []).map((t) => S.toolCard(t)).join("")}</div>`;
  const pane = document.getElementById("pane");
  const num = (label, id, val) => `<label class="field"><span class="lb">${S.fmt.escape(label)}</span><input class="input" id="${id}" value="${val}" inputmode="decimal"></label>`;
  const out = `<div class="gc-kv"><span class="muted">${S.fmt.escape(S.t("tools.result"))}</span><span class="v mono" id="out">—</span></div>`;
  const calcs = {
    deposit: { fields: [num(S.t("tools.total"), "a", "50000"), num(S.t("tools.rate"), "b", "1.45"), num(S.t("tools.years"), "c", "1")],
      run: () => { const a = +v("a"), b = +v("b") / 100, cc = +v("c"); o(`¥ ${S.fmt.moneyPlain(a * (1 + b * cc))}`); } },
    fund: { fields: [num(S.t("tools.total"), "a", "10000"), num(S.t("tools.rate"), "b", "11.35"), num(S.t("tools.years"), "c", "1")],
      run: () => { const a = +v("a"), b = +v("b") / 100, cc = +v("c"); o(`¥ ${S.fmt.moneyPlain(a * Math.pow(1 + b, cc))}`); } },
    loan: { fields: [num(S.t("tools.total"), "a", "200000"), num(S.t("tools.rate"), "b", "3.1"), num(S.t("tools.years"), "c", "3")],
      run: () => { const P = +v("a"), r = +v("b") / 100 / 12, n = +v("c") * 12; o(`¥ ${S.fmt.moneyPlain((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))} ${S.t("tools.perMonth")}`); } },
    fxCalc: { fields: [num("CNY", "a", "1000"), num(S.t("tools.rateMid"), "b", "7.1403")],
      run: () => { o(`${(+v("a") / +v("b")).toFixed(2)}`); } },
    split: { fields: [num(S.t("common.total"), "a", "860"), num(S.t("tools.people"), "b", "3")],
      run: () => { const t2 = Math.round(+v("a") * 100), n = Math.max(1, Math.round(+v("b"))); const parts = Array.from({ length: n }, (_, i) => Math.floor(t2 / n) + (i < t2 % n ? 1 : 0)); o(parts.map((p) => (p / 100).toFixed(2)).join(" / ")); } },
    inflation: { fields: [num(S.t("tools.total"), "a", "10000"), num(S.t("tools.inflationRate"), "b", "2.5"), num(S.t("tools.years"), "c", "10")],
      run: () => { o(`${S.t("tools.powerPrefix")} ¥ ${S.fmt.moneyPlain(+v("a") / Math.pow(1 + +v("b") / 100, +v("c")))}`); } },
  };
  const v = (id) => document.getElementById(id)?.value ?? "0";
  const o = (s) => (document.getElementById("out").textContent = s);
  const show = (key) => {
    const t = calcs[key] ?? calcs.deposit;
    pane.innerHTML = t.fields.join("") + out;
    pane.querySelectorAll("input").forEach((i) => (i.oninput = t.run));
    t.run();
  };
  S.ui.$$("#t-tabs .tab").forEach((t) => { t.onclick = () => { S.ui.$$("#t-tabs .tab").forEach((x) => x.classList.toggle("active", x === t)); show(t.dataset.t); }; });
  const u = new URLSearchParams(location.search);
  const preset = u.get("tool");
  if (preset && calcs[preset]) {
    S.ui.$$("#t-tabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.t === preset));
    show(preset);
    if (u.get("total")) setTimeout(() => { const a = document.getElementById("a"); if (a) { a.value = u.get("total"); a.dispatchEvent(new Event("input")); } }, 0);
    if (preset === "split" && u.get("n")) setTimeout(() => { const b = document.getElementById("b"); if (b) { b.value = u.get("n"); b.dispatchEvent(new Event("input")); } }, 0);
  } else show("deposit");
});
