/* split-bill-plus.js — AA 分账高级版（total,n,adjust=张三:-60,李四:10）：整数分运算，总额守恒 */
S.toolPages = S.toolPages ?? {};
S.toolPages["split-bill-plus"] = async (c, opts = {}) => {
  c.innerHTML = `<h1>${S.fmt.escape(S.t("tc.splitName"))}</h1>
    <div class="card" style="max-width:520px">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("common.total"))}（CNY）</span><input class="input input-lg" id="total" value="860" inputmode="decimal"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.splitPeople"))}</span><input class="input" id="n" value="3" inputmode="numeric"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("tc.adjust"))}</span>
        <input class="input" id="adjust" placeholder="${S.fmt.escape("张三:-60,李四:10")}"><div class="field-hint">${S.fmt.escape(S.t("tc.adjustHint"))}</div></label>
      <p class="muted small" style="margin:0">${S.fmt.escape(S.t("tc.shareHint"))}</p>
    </div>
    <div class="section-title"><h2>${S.fmt.escape(S.t("tc.splitList"))}</h2></div>
    <div class="card" style="max-width:520px">
      <div id="list"></div>
      <div class="field-err" id="tc-err" hidden>${S.fmt.escape(S.t("tc.invalid"))}</div>
      <div class="field-err" id="adj-err" hidden>${S.fmt.escape(S.t("tc.splitBad"))}</div>
    </div>`;
  const $ = (id) => c.querySelector("#" + id);
  /* 整数分分摊：base 均分（余数从前往后 +1 分），再叠加每人调整额（与后端 splitEqually 同思路） */
  const splitCents = (baseCents, n) => {
    const parts = new Array(n).fill(Math.floor(baseCents / n));
    for (let r = 0; r < baseCents % n; r++) parts[r] += 1;
    return parts;
  };
  const calc = () => {
    const total = S.toolKit.num("total", c), n = S.toolKit.num("n", c);
    const raw = ($("adjust").value ?? "").trim();
    $("tc-err").hidden = true; $("adj-err").hidden = true;
    if (total == null || n == null || total <= 0 || n < 1 || n > 60) { $("tc-err").hidden = false; $("list").innerHTML = ""; return; }
    /* 解析调整串：“姓名:±金额”，逗号（中英文）分隔；负数=少付，正数=多付 */
    const adj = new Map();
    let adjBad = false;
    if (raw) {
      for (const seg of raw.split(/[,，]/)) {
        const s = seg.trim();
        if (!s) continue;
        const m = /^(.+?)\s*[:：]\s*([+-]?\d+(?:\.\d{1,2})?)$/.exec(s);
        if (!m) { adjBad = true; continue; }
        adj.set(m[1].trim(), Math.round(parseFloat(m[2]) * 100));
      }
    }
    if (adjBad) $("adj-err").hidden = false;
    const cnt = Math.round(n);
    const names = Array.from({ length: cnt }, (_, i) => S.t("tc.member", i + 1));
    const adjCents = new Array(cnt).fill(0);
    const renamed = new Array(cnt).fill(false);
    /* 命中调整名 → 对应成员；未命中的名字占用一个未命名成员位（分摊与总额始终守恒） */
    for (const [name, cents] of adj) {
      let idx = names.indexOf(name);
      if (idx < 0) {
        idx = names.findIndex((x, i) => !renamed[i]);
        if (idx < 0) idx = cnt - 1; // 调整名多于人数：并入最后一位（罕见，仍守恒）
        names[idx] = name;
        renamed[idx] = true;
      }
      adjCents[idx] += cents;
    }
    const totalCents = Math.round(total * 100);
    const base = totalCents - adjCents.reduce((a, b) => a + b, 0);
    if (base < 0) { $("tc-err").hidden = false; $("list").innerHTML = ""; return; }
    const parts = splitCents(base, cnt);
    let sum = 0;
    const rows = names.map((name, i) => {
      const cents = parts[i] + adjCents[i];
      sum += cents;
      const adjNote = adjCents[i] ? ` <span class="muted small">(${adjCents[i] > 0 ? "+" : ""}${(adjCents[i] / 100).toFixed(2)})</span>` : "";
      return `<div class="list-row"><div class="grow">${S.fmt.escape(name)}${adjNote}</div><div class="amt mono">¥ ${(cents / 100).toFixed(2)}</div></div>`;
    }).join("");
    const ok = sum === totalCents;
    $("list").innerHTML = rows + `<div class="list-row"><div class="grow muted small">${S.fmt.escape(S.t("tc.sumCheck"))}</div>
      <div class="amt mono" style="color:${ok ? "var(--color-green)" : "var(--color-red)"}">${ok ? S.ui.icon("check", 14) : S.ui.icon("x", 14)} ${S.toolKit.fmt(total)}</div></div>`;
  };
  S.toolKit.bind([
    { id: "total", def: "860" }, { id: "n", def: "3" }, { id: "adjust", def: "" },
  ], calc, { scope: c, params: opts.params, noSync: !!opts.embed });
};
S.router.register("split-bill-plus", async () => { await S.toolPages["split-bill-plus"](document.getElementById("content")); });
