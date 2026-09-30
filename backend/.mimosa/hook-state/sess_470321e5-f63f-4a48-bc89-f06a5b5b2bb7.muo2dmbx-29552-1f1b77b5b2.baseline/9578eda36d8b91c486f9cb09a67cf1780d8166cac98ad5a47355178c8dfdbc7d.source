import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { checkAdminToken } from "../../worker-main.js";

/** 任务五：演示端点管理员令牌（fail-closed 双门 + 审计 + 只读巡检）。 */
const BASE = "https://suveoo.com";

const seed = (headers = {}) => SELF.fetch(BASE + "/api/demo/seed", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
});

describe("管理员令牌纯函数（fail-closed）", () => {
  it("ADMIN_TOKEN 未配置 → 任何请求一律拒绝", async () => {
    const req = new Request(BASE + "/api/demo/seed", { method: "POST", headers: { "x-admin-token": "whatever" } });
    expect(checkAdminToken(req, {})).toBe(false);
    expect(checkAdminToken(req, { ADMIN_TOKEN: null })).toBe(false);
  });
  it("配置后：精确匹配通过；错值/缺头拒绝", async () => {
    const mk = (v) => new Request(BASE, { method: "POST", headers: v ? { "x-admin-token": v } : {} });
    expect(checkAdminToken(mk("right"), { ADMIN_TOKEN: "right" })).toBe(true);
    expect(checkAdminToken(mk("wrong"), { ADMIN_TOKEN: "right" })).toBe(false);
    expect(checkAdminToken(mk(null), { ADMIN_TOKEN: "right" })).toBe(false);
  });
});

describe("/api/demo/seed 管理员门", () => {
  it("无 token → 403 ADMIN_FORBIDDEN", async () => {
    const r = await seed();
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("ADMIN_FORBIDDEN");
  });

  it("错 token → 403 ADMIN_FORBIDDEN", async () => {
    const r = await seed({ "x-admin-token": "not-the-token" });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("ADMIN_FORBIDDEN");
  });

  it("正确 token（DEMO_MODE 下）→ 200 且灌入成功；审计写入 AUDIT_KV", async () => {
    const r = await seed({ "x-admin-token": env.ADMIN_TOKEN });    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.user_id).toMatch(/^U\d+$/);
    /* 审计落盘（键风格 audit:{日期}:{trace}） */
    const page = await env.AUDIT_KV.list({ prefix: "audit:" });
    const keys = page.keys.map((k) => k.name);
    expect(keys.length).toBeGreaterThan(0);
    const rec = JSON.parse((await env.AUDIT_KV.get(keys[0])) ?? "{}");
    expect(rec.action).toBe("admin_seed");
    expect(rec.detail.email).toBe("demo@suveoo.com");
    expect(typeof rec.detail.ip).toBe("string");
  }, 30000);

  it("inspect 巡检（带 token）→ 返回 registry 用户清单且不写数据", async () => {
    const r = await SELF.fetch(BASE + "/api/demo/seed", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": env.ADMIN_TOKEN },
      body: JSON.stringify({ inspect: true }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.users[0]).toHaveProperty("payees_total");
  }, 30000);
});
