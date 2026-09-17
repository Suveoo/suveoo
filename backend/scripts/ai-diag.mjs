// ai-diag.mjs — 单条指令事件流诊断（打印全部 trust/genui 事件与 tool 参数截断）
const BASE = "https://suveoo.com";
const text = process.argv[2];
if (!text) { console.error("usage: node ai-diag.mjs \"指令\""); process.exit(1); }
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier: "demo@suveoo.com", password: "jinrongkeji2026" }),
});
const { token } = await r.json();
const res = await fetch(`${BASE}/api/ai/chat`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ text, session_id: `diag_${Date.now().toString(36)}` }),
  signal: AbortSignal.timeout(120_000),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split("\n\n");
  buf = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (ev.type === "trust_event") console.log("TRUST", JSON.stringify(ev.event).slice(0, 260));
    else if (ev.type === "genui_event") console.log("GENUI", JSON.stringify({ component: ev.card?.component, tier: ev.card?.tier, action: ev.card?.action, reason: ev.card?.reason, amount: ev.card?.params?.amount ?? ev.card?.params?.transfer?.amount, exec: ev.card?.params?.execute_at }).slice(0, 300));
    else if (ev.type === "error") console.log("ERROR", JSON.stringify(ev));
    else if (ev.type === "done") console.log("DONE");
  }
}
