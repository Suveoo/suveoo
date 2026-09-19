/* voice.js — 语音输入（主页 hero 与 /ai 输入框共用；两处均含响度点环特效）
 * Web Speech API（SpeechRecognition/webkitSpeechRecognition，zh-CN，continuous=false，interim=true）；
 * feature-detect：不支持的环境按钮降级为 i18n toast；不引入第三方库。
 * S.voice.bind(btn, input)：识别结果填入输入框（interim 实时上屏），不自动发送。
 *
 * 补记 7：权限预检 + 错误分流 + 会话生命周期加固（Safari onend 僵尸硬复位）。
 * 补记 9：响度点环（AnalyserNode 频谱驱动 24 点波纹，快攻慢放 + RMS 门控 + 静默慢摆）。
 * 补记 10（本轮关键修复，队长 Samsung 实测：环在动、话没进框）：
 *   **Android Chromium 系已知冲突——识别期间并行的 getUserMedia 流会抢走麦克风路由，
 *   SpeechRecognition 被饿死**（b135 可用正因为当时预检流"即开即停"）。三项对策：
 *   ① 预检恢复"即开即停"（只为触发授权弹窗），识别先启动、点环流转延 600ms/onaudiostart 再开——识别优先占麦；
 *   ② **看门狗**：开环 4.5s 内"点环已检测到声音能量（peak≥0.15，用户确实在说）但识别零结果零 speechstart"
 *      → 判定该设备取流冲突 → 弃环、无痕重启识别，并 localStorage(suveoo.vizmic=off) 设备级记忆，
 *      此后该设备直接无环识别——**文字录入永远优先于特效**；环境安静（peak 低）不误判；
 *   ③ 共存正常的设备（桌面/iOS 等）环与识别双全。
 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, activeBtn = null, timer = null, wdTimer = null, vizArm = null;
  let viz = null; /* { svg, ctx, stream, raf, peak } */
  let sawSpeech = false, sawResult = false;
  let vizConflicts = false; /* 设备级：并行取流与识别冲突（多数 Android）→ 此后无环识别 */
  try { vizConflicts = localStorage.getItem("suveoo.vizmic") === "off"; } catch { }
  /* 识别器错误码 → i18n 键（voice.err 为兜底，未映射码在文案后附原始 code） */
  const MSG = {
    "not-allowed": "voice.denied", "service-not-allowed": "voice.denied",
    "audio-capture": "voice.noMic", "network": "voice.network", "no-speech": "voice.noSpeech",
  };
  const setState = (btn, on) => {
    btn.classList.toggle("listening", on);
    btn.setAttribute("aria-label", S.t(on ? "voice.stopAria" : "voice.aria"));
    btn.title = S.t(on ? "voice.stopAria" : "voice.aria");
  };
  /* ---- 响度点环（自带独立取流；失败静默——环是增益，绝不阻塞识别） ---- */
  const VIZ_DOTS = 24, VIZ_BANDS = 12;
  async function startViz(btn) {
    stopViz();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !navigator.mediaDevices) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return; }
    let ctx, analyser;
    try {
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser); /* 只分析不回放 */
      if (ctx.state === "suspended") ctx.resume().catch(() => { });
    } catch { try { ctx.close(); } catch { } stream.getTracks().forEach((t) => t.stop()); return; }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 72 72");
    svg.classList.add("voice-viz");
    const dots = [];
    for (let i = 0; i < VIZ_DOTS; i++) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "36"); c.setAttribute("cy", "36");
      svg.appendChild(c);
      dots.push(c);
    }
    btn.appendChild(svg);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const smooth = new Array(VIZ_DOTS).fill(0);
    viz = { svg, ctx, stream, raf: 0, peak: 0 };
    const loop = () => {
      analyser.getByteFrequencyData(bins);
      let rms = 0;
      for (let k = 2; k < 48; k++) rms += bins[k];
      rms /= 46 * 255;
      viz.peak = Math.max(viz.peak * 0.985, rms); /* 慢衰减峰值：看门狗判"用户确实在说话" */
      const now = performance.now();
      for (let i = 0; i < VIZ_DOTS; i++) {
        const band = i % VIZ_BANDS; /* 对径同频段 → 左右对称呼吸 */
        const lo = 2 + band * 4;
        let v = 0;
        for (let k = lo; k < lo + 4; k++) v += bins[k];
        const target = Math.max(v / (4 * 255), rms * 0.8);
        smooth[i] += (target - smooth[i]) * (target > smooth[i] ? 0.55 : 0.12); /* 快攻慢放 */
        const idle = 0.1 + 0.06 * Math.sin(now / 900 + i * 0.6); /* 静默慢摆 */
        const amp = Math.max(smooth[i], idle);
        const a = (i / VIZ_DOTS) * Math.PI * 2 - Math.PI / 2;
        const r = 21 + amp * 10;
        dots[i].setAttribute("cx", (36 + r * Math.cos(a)).toFixed(2));
        dots[i].setAttribute("cy", (36 + r * Math.sin(a)).toFixed(2));
        dots[i].setAttribute("r", (1.3 + amp * 1.6).toFixed(2));
        dots[i].setAttribute("opacity", (0.35 + amp * 0.65).toFixed(2));
      }
      if (viz) viz.raf = requestAnimationFrame(loop);
    };
    viz.raf = requestAnimationFrame(loop);
  }
  function stopViz() {
    if (!viz) return;
    cancelAnimationFrame(viz.raf);
    viz.svg.remove();
    try { viz.stream.getTracks().forEach((t) => t.stop()); } catch { }
    try { viz.ctx.close(); } catch { } /* Safari 音频上下文有实例上限，随用随关 */
    viz = null;
  }
  /* 硬复位：同步清空一切后再 abort 旧实例（并摘除其回调）——绝不依赖 onend 触发 */
  const hardReset = () => {
    const r = rec;
    rec = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (wdTimer) { clearTimeout(wdTimer); wdTimer = null; }
    if (vizArm) { clearTimeout(vizArm); vizArm = null; }
    stopViz();
    if (activeBtn) { setState(activeBtn, false); activeBtn = null; }
    if (r) { r.onresult = r.onerror = r.onend = r.onspeechstart = r.onaudiostart = null; try { r.abort(); } catch { /* 已结束 */ } }
  };
  /* 麦克风预检：即开即停（只为触发授权弹窗与精确失败原因；持续持有会抢麦克风路由——补记 10） */
  async function ensureMic() {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
      return { err: null };
    } catch (e) {
      if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(e.name)) return { err: "voice.denied" };
      if (["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"].includes(e.name)) return { err: "voice.noMic" };
      return { err: null, unknown: true };
    }
  }
  function bind(btn, input, { onFinal = null } = {}) {
    if (!btn || !input) return;
    if (typeof Ctor() !== "function") {
      btn.classList.add("voice-off");
      btn.setAttribute("aria-label", S.t("voice.aria"));
      btn.onclick = () => S.ui.toast(S.t("voice.unsupported"));
      return;
    }
    btn.setAttribute("aria-label", S.t("voice.aria"));
    btn.title = S.t("voice.aria");
    btn.onclick = async () => {
      if (rec) { hardReset(); return; } /* 会话中点击=停止（同步复位，修僵尸会话） */
      const mic = await ensureMic();
      if (mic.err) { S.ui.toast(S.t(mic.err), true); return; }
      sawSpeech = false; sawResult = false;
      const clearWd = () => { if (wdTimer) { clearTimeout(wdTimer); wdTimer = null; } };
      /* 看门狗：开环 4.5s，"环听到能量但识别零反馈" → 该设备取流冲突：弃环记忆并无环重启识别 */
      const armWatchdog = () => {
        clearWd();
        wdTimer = setTimeout(() => {
          if (!rec || sawResult || sawSpeech || !viz) return;
          if (viz.peak < 0.15) return; /* 环没听到说话——用户可能真没说，不误判 */
          vizConflicts = true;
          try { localStorage.setItem("suveoo.vizmic", "off"); } catch { }
          const r = rec;
          rec = null;
          r.onresult = r.onerror = r.onend = r.onspeechstart = r.onaudiostart = null;
          stopViz(); /* 先弃环释放麦克风路由，再无环重启识别——文字录入永远优先于特效 */
          try { r.abort(); } catch { }
          spawn(false);
        }, 4500);
      };
      const maybeViz = () => { if (!viz) { startViz(btn); armWatchdog(); } };
      const spawn = (withViz) => {
        let gotFinal = false;
        let r;
        try { r = new (Ctor())(); } catch { hardReset(); S.ui.toast(S.t("voice.err")); return; }
        rec = r;
        r.lang = "zh-CN";
        r.continuous = false;
        r.interimResults = true;
        /* 识别先占麦；点环在识别音频通道建立后再开（600ms 兜底——部分环境不触发 onaudiostart） */
        r.onaudiostart = () => { if (withViz) { if (vizArm) { clearTimeout(vizArm); vizArm = null; } maybeViz(); } };
        if (withViz) vizArm = setTimeout(() => { vizArm = null; if (rec === r) maybeViz(); }, 600);
        r.onspeechstart = () => { sawSpeech = true; clearWd(); };
        r.onresult = (e) => {
          sawResult = true;
          clearWd();
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          input.value = text.trim();
          if (e.results[e.results.length - 1].isFinal) {
            gotFinal = true;
            try { r.stop(); } catch { } /* 拿到 final 即停，缩短音频会话（Safari 长挂诱因） */
          }
        };
        r.onerror = (e) => {
          if (e.error === "aborted") return; /* 用户主动停/收口，不提示 */
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
        try { r.start(); } catch { hardReset(); S.ui.toast(S.t("voice.err")); return; }
        timer = setTimeout(hardReset, 30000); /* 绝对上限：覆盖 onend 永不触发的环境 */
      };
      spawn(!vizConflicts);
    };
  }
  /* 页面切走/隐藏即收口（移动端切后台音频会话必挂） */
  document.addEventListener("visibilitychange", () => { if (document.hidden) hardReset(); });
  return { supported: () => typeof Ctor() === "function", bind };
})();
