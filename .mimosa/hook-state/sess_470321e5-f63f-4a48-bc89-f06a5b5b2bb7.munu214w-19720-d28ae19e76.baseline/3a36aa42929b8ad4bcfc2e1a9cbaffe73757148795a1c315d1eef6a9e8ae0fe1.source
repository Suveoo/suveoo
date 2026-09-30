/* chat/chat-client.js — /api/ai/chat SSE 流式对话 */
S.chat = {
  sid: null,
  sending: false,
  _ctrl: null, /* 当前请求的 AbortController（停止按钮入口） */
  stop() { if (this._ctrl) this._ctrl.abort(); },
  /** 续聊加载：拉取某会话全部历史消息（分页 20/页，自动翻页到底）；失败返回 null。
   *  返回条目 {role, content, cards, err, created_at}——cards 由服务端附终态徽标 _status，只读重放用。 */
  async load(sid) {
    const out = [];
    let page = 1, totalPages = 1;
    try {
      do {
        const r = await fetch(`/api/ai/sessions/${encodeURIComponent(sid)}/messages?page=${page}`, {
          headers: S.api.token ? { authorization: `Bearer ${S.api.token}` } : {},
        });
        if (!r.ok) return null;
        const d = await r.json();
        totalPages = d.total_pages ?? 1;
        out.push(...(d.messages ?? []));
        page++;
      } while (page <= totalPages);
      return out;
    } catch { return null; }
  },
  async send(text, { onToken, onGenui, onTrust, onDone, onError, onThinking } = {}) {
    if (this.sending || !text.trim()) return;
    this.sending = true;
    const ctrl = new AbortController();
    this._ctrl = ctrl;
    /* 回调异常隔离：单个 handler 抛错（如某张卡渲染失败）只损失该事件，不再杀掉整条流
       ——此前的全局 try/catch 会把渲染异常吞成 onError，用户只看到一个无解释的"完成"。 */
    const safe = (fn) => { try { fn(); } catch (e) { console.error("[chat] handler error", e); } };
    let ended = false;
    const finish = () => { if (!ended) { ended = true; this._ctrl = null; safe(() => onDone?.()); } };
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...(S.api.token ? { authorization: `Bearer ${S.api.token}` } : {}) },
        body: JSON.stringify({ text, session_id: this.sid }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = res.status === 401 ? S.t("ai.needLogin") : `HTTP ${res.status}`;
        safe(() => onError?.(msg)); finish(); return;
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
          else if (ev.type === "token") safe(() => onToken?.(ev.text));
          else if (ev.type === "thinking") safe(() => onThinking?.());
          else if (ev.type === "genui_event") safe(() => onGenui?.(ev.card));
          else if (ev.type === "trust_event") safe(() => onTrust?.(ev.event));
          else if (ev.type === "error") safe(() => onError?.(ev.message || ev.code));
          else if (ev.type === "done") finish();
        }
      }
      finish();
    } catch (e) {
      /* 用户主动停止不算错误：只走 onDone 收尾（部分文本保留展示） */
      if (!ctrl.signal.aborted) safe(() => onError?.(e.message ?? "network"));
      finish();
    } finally {
      this.sending = false;
      this._ctrl = null;
    }
  },
};
