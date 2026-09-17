// ai-confirm.mjs — AI 通道黄级一键确认全链验证：发指令 → 捕获确认卡 grant_hash →
// 模拟前端 attachConfirm（POST /mcp 带 grant_hash）→ EXECUTED。用法：node ai-confirm.mjs "指令"
const BASE = "https://suveoo.com";
const text = process.argv[2];
if (!text) { console.error("usage: node ai-confirm.mjs \"指令\""); process.exit(1); }
const r0 = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier: "demo@suveoo.com", password: "jinrongkeji2026" }),
});
const { token } = await r0.json();
if (!token) { console.error("login failed"); process.exit(1); }
const sid = `conf_${Date.now().toString(36)}`;

const res = await fetch(`${BASE}/api/ai/chat`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ text, session_id: sid }),
  signal: AbortSignal.timeout(120_000),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "", card = null;
outer: while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split("\n\n");
  buf = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (ev.type === "genui_event" && ev.card?.component === "transfer_confirmation") card = ev.card;
    if (ev.type === "done") break outer;
  }
}
if (!card) { console.error("NO CARD"); process.exit(1); }
console.log("CARD", JSON.stringify({
  action: card.action, tier: card.tier,
  recipient: card.params?.recipient_display ?? null,
  from_card: card.params?.from_card_display ?? null,
  memo: card.params?.memo ?? null,
  execute_at: card.params?.execute_at ?? null,
  amount: card.params?.amount ?? card.params?.transfer?.amount ?? null,
  repeat: card.params?.repeat ?? null,
  subscription: card.params?.subscription_id ?? null,
  grant: String(card.grant_hash ?? "").slice(0, 12),
}));

/* 前端确认条等价操作：原样回传工具参数 + grant_hash 直连 /mcp */
const args = { ...(card.params ?? {}) };
for (const k of ["recipient_display", "from_card_display", "verified", "execute_at_display"]) delete args[k];
args.grant_hash = card.grant_hash;
const c = await fetch(`${BASE}/mcp?sid=${sid}`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() % 1e9, method: "tools/call", params: { name: card.action, arguments: args } }),
});
const out = JSON.parse((await c.json()).result.content[0].text);
console.log("CONFIRM", JSON.stringify({ status: out.status, tx_id: out.tx_id ?? null, task_id: out.task_id ?? null, reason: out.reason ?? null, next: out.next_run_at ?? null }));
