/* biometric-web.js — Web 版黄级确认本地在场校验（WebAuthn 平台通行密钥）
 * 对齐三客户端的黄级本地门（consent.js 原本只挂 Capacitor 分支：AndroidX BiometricPrompt /
 * Windows Hello / Touch ID——web 此前点「确认执行」即执行）。
 * 原则与客户端完全同款（consent.js 第六十六轮口径）：
 *   · 增强不是门槛——无平台认证器 / 未启用 / 加载或校验异常一律放行，绝不阻断业务；
 *   · 纯本地在场校验——服务端零改动零感知，五闸 / grant / 审计语义不变；
 *   · 用户取消 = 中止本次确认（对齐客户端 verify() 的 {ok:false} 语义）。
 * 懒加载：本文件不被任何 HTML 引用，由 consent.js 的 S.bioWebLoad() 在黄级确认首次触发时
 * 按需注入（URL 带全站资产版本号防缓存错配）；客户端壳内 gate() 直接放行（原生分支负责）。 */
(function () {
  function api() {
    const LS_ID = "suveoo_webauthn_gate";       // 本机登记的平台凭据 id（base64url，仅存本浏览器）
    const LS_DECLINED = "suveoo_webauthn_declined"; // 「暂不」记忆键（清浏览器数据可重置）
    let availCache = null;

    const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const b64uDec = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const t = (k, fb) => { try { const v = S.t(k); return v === k ? fb : v; } catch { return fb; } };
    const toast = (m, err) => { try { S.ui.toast(m, err); } catch { /* 页面早期无 UI 忽略 */ } };
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隐私模式忽略 */ } };

    /* 平台认证器可用性（Touch ID / Windows Hello / 安卓生物识别）。客户端壳内恒 false——门由原生分支负责 */
    async function available() {
      if (window.Capacitor?.Plugins?.Biometric) return false;
      try {
        if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        if (availCache === null) availCache = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        return !!availCache;
      } catch { return false; }
    }

    const enrolled = () => !!lsGet(LS_ID);

    /* 本地登记：create() 的 UV ceremony 本身就是一次生物识别——成功即视为本机已验证。
     * user.id 用随机值（与账户无关，凭据不出本机）；rp.id 省略 = 当前源（suveoo.com）。 */
    async function enroll() {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "Suveoo" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "suveoo-local-confirm", displayName: t("bio.webGateUser", "Suveoo 本机确认") },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60000,
        attestation: "none"
      } });
      if (!cred) throw new Error("no-credential");
      lsSet(LS_ID, b64u(cred.rawId));
      return true;
    }

    /* 在场校验：OS 生物识别通过才有 assertion。取消/超时 → "cancel"；其余异常 → "pass"（放行） */
    async function verify() {
      const id = lsGet(LS_ID);
      if (!id) return "pass";
      try {
        const assertion = await navigator.credentials.get({ publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: "public-key", id: b64uDec(id) }],
          userVerification: "required",
          timeout: 60000
        } });
        return assertion ? "ok" : "pass";
      } catch (e) {
        const n = String(e?.name ?? "");
        return (n === "NotAllowedError" || n === "AbortError") ? "cancel" : "pass";
      }
    }

    /* 首次询问（交互复用 biometric-shell 的 askEnable 模式）：暂不 → 记忆键，永不再问 */
    function askEnable() {
      return new Promise((resolve) => {
        let done = false;
        const fin = (v) => { if (done) return; done = true; try { m.close(); } catch { } resolve(v); };
        const m = S.ui.modal(`
          <h3 style="font-size:17px">${S.fmt.escape(t("bio.webGateTitle", "启用本机生物识别确认？"))}</h3>
          <p class="muted" style="font-size:13px;line-height:1.65;margin:10px 0 0">${S.fmt.escape(t("bio.webGateBody", "与手机和桌面客户端一致：黄级操作点「确认执行」后，先用本机指纹 / 面部 / 设备密码验证一次。凭据只保存在本机浏览器，不上传服务器。"))}</p>
          <div class="row" style="gap:10px;margin-top:18px">
            <button type="button" class="btn" id="bw-no" style="flex:1">${S.fmt.escape(t("bio.enableLater", "暂不"))}</button>
            <button type="button" class="btn btn-primary" id="bw-yes" style="flex:2">${S.fmt.escape(t("bio.enableNow", "立即启用"))}</button>
          </div>`, { onClose: () => fin(false) }); /* 点遮罩=暂不 */
        m.el.querySelector("#bw-yes").onclick = () => fin(true);
        m.el.querySelector("#bw-no").onclick = () => fin(false);
      });
    }

    /* 消费者唯一入口。返回 "pass"（继续，含未启用/不可用/异常）| "ok"（已通过本机验证，继续）|
     * "cancel"（用户主动取消，中止本次确认）。 */
    async function gate() {
      if (window.Capacitor?.Plugins?.Biometric) return "pass"; /* 壳内双保险：原生分支负责 */
      if (!(await available())) return "pass";
      if (enrolled()) return verify();
      if (lsGet(LS_DECLINED)) return "pass";
      if (!(await askEnable())) { lsSet(LS_DECLINED, "1"); return "pass"; }
      try {
        await enroll();
        toast(t("bio.webGateOn", "已启用本机生物识别确认"));
        return "ok"; /* create 的 UV ceremony 已完成一次生物识别，本次确认即视为已验证 */
      } catch (e) {
        if (String(e?.name ?? "") === "NotAllowedError") return "pass"; /* 平台弹层取消：本次放行，下次再问 */
        toast(t("bio.webGateFail", "启用未完成，本次将继续操作"), true);
        return "pass";
      }
    }

    return { available, enrolled, gate, verify, enroll };
  }

  if (window.S && S.ui) S.bioWeb = api();
  else document.addEventListener("DOMContentLoaded", () => { if (window.S && S.ui) S.bioWeb = api(); }, { once: true });
})();
