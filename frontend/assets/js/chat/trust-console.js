/* chat/trust-console.js — Trust Console 事件流 + 五道验证灯 + IR 查看器 */
S.trust = {
  el: null,
  mount(rootEl) {
    this.el = rootEl;
    rootEl.innerHTML = `
      <div class="tc-head"><span class="dot-live"></span><b>Trust Console</b>
        <span class="muted small mono" id="tc-trace" style="margin-left:auto"></span></div>
      <div class="tc-verifiers" id="tc-v"></div>
      <div class="tc-events" id="tc-ev"></div>
      <details class="tc-ir" id="tc-ir" style="padding:8px 16px"><summary>BankAction IR</summary><pre></pre></details>
      <div class="tc-demo" id="tc-demo" hidden>
        <span class="small">${S.fmt.escape(S.t("trust.demoNote"))}</span>
        <button class="btn btn-sm btn-danger" id="tc-inject">${S.fmt.escape(S.t("trust.inject"))}</button>
      </div>`;
    const V = ["POLICY", "CONSENT", "PROVENANCE", "INVARIANTS", "REPLAY"];
    rootEl.querySelector("#tc-v").innerHTML = V.map((v) => `<span class="tc-v" data-v="${v}">${v}</span>`).join("");
    this.ir({ ir_version: 1, note: S.t("trust.emptyIr") });
  },
  v(name, state) {
    if (!this.el) return;
    const chip = this.el.querySelector(`[data-v="${name}"]`);
    if (!chip) return;
    chip.className = "tc-v " + (state === true ? "ok" : state === false ? "fail" : state === "run" ? "run" : "");
  },
  resetVerifiers() { ["POLICY", "CONSENT", "PROVENANCE", "INVARIANTS", "REPLAY"].forEach((v) => this.v(v, undefined)); },
  evt(kind, ok, msg = "") {
    if (!this.el) return;
    const box = this.el.querySelector("#tc-ev");
    const sym = ok === true ? S.ui.icon("check", 12) : ok === false ? S.ui.icon("x", 12) : "…";
    const row = S.ui.el(`<div class="tc-evt ${ok === false ? "fail" : ok === true ? "ok" : ""}">
      <span class="k">${sym} ${S.fmt.escape(kind)}</span><span class="msg">${S.fmt.escape(msg)}</span></div>`);
    box.prepend(row);
    while (box.children.length > 80) box.lastChild.remove();
  },
  ir(obj) {
    if (!this.el) return;
    this.el.querySelector("#tc-ir pre").textContent = JSON.stringify(obj, null, 2);
  },
  trace(id) { this.el && (this.el.querySelector("#tc-trace").textContent = id ?? ""); },
  /** 服务端 trust_event 适配 */
  onEvent(ev) {
    const map = { PROPOSED: null, COMPILED: null, POLICY: "POLICY", CONSENT: "CONSENT", PROVENANCE: "PROVENANCE", INVARIANTS: "INVARIANTS", REPLAY: "REPLAY", EXEC: null, COMPENSATE: null, RESULT: null, BLOCKED: null };
    if (ev.kind === "PROPOSED") { this.resetVerifiers(); this.trace(ev.tool ? `tool:${ev.tool}` : ""); this.evt("PROPOSED", null, ev.args ?? ""); }
    else if (ev.kind === "CIRCUIT") this.evt("CIRCUIT", false, ev.detail ?? ev.reason ?? ""); /* 安全熔断：连续失败/可疑行为触发写操作锁定（赛题"异常熔断"可视化） */
    else if (ev.kind === "BLOCKED") this.evt("BLOCKED", false, ev.reason ?? "");
    else if (map[ev.kind] !== null && map[ev.kind] !== undefined) {
      this.v(ev.kind, ev.ok === "input_required" ? "run" : ev.ok);
      // input_required / skipped 不是失败，显示为中性进行/跳过态
      const sym = ev.ok === true ? true : ev.ok === false ? false : null;
      this.evt(ev.kind, sym, ev.reason ?? (ev.ok === "input_required" ? "input_required" : ev.ok === "skipped" ? "skipped" : ""));
    } else if (ev.kind === "RESULT") this.evt("RESULT", true, ev.tool ?? "done");
  },
  showDemo(onInject) {
    if (!this.el) return;
    this.el.querySelector("#tc-demo").hidden = false;
    this.el.querySelector("#tc-inject").onclick = onInject;
  },
};
