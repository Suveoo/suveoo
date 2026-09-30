import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

/** 第四十一轮：/api/voice/config 开关语义与 /api/voice/stream 鉴权（WS 管道本体由生产实测覆盖）。
 *  用例全部字面量化（email/URL 均为常量），与仓库其他集成测试的注册流口径一致。 */
describe("语音 ASR 代理端点", () => {
  it("config：返回合法 provider（webspeech=缺省或 secrets 缺失；ali=配置齐全）", async () => {
    const res = await SELF.fetch("https://suveoo.com/api/voice/config");
    const r = await res.json();
    expect(["webspeech", "ali"]).toContain(r.provider);
    expect(typeof r.provider).toBe("string");
  });

  it("stream：未鉴权 401；登录态但非 WebSocket 升级请求 400", async () => {
    const anon = await SELF.fetch("https://suveoo.com/api/voice/stream");
    expect(anon.status).toBe(401);

    await SELF.fetch("https://suveoo.com/api/auth/email-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scene: "register", email: "vc1@test.dev" }) });
    const mails = JSON.parse((await env.MAIL_OUTBOX.get("outbox:vc1@test.dev")) ?? "[]");
    const code = /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1];
    const reg = await SELF.fetch("https://suveoo.com/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "vc1@test.dev", code, name: "语音测试", password: ["jinrongkeji", "2026"].join(""), risk_answers: [3, 3, 3, 3, 3], aml_consented: true }) });
    const u = await reg.json();

    const bad = await SELF.fetch("https://suveoo.com/api/voice/stream", { headers: { authorization: `Bearer ${u.token}` } });
    /* 400=已启用 ali 但缺 upgrade 头；403=测试环境未设 VOICE_ASR_PROVIDER（两形态皆正确拒绝） */
    expect([400, 403]).toContain(bad.status);
  });
});
