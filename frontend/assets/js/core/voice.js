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
 *
 * 第六十轮（语音专项修复）：
 *   ① 错误分流细化——NotAllowedError 壳内（Capacitor）换 voice.deniedApp 文案（无"地址栏"概念）；
 *     NotReadableError=麦克风被占用（voice.micBusy）不再误标"权限被拒绝"。
 *   ② 发送联动——ai.js/home.js 发送前调 S.voice.stop({discard:true})：停止录音/断 WS，且不再向
 *     输入框回写任何残留文本（修复"发送后仍在录音"与"再次点击语音旧指令回填"）。
 *   ③ WS 意外断开（非用户收尾）toast voice.network——修复"脉冲闪一下消失且无任何提示"。
 *   ④ 握手看门狗 8s：WS 连上但 TranscriptionStarted 不到 → 显式报错收口（不再傻等 60s 上限）。
 *   ⑤ AudioContext suspended（Android WebView 自动播放策略）→ 主动 resume。
 *   ⑥ 采样率护栏：ctx.sampleRate≠16000（WebView 可能忽略构造参数）→ onaudioprocess 线性插值
 *     重采样到 16k 再上行（NLS 协议口径），避免 48k 直灌导致识别乱码/TaskFailed。
 *   ⑦ stop({discard}) 公开 API + active()（返回手势/发送联动/状态查询用）。
 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  const isShell = typeof window.Capacitor !== "undefined";
  let providerPromise = null;   /* 模块级缓存：一次会话只问一次 /api/voice/config（失败不缓存——弱网瞬时失败不能把整个会话钉死在 webspeech） */
  const provider = () => {
    if (!providerPromise) {
      providerPromise = fetch(S.api.base + "/api/voice/config").then((r) => r.json()).then((j) => j.provider ?? "webspeech").catch(() => { providerPromise = null; return "webspeech"; });
    }
    return providerPromise;
  };

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
  let s2 = null; /* { ws, ctx, stream, node, btn, input, committed, partial, onFinal, timer, hsTimer, done, discard, srcRate, live } */
  const aliTeardown = (silence = false) => {
    const st = s2;
    s2 = null;
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    if (st.hsTimer) clearTimeout(st.hsTimer);
    setState(st.btn, false);
    try { st.node?.disconnect(); } catch { /* ignore */ }
    try { st.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { st.ctx?.close(); } catch { /* ignore */ }
    try { st.ws?.close(); } catch { /* ignore */ }
    /* discard（发送联动中止）：不派发 onFinal——文本已被调用方取走，回写=旧指令复活 */
    if (!silence && !st.discard && typeof st.onFinal === "function" && (st.committed || st.partial)) st.onFinal((st.committed + st.partial).trim());
  };
  /* f32 → PCM16I；若采集率≠16k（WebView 可能忽略 AudioContext sampleRate 参数）线性插值重采样 */
  const toPcm16k = (f32, rate) => {
    let src = f32;
    if (rate && rate !== 16000) {
      const ratio = 16000 / rate;
      const n = Math.max(1, Math.round(f32.length * ratio));
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = i / ratio, i0 = p | 0, i1 = Math.min(f32.length - 1, i0 + 1), t = p - i0;
        out[i] = f32[i0] * (1 - t) + f32[i1] * t;
      }
      src = out;
    }
    const i16 = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = Math.max(-1, Math.min(1, src[i]));
      i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return i16;
  };
  function bindAli(btn, input, opts) {
    btn.setAttribute("aria-label", S.t("voice.aria"));
    btn.title = S.t("voice.aria");
    btn.onclick = async () => {
      if (s2) { stopVoice(); return; } /* 会话中点击=正常收尾（发 stop 等 TranscriptionCompleted 拿尾句） */
      let stream, ctx;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        ctx = new AudioContext({ sampleRate: 16000 }); /* 浏览器侧重采样到 16k（NLS 协议口径） */
      } catch (e) {
        /* 错误分流：NotAllowed=权限（壳内文案不同）；NotFound=无设备；NotReadable=被占用；
           其余（Overconstrained 等）走通用错误，不再一律误报"权限被拒绝" */
        const key = e?.name === "NotAllowedError" ? (isShell ? "voice.deniedApp" : "voice.denied")
          : e?.name === "NotFoundError" ? "voice.noMic"
          : e?.name === "NotReadableError" ? "voice.micBusy"
          : "voice.err";
        S.ui.toast(S.t(key), true);
        try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        return;
      }
      /* Android WebView 自动播放策略：getUserMedia 的 await 已消耗手势上下文，ctx 可能 suspended */
      if (ctx.state === "suspended") ctx.resume().catch(() => { /* resume 失败不阻断——ScriptProcessor 可能仍回调 */ });
      const wsUrl = (S.api.base || location.origin).replace(/^http/, "ws");
      const ws = new WebSocket(`${wsUrl}/api/voice/stream?t=${encodeURIComponent(S.api.token ?? "")}`);
      ws.binaryType = "arraybuffer";
      const st = { ws, ctx, stream, btn, input, committed: "", partial: "", onFinal: opts.onFinal ?? null, timer: null, hsTimer: null, done: false, discard: false, pending: [], live: false, srcRate: ctx.sampleRate || 16000 };
      s2 = st;
      setState(btn, true);
      /* 绝对上限 60s（实时流多句长于 webspeech 单句）；闭包身份校验防误杀后续新会话 */
      st.timer = setTimeout(() => { if (s2 === st) aliTeardown(); }, 60000);
      /* 点击即采集（不等握手）：握手期（gUM+WS+StartTranscription 约 0.5~1.5s）的语音先进本地缓冲，
         TranscriptionStarted 一到立即冲刷上行——消除"开始录音却要等一段才转字"与开首丢字（第四十二轮） */
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      st.node = node;
      node.onaudioprocess = (e) => {
        if (s2 !== st) return;
        const i16 = toPcm16k(e.inputBuffer.getChannelData(0), st.srcRate);
        if (!st.live) { st.pending.push(i16); if (st.pending.length > 20) st.pending.shift(); return; } /* 缓冲上限 20 帧≈2.7s 防异常堆积 */
        try { ws.readyState === 1 && ws.send(i16.buffer); } catch { /* ignore */ }
      };
      src.connect(node);
      node.connect(ctx.destination); /* ScriptProcessor 需接 destination 才回调（静音播放即可） */
      const failAli = (key) => { S.ui.toast(S.t(key), true); aliTeardown(); };
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "start" }));
        /* 握手看门狗：WS 已连但 8s 内 TranscriptionStarted 不到（网关挂起/token 慢）→ 显式收口 */
        st.hsTimer = setTimeout(() => { if (s2 === st && !st.live) failAli("voice.network"); }, 8000);
      };
      ws.onerror = () => { if (s2 === st) failAli("voice.network"); };
      ws.onclose = () => {
        if (s2 !== st) return;
        /* 意外断开（非用户收尾非错误帧）：给出提示——修复"脉冲闪一下消失且无任何提示" */
        if (!st.done && !st.discard) S.ui.toast(S.t("voice.network"), true);
        aliTeardown();
      };
      ws.onmessage = (ev) => {
        if (s2 !== st || st.discard) return; /* discard 后服务端尾帧不再回写输入框 */
        let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.type === "started") {
          st.live = true;
          if (st.hsTimer) { clearTimeout(st.hsTimer); st.hsTimer = null; }
          /* 冲刷握手期缓冲（最早帧先行） */
          try { for (const buf of st.pending) ws.readyState === 1 && ws.send(buf.buffer); } catch { /* ignore */ }
          st.pending = [];
        } else if (m.type === "result") {
          if (m.isFinal) { st.committed += m.text ?? ""; st.partial = ""; }
          else st.partial = m.text ?? "";
          input.value = (st.committed + st.partial).trim();
        } else if (m.type === "completed") {
          st.done = true;
          aliTeardown(); /* onFinal 在 teardown 内派发（committed 已含尾句） */
        } else if (m.type === "error") {
          /* 网关错误原文透传（额度尽/项目配置错等），不再误标为"网络问题"——只留 token 类走通用文案 */
          const isToken = /token/i.test(String(m.message ?? ""));
          S.ui.toast(isToken ? S.t("voice.err") : `${S.t("voice.err")}（${String(m.message ?? "").slice(0, 60)}）`, true);
          aliTeardown();
        }
      };
    };
  }

  /* ============ 公开 API：停止/状态（发送联动、返回手势用） ============
   * stop({discard})：discard=true 用于"文字已被调用方取走"场景（发送/导航）——abort 指令 +
   * 短兜底收口 + 不派发 onFinal + 拒绝后续回写；默认 false=正常收尾（发 stop 等 completed 尾句）。
   * 返回 true=确有会话被停止，false=本就空闲（幂等）。webspeech 通道经 hardReset abort。 */
  function stopVoice(opts = {}) {
    const discard = !!opts.discard;
    if (rec) { hardReset(); return true; }
    if (!s2) return false;
    const cur = s2;
    cur.discard = discard;
    try { cur.ws?.readyState === 1 && cur.ws.send(JSON.stringify({ type: discard ? "abort" : "stop" })); } catch { /* ignore */ }
    /* 兜底收口带身份校验：窗口内用户再开新会话时不误杀（abort 服务端直接 shutdown，200ms 即可） */
    setTimeout(() => { if (s2 === cur) aliTeardown(); }, discard ? 200 : 2500);
    return true;
  }

  function bind(btn, input, opts = {}) {
    if (!btn || !input) return;
    provider().then((p) => {
      if (p !== "ali") { bindWebSpeech(btn, input, opts); return; }
      bindAli(btn, input, opts);
      /* ali 通道：页面就绪即后台预热 NLS token（首次点击少一次 CreateToken 往返；失败静默——冷启仍可用） */
      fetch(S.api.base + "/api/voice/warm", { headers: S.api.token ? { authorization: `Bearer ${S.api.token}` } : {} }).catch(() => {});
    });
  }
  /* 页面隐藏/离开：强制收口（discard——切页/后台时输入框即将失效，回写无意义且可能复活旧文本） */
  const hardStop = () => { hardReset(); if (s2) { s2.discard = true; aliTeardown(); } };
  document.addEventListener("visibilitychange", () => { if (document.hidden) hardStop(); });
  window.addEventListener("pagehide", hardStop);
  return {
    supported: () => true, /* 双通道时代总有一条可用（ali 不依赖 Web Speech）；保留字段兼容旧调用 */
    bind,
    provider,
    stop: stopVoice,        /* 发送联动/返回手势/外部收口（第六十轮） */
    active: () => !!(rec || s2),
  };
})();
