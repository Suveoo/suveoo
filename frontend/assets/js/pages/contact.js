/* contact.js — P33 联系我们 */
S.router.register("contact", async () => {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="auth-wrap" style="max-width:520px"><h1>${S.fmt.escape(S.t("contact.title"))}</h1>
    <div class="card">
      <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.name"))}</span><input class="input" id="ct-name"></label>
      <label class="field"><span class="lb">Email</span><input class="input" id="ct-email" type="email"></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.category"))}</span>
        <span id="ct-cat"></span></label>
      <label class="field"><span class="lb">${S.fmt.escape(S.t("contact.message"))}</span><textarea class="input" id="ct-msg" rows="5"></textarea></label>
      <button class="btn btn-primary btn-block" id="ct-go">${S.fmt.escape(S.t("contact.submit"))}</button>
    </div>
    <div class="card card-surface" style="margin-top:12px"><h3>${S.fmt.escape(S.t("contact.emails"))}</h3>
      <div class="muted small mono">support@suveoo.com · security@suveoo.com</div></div>
    ${S.sim.footnote()}</div>`;
  const catKeys = ["catAccount", "catTransfer", "catWealth", "catSecurity", "catOther"];
  const catSel = S.ctl.select({ label: S.t("contact.category"), options: catKeys.map((k) => ({ v: S.t("contact." + k), label: S.t("contact." + k) })) });
  catSel.id = "ct-cat";
  document.getElementById("ct-cat").replaceWith(catSel);
  document.getElementById("ct-go").onclick = async () => {
    const r = await S.api.post("/api/contact", {
      name: document.getElementById("ct-name").value.trim(),
      email: document.getElementById("ct-email").value.trim(),
      category: catSel.value,
      message: document.getElementById("ct-msg").value.trim(),
    });
    if (r.ok) { S.ui.toast(S.t("contact.sent")); document.getElementById("ct-msg").value = ""; }
    else S.ui.toast(r.data?.error?.message ?? "failed", true);
  };
});
