import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { signJwt } from "../../worker-main.js";

/** 任务 A：凭证缺口修复——改密/关 2FA 须当前密码；会话纪元（session epoch）全设备下线。
 *  OTP 注意：发码 60s 冷却 + 每小时 5 次（按 scene+email 计）——各用例独立账户，互不挤兑；
 *  同一用例内多次失败重试共用一码（服务端非消费式校验，密码错不烧码）。 */
const BASE = "https://suveoo.com";
const PASSWORD = "jinrongkeji2026";

async function post(path, body, token) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const j = (r) => r.json();
async function lastCode(email, scene) {
  const mails = JSON.parse((await env.MAIL_OUTBOX.get(`outbox:${email}`)) ?? "[]");
  const hit = mails.filter((m) => scene == null || (m.subject ?? "").includes(scene === "redstep" ? "高危" : scene === "recovery" ? "密码重置" : scene)).at(-1);
  return /\b(\d{6})\b/.exec(hit?.text ?? "")?.[1] ?? null;
}
async function registerUser(email, name = "测试用户") {
  await post("/api/auth/email-code", { scene: "register", email });
  const code = await lastCode(email, "注册");
  return j(await post("/api/auth/register", { email, code, name, password: PASSWORD, risk_answers: [3, 3, 4, 3, 4], aml_consented: true }));
}
async function redstepOtp(email) {
  await post("/api/auth/email-code", { scene: "redstep", email });
  return lastCode(email, "redstep");
}
async function doOp(instance, payload) {
  return env.LEDGER.get(env.LEDGER.idFromName(instance)).fetch("https://x/", {
    method: "POST", headers: { "content-type": "application/json", "x-suveoo-internal": "1" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}
const get = (path, token) => SELF.fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });
const patch = (path, body, token) => SELF.fetch(BASE + path, {
  method: "PATCH", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

describe("A1 改密须当前密码 + 会话纪元", () => {
  it("缺 current_password → 400 PASSWORD_REQUIRED（不进 OTP/密码校验）", async () => {
    const email = "sc1@test.dev";
    const out = await registerUser(email);
    const otp = await redstepOtp(email);
    const r = await patch("/api/security/password", { otp, new_password: "newpass12345" }, out.token);
    expect(r.status).toBe(400);
    expect((await j(r)).error.code).toBe("PASSWORD_REQUIRED");
  }, 20000);

  it("错 current_password → 401 WRONG_OLD_PASSWORD；同码重试正确密码 → 200（验证码未被烧掉）", async () => {
    const email = "sc2@test.dev";
    const out = await registerUser(email);
    const otp = await redstepOtp(email);
    const bad = await patch("/api/security/password", { otp, current_password: "wrong-old-pass", new_password: "newpass12345" }, out.token);
    expect(bad.status).toBe(401);
    expect((await j(bad)).error.code).toBe("WRONG_OLD_PASSWORD");
    /* 密码错误路径非消费式校验 OTP：同一验证码应仍可用 */
    const ok = await patch("/api/security/password", { otp, current_password: PASSWORD, new_password: "newpass12345" }, out.token);
    expect(ok.status).toBe(200);
    const body = await j(ok);
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
  }, 20000);

  it("改密成功：返回新纪元 token；旧 token 全线 401（其他设备下线），新 token 正常", async () => {
    const email = "sc3@test.dev";
    const out = await registerUser(email);
    const otp = await redstepOtp(email);
    const r = await patch("/api/security/password", { otp, current_password: PASSWORD, new_password: "newpass12345" }, out.token);
    const body = await j(r);
    expect((await get("/api/session", out.token)).status).toBe(401);   /* 旧 token：纪元不匹配 */
    expect((await get("/api/session", body.token)).status).toBe(200);  /* 新 token：当前设备不掉线 */
    /* 旧密码不能再登录，新密码可以 */
    const badLogin = await j(await post("/api/auth/login", { identifier: email, password: PASSWORD }));
    expect(badLogin.mfa_required !== false || badLogin.error).toBeTruthy();
    await doOp(`u:${out.user_id}`, { op: "set2fa", enabled: 0 });
    const reLogin = await j(await post("/api/auth/login", { identifier: email, password: "newpass12345" }));
    expect(typeof reLogin.token).toBe("string");
    expect((await get("/api/overview", reLogin.token)).status).toBe(200);
  }, 20000);

  it("部署前的旧式令牌（无 epo 声明）按纪元 0 对待：bump 后同样失效", async () => {
    const email = "sc4@test.dev";
    const out = await registerUser(email);
    const legacyToken = await signJwt(env.JWT_SECRET, { sub: out.user_id, email, typ: "session" }, { ttlSeconds: 3600 });
    expect((await get("/api/session", legacyToken)).status).toBe(200); /* 纪元仍 0：旧令牌有效 */
    const otp = await redstepOtp(email);
    await patch("/api/security/password", { otp, current_password: PASSWORD, new_password: "newpass12345" }, out.token);
    expect((await get("/api/session", legacyToken)).status).toBe(401); /* 纪元 1：旧令牌即刻失效 */
  }, 20000);
});

describe("A2 关闭 2FA 须当前密码；开启仍只要 OTP", () => {
  it("关闭：缺密码 → 400 PASSWORD_REQUIRED；错密码 → 401；对密码 → 200", async () => {
    const email = "sc5@test.dev";
    const out = await registerUser(email);
    const auth0 = await doOp(`u:${out.user_id}`, { op: "getAuth" });
    expect(auth0.twofa_enabled).toBe(1);
    const otp = await redstepOtp(email);
    const noPw = await post("/api/security/2fa", { enabled: false, otp }, out.token);
    expect(noPw.status).toBe(400);
    expect((await j(noPw)).error.code).toBe("PASSWORD_REQUIRED");
    const badPw = await post("/api/security/2fa", { enabled: false, otp, current_password: "nope-nope" }, out.token);
    expect(badPw.status).toBe(401);
    expect((await j(badPw)).error.code).toBe("WRONG_OLD_PASSWORD");
    const ok = await post("/api/security/2fa", { enabled: false, otp, current_password: PASSWORD }, out.token);
    expect(ok.status).toBe(200);
    const auth1 = await doOp(`u:${out.user_id}`, { op: "getAuth" });
    expect(auth1.twofa_enabled).toBe(0);
  }, 20000);

  it("开启：只要 OTP（不带任何密码）→ 200（提升安全的操作保持低摩擦）", async () => {
    const email = "sc6@test.dev";
    const out = await registerUser(email);
    await doOp(`u:${out.user_id}`, { op: "set2fa", enabled: 0 });
    const otp = await redstepOtp(email);
    const r = await post("/api/security/2fa", { enabled: true, otp }, out.token);
    expect(r.status).toBe(200);
    expect((await j(r)).enabled).toBe(true);
    expect((await doOp(`u:${out.user_id}`, { op: "getAuth" })).twofa_enabled).toBe(1);
  }, 20000);
});

describe("A3 找回密码：无旧密码字段 + 重置后全设备下线", () => {
  it("请求体仅 email/code/new_password（流程不含任何旧密码字段）；成功后既有 JWT 全部 401", async () => {
    const email = "sc7@test.dev";
    const out = await registerUser(email);
    /* 另造一台"已登录设备"：注册即签发的会话 */
    await doOp(`u:${out.user_id}`, { op: "set2fa", enabled: 0 });
    const otherDevice = await j(await post("/api/auth/login", { identifier: email, password: PASSWORD }));
    expect((await get("/api/overview", otherDevice.token)).status).toBe(200);

    await post("/api/auth/email-code", { scene: "recovery", email });
    const code = await lastCode(email, "recovery");
    /* 红线验证：找回流程只提交 email + code + new_password 三字段，绝无旧密码 */
    const r = await post("/api/auth/recover", { email, code, new_password: "recovered99876" });
    expect(r.status).toBe(200);
    expect((await j(r)).ok).toBe(true);

    expect((await get("/api/overview", out.token)).status).toBe(401);         /* 注册设备下线 */
    expect((await get("/api/overview", otherDevice.token)).status).toBe(401); /* 另一设备下线 */
    const reLogin = await j(await post("/api/auth/login", { identifier: email, password: "recovered99876" }));
    expect(typeof reLogin.token).toBe("string"); /* 新密码登录拿到新纪元 token */
  }, 20000);

  it("hRecover 请求体不含旧密码键亦可成功（服务端从不读取旧密码）", async () => {
    const email = "sc8@test.dev";
    await registerUser(email);
    await post("/api/auth/email-code", { scene: "recovery", email });
    const code = await lastCode(email, "recovery");
    const body = { email, code, new_password: "recovered99877" };
    expect(Object.keys(body).some((k) => /old|current|previous/i.test(k))).toBe(false);
    const r = await post("/api/auth/recover", body);
    expect(r.status).toBe(200);
  }, 20000);
});
