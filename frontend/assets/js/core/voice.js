/* voice.js — 语音输入（主页 hero 与 /ai 输入框共用）
 * Web Speech API（SpeechRecognition/webkitSpeechRecognition，zh-CN，continuous=false，interim=true）；
 * feature-detect：不支持（如部分 Linux/Firefox）按钮降级为 i18n toast 提示；不引入第三方库。
 * S.voice.bind(btn, input)：识别结果填入输入框（interim 实时上屏），不自动发送。
 *
 * 第二十五轮续 7 重构（队长真机反馈三项修复）：
 * 1) 权限预检：点击先 getUserMedia({audio})——①强制浏览器弹出麦克风授权（实测部分环境
 *    SpeechRecognition 静默失败、从不弹窗：Windows/Android 权限已被拒时 start() 1ms 内即
 *    not-allowed，无任何提示）；②失败拿到精确原因（NotAllowed/NotFound/NotReadable…）。
 * 2) 错误分流：not-allowed/audio-capture/network/no-speech → 各自 i18n 文案（原实现全部
 *    兜底成一句"语音识别出错"，真机排障无从下手）；未映射码附原始 code 便于回报。
 * 3) 会话生命周期加固（修 Safari"只识别第一次、麦克风一直亮"）：
 *    - 旧实现 rec.stop() 后完全依赖 onend 复位——iOS Safari 存在 onend 不触发缺陷，
 *      rec 永不置空，后续点击全被"if(rec) 停止"分支吞掉 → 表现即只识别第一次；
 *    - 现改为：final 结果立即 stop() 收口；会话中再点=硬复位（同步清 UI/引用后 abort，
 *      不依赖任何回调）；30s 绝对上限自动收口；页面隐藏即 abort；单例会话。
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
  /* 硬复位：同步清空一切后再 abort 旧实例（并摘除其回调）——绝不依赖 onend 触发 */
  const hardReset = () => {
    const r = rec;
    rec = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (activeBtn) { setState(activeBtn, false); activeBtn = null; }
    if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch { /* 已结束 */ } }
  };
  /* 麦克风预检：返回 null=通过；否则返回应提示的 i18n 键 */
  async function ensureMic() {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
      return null;
    } catch (e) {
      if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(e.name)) return "voice.denied";
      if (["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"].includes(e.name)) return "voice.noMic";
      return null; /* 未知 getUserMedia 错误不拦截，交给识别器本体报 */
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
      const micErr = await ensureMic();
      if (micErr) { S.ui.toast(S.t(micErr), true); return; }
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
