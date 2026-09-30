/* tool-kit.js — 计算工具页共享助手：URL 参数预填、oninput 联动重算、history.replaceState 同步（链接可分享） */
S.toolKit = {
  /* 读输入数字；空或非法返回 null（页面据此提示） */
  num(id) {
    const raw = (document.getElementById(id)?.value ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  fmt(v) { return "¥ " + S.fmt.moneyPlain(v); },
  /* bind(map, calc)：map = [{ id, param?, def }]；param 缺省用 id；
     URL 有值先预填；每次 input/change 重算并把与默认值不同的字段写回 URL */
  bind(map, calc) {
    const q = new URLSearchParams(location.search);
    let touched = false;
    for (const f of map) {
      const el = document.getElementById(f.id);
      if (!el) continue;
      const pv = q.get(f.param ?? f.id);
      if (pv != null && pv !== "") { el.value = pv; touched = true; }
      const h = () => { calc(); this.sync(map); };
      el.addEventListener("input", h);
      if (el.tagName === "SELECT") el.addEventListener("change", h);
    }
    if (touched) this.sync(map); // 规范化：去掉与默认值相同的参数
    calc();
  },
  sync(map) {
    const q = new URLSearchParams();
    for (const f of map) {
      const el = document.getElementById(f.id);
      if (!el) continue;
      const val = String(el.value ?? "").trim();
      if (val === "" || val === String(f.def)) continue; // 默认值不进 URL，链接干净
      q.set(f.param ?? f.id, val);
    }
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  },
};
