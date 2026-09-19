/* voice.js — 语音输入（主页 hero 与 /ai 输入框共用）
 * Web Speech API（SpeechRecognition/webkitSpeechRecognition，zh-CN，continuous=false，interim=true）；
 * feature-detect：不支持的环境按钮降级为 i18n toast；不引入第三方库。
 * S.voice.bind(btn, input)：识别结果填入输入框（interim 实时上屏），不自动发送。
 *
 * 补记 7：错误分流 i18n + 会话生命周期加固（Safari onend 僵尸→硬复位；final 即停；30s 上限；页面隐藏收口）。
 * 补记 11（队长三平台实测定案）：**识别器独占麦克风**——彻底移除点环并行取流与 getUserMedia 预检：
 *   Android Chromium：并行 gUM 流抢麦克风路由饿死识别（环动字不进）；
 *   iOS Safari：并行流/AudioContext 损坏首次之后的音频会话（gUM 报 NotReadable/Abort，
 *   预检反而把本可工作的识别器拦死在门外）。
 *   识别器自身触发授权弹窗（Permissions-Policy 已放行 microphone=(self)，真机实证会弹窗），
 *   错误码直接映射 i18n 文案；监听反馈仅保留按钮本身的红色脉冲（纯 CSS，零麦克风成本）。
 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, activeBtn = null, timer = null;
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
  /* 硬复位：同步清空一切后再 abort 旧实例（并摘除其回调）——绝不依赖 onend 触发（iOS 缺陷） */
  const hardReset = () => {
    const r = rec;
    rec = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (activeBtn) { setState(activeBtn, false); activeBtn = null; }
    if (r) { r.onresult = r.onerror = r.onend = r.onspeechstart = r.onaudiostart = null; try { r.abort(); } catch { /* 已结束 */ } }
  };
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
    btn.onclick = () => {
      if (rec) { hardReset(); return; } /* 会话中点击=停止（同步复位，修僵尸会话） */
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
          try { r.stop(); } catch { /* 已收口 */ } /* 拿到 final 即停，缩短音频会话（Safari 长挂诱因） */
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
      try { r.start(); } catch { hardReset(); S.ui.toast(S.t("voice.err"), true); return; }
      timer = setTimeout(hardReset, 30000); /* 绝对上限：覆盖 onend 永不触发的环境 */
    };
  }
  /* 页面切走/隐藏即收口（移动端切后台音频会话必挂） */
  document.addEventListener("visibilitychange", () => { if (document.hidden) hardReset(); });
  return { supported: () => typeof Ctor() === "function", bind };
})();
