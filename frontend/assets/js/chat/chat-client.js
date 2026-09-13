/* chat/chat-client.js — /api/ai/chat SSE 流式对话 */
S.chat = {
  sid: null,
  sending: false,
  async send(text, { onToken, onGenui, onTrust, onDone, onError } = {}) {
    if (this.sending || !text.trim()) return;
    this.sending = true;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...(S.api.token ? { authorization: `Bearer ${S.api.token}` } : {}) },
        body: JSON.stringify({ text, session_id: this.sid }),
      });
      if (!res.ok || !res.body) {
        const msg = res.status === 401 ? S.t("ai.needLogin") : `HTTP ${res.status}`;
        onError?.(msg); onDone?.(); return;
      }
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
          if (ev.type === "session") this.sid = ev.sid;
          else if (ev.type === "token") onToken?.(ev.text);
          else if (ev.type === "genui_event") onGenui?.(ev.card);
          else if (ev.type === "trust_event") onTrust?.(ev.event);
          else if (ev.type === "error") onError?.(ev.message || ev.code);
          else if (ev.type === "done") onDone?.(ev);
        }
      }
      onDone?.();
    } catch (e) {
      onError?.(e.message ?? "network");
      onDone?.();
    } finally {
      this.sending = false;
    }
  },
};
