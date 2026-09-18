/* voice.js — 语音输入（第二十二轮 F：主页 hero 与 /ai 输入框共用）
 * Web Speech API（webkitSpeechRecognition，zh-CN，continuous=false，interim=true）；
 * feature-detect：不支持（iOS Safari 等）按钮降级为 i18n toast 提示；不引入第三方库。
 * S.voice.bind(btn, input)：识别结果填入输入框（focus 不抢占，交由调用方决定后续动作）。 */
S.voice = (() => {
  const Ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, activeBtn = null;
  const setState = (btn, on) => {
    btn.classList.toggle("listening", on);
    btn.setAttribute("aria-label", S.t(on ? "voice.stopAria" : "voice.aria"));
    btn.title = S.t(on ? "voice.stopAria" : "voice.aria");
  };
  function bind(btn, input, { onFinal = null } = {}) {
    if (!btn || !input) return;
    if (typeof Ctor() !== "function") {
      /* 降级：不支持语音识别的环境（如 iOS Safari）保留按钮但只给提示 */
      btn.classList.add("voice-off");
      btn.setAttribute("aria-label", S.t("voice.aria"));
      btn.onclick = () => S.ui.toast(S.t("voice.unsupported"));
      return;
    }
    btn.setAttribute("aria-label", S.t("voice.aria"));
    btn.title = S.t("voice.aria");
    btn.onclick = () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new (Ctor())();
        rec.lang = "zh-CN";
        rec.continuous = false;
        rec.interimResults = true;
        let gotFinal = false;
        rec.onresult = (e) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          const isFinal = e.results[e.results.length - 1].isFinal;
          input.value = text.trim();
          if (isFinal) gotFinal = true;
        };
        rec.onerror = (e) => {
          if (e.error === "no-speech") S.ui.toast(S.t("voice.noSpeech"));
          else if (e.error !== "aborted") S.ui.toast(S.t("voice.err"));
        };
        rec.onend = () => {
          rec = null;
          if (activeBtn) setState(activeBtn, false);
          activeBtn = null;
          if (gotFinal && typeof onFinal === "function") onFinal(input.value);
        };
        activeBtn = btn;
        setState(btn, true);
        rec.start();
      } catch { rec = null; S.ui.toast(S.t("voice.err")); }
    };
  }
  return { supported: () => typeof Ctor() === "function", bind };
})();
