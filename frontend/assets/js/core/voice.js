/* voice.js — 语音输入（主页 hero 与 /ai 输入框共用）
 * Web Speech API（SpeechRecognition/webkitSpeechRecognition，zh-CN，continuous=false，interim=true）；
 * feature-detect：不支持（如部分 Linux/Firefox）按钮降级为 i18n toast 提示；不引入第三方库。
 * S.voice.bind(btn, input)：识别结果填入输入框（interim 实时上屏），不自动发送。
 *
 * 第二十五轮补记 7：权限预检 getUserMedia + 错误分流 + 会话生命周期加固（Safari onend 僵尸硬复位）。
 * 第二十五轮补记 9：**响度驱动点环特效**——监听期间在按钮外围渲染 24 点波纹环，
 *   Web Audio AnalyserNode 实时取语音频段能量（getByteFrequencyData，iOS14.5+/全主流支持）：
 *   对径两点共用频段（对称呼吸感）；每点快攻慢放平滑（0.55 上行 / 0.12 释放）；
 *   整体 RMS 门控保证大声齐动；静默时慢正弦摆动（无声环也活着）；
 *   rAF 仅监听期运行；prefers-reduced-motion 不渲染；会话结束随 hardReset 一并拆除。
 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, activeBtn = null, timer = null;
  let viz = null; /* { svg, ctx, stream, raf } */
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
  /* ---- 响度点环 ---- */
  const VIZ_DOTS = 24, VIZ_BANDS = 12;
  function startViz(stream, btn) {
    stopViz();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx, analyser;
    try {
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser); /* 只分析不回放 */
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch { try { ctx.close(); } catch { } return; }
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
    const loop = () => {
      analyser.getByteFrequencyData(bins);
      let rms = 0;
      for (let k = 2; k < 48; k++) rms += bins[k]; /* bins 2..48 ≈ 语音能量区 */
      rms /= 46 * 255;
      const now = performance.now();
      for (let i = 0; i < VIZ_DOTS; i++) {
        const band = i % VIZ_BANDS; /* 对径同频段 → 左右对称呼吸 */
        const lo = 2 + band * 4;
        let v = 0;
        for (let k = lo; k < lo + 4; k++) v += bins[k];
        const target = Math.max(v / (4 * 255), rms * 0.8);
        smooth[i] += (target - smooth[i]) * (target > smooth[i] ? 0.55 : 0.12); /* 快攻慢放 */
        const idle = 0.1 + 0.06 * Math.sin(now / 900 + i * 0.6); /* 静默慢摆，无声也活着 */
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
    viz = { svg, ctx, stream, raf: requestAnimationFrame(loop) };
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
    stopViz();
    if (activeBtn) { setState(activeBtn, false); activeBtn = null; }
    if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch { /* 已结束 */ } }
  };
  /* 麦克风预检：返回 { stream } 或 { err: i18n键 }——成功时流交给点环持有（监听期常开，结束统一停） */
  async function ensureMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream };
    } catch (e) {
      if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(e.name)) return { err: "voice.denied" };
      if (["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"].includes(e.name)) return { err: "voice.noMic" };
      return { err: null }; /* 未知 getUserMedia 错误交给识别器本体报 */
    }
  }
  function bind(btn, input, { onFinal = null } = {}) {
    if (!btn || !input) return;
    if (typeof Ctor() !== "function") {
      /* 降级：不支持语音识别的环境（如 Firefox）保留按钮但只给提示 */
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
      if (!mic.err) startViz(mic.stream, btn);
      let gotFinal = false;
      try {
        rec = new (Ctor())();
        rec.lang = "zh-CN";
        rec.continuous = false;
        rec.interimResults = true;
        rec.onresult = (e) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          input.value = text.trim();
          if (e.results[e.results.length - 1].isFinal) {
            gotFinal = true;
            try { rec.stop(); } catch { /* 已收口 */ } /* 拿到 final 即停，缩短音频会话（Safari 长挂诱因） */
          }
        };
        rec.onerror = (e) => {
          if (e.error === "aborted") return; /* 用户主动停/收口，不提示 */
          const key = MSG[e.error];
          if (key && key !== "voice.err") S.ui.toast(S.t(key), e.error !== "no-speech");
          else S.ui.toast(S.t("voice.err") + " (" + e.error + ")", true);
        };
        rec.onend = () => {
          const hadFinal = gotFinal;
          hardReset();
          if (hadFinal && typeof onFinal === "function") onFinal(input.value);
        };
        activeBtn = btn;
        setState(btn, true);
        rec.start();
        timer = setTimeout(hardReset, 30000); /* 绝对上限：覆盖 onend 永不触发的环境 */
      } catch { hardReset(); S.ui.toast(S.t("voice.err")); }
    };
  }
  /* 页面切走/隐藏即收口（移动端切后台音频会话必挂） */
  document.addEventListener("visibilitychange", () => { if (document.hidden) hardReset(); });
  return { supported: () => typeof Ctor() === "function", bind };
})();
