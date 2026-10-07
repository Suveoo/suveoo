/** 导航守卫分类（纯函数；站内/站外/深链/私网拒绝） */
import { describe, it, expect } from "vitest";
import { classifyTarget, isInternal } from "../main/navigation.js";

describe("classifyTarget 站内归一", () => {
  it("本地协议原样放行", () => {
    expect(classifyTarget("suveoo-app://local/account/cards")).toEqual({ kind: "internal", url: "suveoo-app://local/account/cards" });
  });
  it("生产域（含 www/子域）重写为本地协议，保留 path/search/hash", () => {
    const t = classifyTarget("https://suveoo.com/account/cards?x=1#top");
    expect(t.kind).toBe("internal");
    expect(t.url).toBe("suveoo-app://local/account/cards?x=1#top");
    expect(classifyTarget("https://www.suveoo.com/wealth").url).toBe("suveoo-app://local/wealth");
  });
  it("深链 suveoo:// 归一为本地路径", () => {
    expect(classifyTarget("suveoo://account/cards")).toEqual({ kind: "internal", url: "suveoo-app://local/account/cards" });
    expect(classifyTarget("suveoo:///transfer/intrabank")).toEqual({ kind: "internal", url: "suveoo-app://local/transfer/intrabank" });
  });
});

describe("classifyTarget 站外与拒绝", () => {
  it("普通 http(s) 站外放行", () => {
    expect(classifyTarget("https://example.com/page").kind).toBe("external");
    expect(classifyTarget("http://example.com").kind).toBe("external");
  });
  it("环回/私网地址站外一律拒绝", () => {
    expect(classifyTarget("https://localhost/x").kind).toBe("deny");
    expect(classifyTarget("http://127.0.0.1:8080/x").kind).toBe("deny");
    expect(classifyTarget("http://10.1.2.3/x").kind).toBe("deny");
    expect(classifyTarget("http://192.168.0.2/x").kind).toBe("deny");
    expect(classifyTarget("http://172.31.255.1/x").kind).toBe("deny");
    expect(classifyTarget("http://[::1]/x").kind).toBe("deny");
  });
  it("危险 scheme 拒绝", () => {
    expect(classifyTarget("javascript:alert(1)").kind).toBe("deny");
    expect(classifyTarget("file:///C:/Windows").kind).toBe("deny");
    expect(classifyTarget("data:text/html,x").kind).toBe("deny");
    expect(classifyTarget("windows-l2tp:foo").kind).toBe("deny");
  });
  it("畸形输入拒绝", () => {
    expect(classifyTarget("").kind).toBe("deny");
    expect(classifyTarget(null).kind).toBe("deny");
    expect(classifyTarget("::::").kind).toBe("deny");
  });
});

describe("isInternal", () => {
  it("本地协议与生产域为站内", () => {
    expect(isInternal("suveoo-app://local/home")).toBe(true);
    expect(isInternal("https://suveoo.com/home")).toBe(true);
    expect(isInternal("https://evil.com")).toBe(false);
  });
});
