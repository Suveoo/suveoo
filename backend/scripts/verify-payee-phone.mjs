// verify-payee-phone.mjs — 第四期任务 D 线上验收（一次性）：
// 添加"周慕言（已有真实卡号）+手机号" → AI"给手机号 xxx 转 1 元"命中出卡 → 删除该收款人（顺带验证 DELETE 两段式修复）。
const BASE = "https://suveoo.com";
const EMAIL = "demo@suveoo.com";
const PASSWORD = "jinrongkeji2026";
const PHONE = "13912345678";

const login = async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }) });
  const d = await r.json();
  if (!d.token) throw new Error("login failed: " + JSON.stringify(d));
  return d.token;
};
const H = (t) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });

const token = await login();
console.log("login ok");

/* 1. 取周慕言的真实卡号（demo 既有收款人，registry 人物真实存在） */
const list = await (await fetch(`${BASE}/api/payees`, { headers: H(token) })).json();
const zmy = list.payees.find((p) => p.name === "周慕言");
if (!zmy) throw new Error("周慕言不在 demo 收款人列表");
console.log("周慕言卡号尾号:", zmy.account.slice(-4));

/* 若之前残留同手机号测试收款人，先删掉（幂等重跑） */
const stale = list.payees.find((p) => p.phone === PHONE);
if (stale) {
  const d1 = await (await fetch(`${BASE}/api/payees/${stale.id}`, { method: "DELETE", headers: H(token), body: "{}" })).json();
  const d2 = d1.status === "INPUT_REQUIRED"
    ? await (await fetch(`${BASE}/api/payees/${stale.id}`, { method: "DELETE", headers: H(token), body: JSON.stringify({ grant_hash: d1.grant.grant_hash }) })).json()
    : d1;
  console.log("清理残留:", d2.status);
}

/* 2. 添加带手机号的收款人（REST 两段式，YELLOW） */
const body = { name: "周慕言", account: zmy.account, group_label: "朋友", phone: PHONE };
const a1 = await (await fetch(`${BASE}/api/payees`, { method: "POST", headers: H(token), body: JSON.stringify(body) })).json();
if (a1.status !== "INPUT_REQUIRED") throw new Error("unexpected: " + JSON.stringify(a1).slice(0, 300));
const a2 = await (await fetch(`${BASE}/api/payees`, { method: "POST", headers: H(token), body: JSON.stringify({ ...body, grant_hash: a1.grant.grant_hash }) })).json();
console.log("添加:", a2.status, "tier:", a1.tier);

/* 3. AI：给手机号 xxx 转 1 元 → contacts_search 命中 → 出转账确认卡 */
const t0 = Date.now();
const res = await fetch(`${BASE}/api/ai/chat`, { method: "POST", headers: H(token), body: JSON.stringify({ text: `给手机号 ${PHONE} 转 1 元`, session_id: `verify_pp_${Date.now().toString(36)}` }), signal: AbortSignal.timeout(150_000) });
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "", answer = "", cards = [], done = false;
outer: while (true) {
  const { done: rd, value } = await reader.read();
  if (rd) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split("\n\n");
  buf = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (ev.type === "token") answer += ev.text ?? "";
    else if (ev.type === "genui_event") cards.push({ component: ev.card?.component, tier: ev.card?.tier, params: ev.card?.params });
    else if (ev.type === "error") console.log("SSE error:", ev.code, ev.message);
    else if (ev.type === "done") { done = true; break outer; }
  }
}
console.log("AI 轮完成", done, `${Date.now() - t0}ms；卡:`, cards.map((c) => `${c.component}(${c.tier ?? ""})`).join(", ") || "无");
const confirm = cards.find((c) => c.component === "transfer_confirmation");
if (confirm) {
  console.log("确认卡收款人:", confirm.params?.recipient_display ?? confirm.params?.recipient, "金额:", confirm.params?.amount);
}
console.log("AI 回答摘要:", answer.slice(0, 200).replace(/\n/g, " "));

/* 4. 清理：删除该收款人（验证 DELETE 两段式修复） */
const list2 = await (await fetch(`${BASE}/api/payees`, { headers: H(token) })).json();
const added = list2.payees.filter((p) => p.name === "周慕言" && p.phone === PHONE);
for (const p of added) {
  const d1 = await (await fetch(`${BASE}/api/payees/${p.id}`, { method: "DELETE", headers: H(token), body: "{}" })).json();
  if (d1.status !== "INPUT_REQUIRED") { console.log("删除首段异常:", d1.status, d1.reason ?? ""); continue; }
  const d2 = await (await fetch(`${BASE}/api/payees/${p.id}`, { method: "DELETE", headers: H(token), body: JSON.stringify({ grant_hash: d1.grant.grant_hash }) })).json();
  console.log("删除收款人 #" + p.id + ":", d2.status);
}
const final = await (await fetch(`${BASE}/api/payees`, { headers: H(token) })).json();
console.log("终态：同手机号收款人残留 =", final.payees.filter((p) => p.phone === PHONE).length);
