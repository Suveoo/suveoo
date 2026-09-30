import { beforeAll, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { staticKeyCandidates, rewriteDynamicRoutes } from "../../worker-main.js";

/** 向测试 R2 桶放 fixture。 */
async function put(key, body, contentType) {
  await env.ASSETS.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
}

beforeAll(async () => {
  await put("index.html", "<html>ROOT-REDIRECT</html>", "text/html");
  await put("home/index.html", "<html>HOME-PAGE</html>", "text/html");
  await put("about/index.html", "<html>ABOUT</html>", "text/html");
  await put("account/card/history/index.html", "<html>CARD-HISTORY-TEMPLATE</html>", "text/html");
  await put("account/card/settings/index.html", "<html>CARD-SETTINGS-TEMPLATE</html>", "text/html");
  await put("404.html", "<html>NOT-FOUND-PAGE</html>", "text/html");
  await put("robots.txt", "User-agent: *\nAllow: /", "text/plain");
  await put("assets/css/app.css", "body{}", "text/css");
  await put("assets/js/app.js", "1", "text/javascript");
  await put("assets/images/a.webp", "IMG", "image/webp");
  await put("assets/fonts/f.ttf", "TTF", "font/ttf");
  await put("i18n/zh-CN.json", "{}", "application/json");
});

const BASE = "https://suveoo.com";
const get = (path, headers) => SELF.fetch(BASE + path, { headers });

describe("① 静态查找顺序（pages.md §2.6）", () => {
  it("路径、尾斜杠等价、/index.html 兜底", async () => {
    const a = await get("/home");
    expect(a.status).toBe(200);
    expect(await a.text()).toContain("HOME-PAGE");
    const b = await get("/home/");
    expect(b.status).toBe(200);
    expect(await b.text()).toContain("HOME-PAGE");
    const c = await get("/about/");
    expect(c.status).toBe(200);
  });

  it("根路径服务 index.html；robots.txt 直出", async () => {
    const root = await get("/");
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("ROOT-REDIRECT");
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toContain("text/plain");
  });

  it("未知路径 → 404.html + HTTP 404", async () => {
    const r = await get("/definitely/not/here");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("NOT-FOUND-PAGE");
  });

  it("候选序列纯函数", () => {
    expect(staticKeyCandidates("/home")).toEqual(["home", "home/index.html", "home.html"]);
    expect(staticKeyCandidates("/home/")).toEqual(["home", "home/index.html", "home.html"]);
    expect(staticKeyCandidates("/")).toEqual(["index.html"]);
  });
});

describe("① 动态卡路由重写", () => {
  it("/account/card/{任意slug}/history → history 模板", async () => {
    const r = await get("/account/card/debit-card-1/history");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("CARD-HISTORY-TEMPLATE");
    const s = await get("/account/card/credit-card-1/settings/");
    expect(s.status).toBe(200);
    expect(await s.text()).toContain("CARD-SETTINGS-TEMPLATE");
  });

  it("重写规则纯函数", () => {
    expect(rewriteDynamicRoutes("/account/card/debit-card-3/history")).toBe("/account/card/history");
    expect(rewriteDynamicRoutes("/account/card/x/settings/")).toBe("/account/card/settings");
    expect(rewriteDynamicRoutes("/account/cards")).toBe("/account/cards"); // 不误伤
  });
});

describe("① 缓存头、内容类型与条件请求", () => {
  it("分级缓存策略（pages.md §11.3）", async () => {
    expect((await get("/assets/images/a.webp")).headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await get("/assets/fonts/f.ttf")).headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await get("/assets/css/app.css")).headers.get("cache-control")).toBe("public, max-age=3600, must-revalidate");
    expect((await get("/i18n/zh-CN.json")).headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await get("/home")).headers.get("cache-control")).toBe("no-cache");
  });

  it("内容类型按扩展名映射", async () => {
    expect((await get("/assets/images/a.webp")).headers.get("content-type")).toBe("image/webp");
    expect((await get("/assets/fonts/f.ttf")).headers.get("content-type")).toBe("font/ttf");
    expect((await get("/assets/js/app.js")).headers.get("content-type")).toBe("text/javascript");
    expect((await get("/i18n/zh-CN.json")).headers.get("content-type")).toBe("application/json");
  });

  it("If-None-Match 命中 → 304", async () => {
    const first = await get("/home");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await get("/home", { "if-none-match": etag });
    expect(second.status).toBe(304);
  });

  it("安全头齐全；静态仅允许 GET/HEAD", async () => {
    const r = await get("/home");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const post = await SELF.fetch(BASE + "/home", { method: "POST" });
    expect(post.status).toBe(405);
  });
});
