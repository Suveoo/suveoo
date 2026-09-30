/* voice.js — 语音输入（主页 hero 与 /ai 输入框共用），双通道可切换（第四十一轮）：
 * ① webspeech：Web Speech API（原行为原样保留——zh-CN、interim 实时上屏、final 即停、iOS 僵尸会话硬复位）。
 * ② ali：阿里云智能语音交互实时识别（Worker /api/voice/stream WS 代理，密钥只在 Worker；
 *    AudioContext(sampleRate:16000) 采 PCM16 → 二进制帧上流 → TranscriptionResultChanged/SentenceEnd
 *    边说边出字回填输入框）。无 GMS 的国产 Android/鸿蒙与 WebView 壳内唯一可用通道，四端通用。
 * 通道选择：GET /api/voice/config → {provider}（后端 VOICE_ASR_PROVIDER var 一行切换+deploy）。
 * UI 不变：同一按钮、同一红色脉冲/aria 语义；点击开始-再点结束。
 *
 * 补记 7/11 纪律全部保留：错误分流 i18n、30s 上限、页面隐藏收口、webspeech 通道绝不并行取流（独占麦克风实证）。
 *   ali 通道自身持流（AudioContext），与识别器互斥使用同一会话状态机，无并行冲突。
 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let providerPromise = null;   /* 模块级缓存：一次会话只问一次 /api/voice/config */
  const provider = () => (providerPromise ??= fetch("/api/voice/config").then((r) => r.json()).then((j) => j.provider ?? "webspeech").catch(() => "webspeech"));

  /* ============ 通道 ①：Web Speech（原实现整段保留） ============ */
  let rec = null, activeBtn = null, timer = null;
  const MSG = {
    "not-allowed": "voice.denied", "service-not-allowed": "voice.denied",
    "audio-capture": "voice.noMic", "network": "voice.network", "no-speech": "voice.noSpeech",
  };
  const setState = (btn, on) => {
    btn.classList.toggle("listening", on);
    btn.setAttribute("aria-label", S.t(on ? "voice.stopAria" : "voice.aria"));
    btn.title = S.t(on ? "voice.stopAria" : "voice.aria");
  };
  const hardReset = () => {
    const r = rec;
    rec = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (activeBtn) { setState(activeBtn, false); activeBtn = null; }
    if (r) { r.onresult = r.onerror = r.onend = r.onspeechstart = r.onaudiostart = null; try { r.abort(); } catch { /* 已结束 */ } }
  };
  function bindWebSpeech(btn, input, { onFinal = null } = {}) {
    if (typeof Ctor() !== "function") {
      btn.classList.add("voice-off");
      btn.setAttribute("aria-label", S.t("voice.aria"));
      btn.onclick = () => S.ui.toast(S.t("voice.unsupported"));
      return;
    }
    btn.setAttribute("aria-label", S.t("voice.aria"));
    btn.title = S.t("voice.aria");
    btn.onclick = () => {
      if (rec) { hardReset(); return; }
      let gotFinal = false;
      let r;
      try { r = new (Ctor())(); } catch { S.ui.toast(S.t("voice.err"), true); return; }
      rec = r;
      r.lang = "zh-CN";
      r.continuous = false;
      r.interimResults = true;
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        input.value = text.trim();
        if (e.results[e.results.length - 1].isFinal) {
          gotFinal = true;
          try { r.stop(); } catch { /* 已收口 */ }
        }
      };
      r.onerror = (e) => {
        if (e.error === "aborted") return;
        const key = MSG[e.error];
        if (key && key !== "voice.err") S.ui.toast(S.t(key), e.error !== "no-speech");
        else S.ui.toast(S.t("voice.err") + " (" + e.error + ")", true);
      };
      r.onend = () => {
        const hadFinal = gotFinal;
        hardReset();
        if (hadFinal && typeof onFinal === "function") onFinal(input.value);
      };
      activeBtn = btn;
      setState(btn, true);
      try { r.start(); } catch { hardReset(); S.ui.toast(S.t("voice.err"), true); return; }
      timer = setTimeout(hardReset, 30000);
    };
  }

  /* ============ 通道 ②：阿里云 NLS 实时识别（Worker WS 管道） ============ */
  let s2 = null; /* { ws, ctx, stream, node, btn, input, committed, partial, onFinal, timer, done } */
  const aliTeardown = (silence = false) => {
    const st = s2;
    s2 = null;
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    setState(st.btn, false);
    try { st.node?.disconnect(); } catch { /* ignore */ }
    try { st.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { st.ctx?.close(); } catch { /* ignore */ }
    try { st.ws?.close(); } catch { /* ignore */ }
    if (!silence && typeof st.onFinal === "function" && (st.committed || st.partial)) st.onFinal((st.committed + st.partial).trim());
  };
  function bindAli(btn, input, opts) {
    btn.setAttribute("aria-label", S.t("voice.aria"));
    btn.title = S.t("voice.aria");
    btn.onclick = async () => {
      if (s2) { /* 会话中点击=正常收尾（发 stop 等 TranscriptionCompleted 拿尾句） */
        try { s2.ws?.readyState === 1 && s2.ws.send(JSON.stringify({ type: "stop" })); } catch { /* ignore */ }
        setTimeout(() => aliTeardown(true), 2500); /* 网关无响应兜底强收 */
        return;
      }
      let stream, ctx;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        ctx = new AudioContext({ sampleRate: 16000 }); /* 浏览器侧重采样到 16k（NLS 协议口径） */
      } catch (e) {
        S.ui.toast(S.t(e?.name === "NotAllowedError" ? "voice.denied" : e?.name === "NotFoundError" ? "voice.noMic" : "voice.err"), true);
        try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        return;
      }
      const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/api/voice/stream?t=${encodeURIComponent(S.api.token ?? "")}`);
      ws.binaryType = "arraybuffer";
      const st = { ws, ctx, stream, btn, input, committed: "", partial: "", onFinal: opts.onFinal ?? null, timer: null, done: false };
      s2 = st;
      setState(btn, true);
      st.timer = setTimeout(() => aliTeardown(), 60000); /* 绝对上限 60s（实时流多句长于 webspeech 单句） */
      const failAli = (key) => { S.ui.toast(S.t(key), true); aliTeardown(); };
      ws.onopen = () => ws.send(JSON.stringify({ type: "start" }));
      ws.onerror = () => { if (s2 === st) failAli("voice.network"); };
      ws.onclose = () => { if (s2 === st) aliTeardown(); };
      ws.onmessage = (ev) => {
        if (s2 !== st) return;
        let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.type === "started") {
          const src = ctx.createMediaStreamSource(stream);
          const node = ctx.createScriptProcessor(4096, 1, 1);
          st.node = node;
          node.onaudioprocess = (e) => {
            if (s2 !== st || ws.readyState !== 1) return;
            const f32 = e.inputBuffer.getChannelData(0);
            const i16 = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) {
              const v = Math.max(-1, Math.min(1, f32[i]));
              i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
            }
            try { ws.send(i16.buffer); } catch { /* ignore */ }
          };
          src.connect(node);
          node.connect(ctx.destination); /* ScriptProcessor 需接 destination 才回调（静音播放即可） */
        } else if (m.type === "result") {
          if (m.isFinal) { st.committed += m.text ?? ""; st.partial = ""; }
          else st.partial = m.text ?? "";
          input.value = (st.committed + st.partial).trim();
        } else if (m.type === "completed") {
          st.done = true;
          aliTeardown(); /* onFinal 在 teardown 内派发（committed 已含尾句） */
        } else if (m.type === "error") {
          failAli(String(m.message ?? "").includes("token") ? "voice.err" : "voice.network");
        }
      };
    };
  }

  function bind(btn, input, opts = {}) {
    if (!btn || !input) return;
    provider().then((p) => (p === "ali" ? bindAli(btn, input, opts) : bindWebSpeech(btn, input, opts)));
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { hardReset(); aliTeardown(); } });
  return {
    supported: () => true, /* 双通道时代总有一条可用（ali 不依赖 Web Speech）；保留字段兼容旧调用 */
    bind,
    provider,
  };
})();
