/** 三级更新决策矩阵（纯函数；语义与前端 shell-update.js autoCheck 一致） */
import { describe, it, expect } from "vitest";
import { semverToCode, decideAction, isAllowedUpdateUrl } from "../main/update.js";

describe("semverToCode", () => {
  it("major*1e6 + minor*1e3 + patch", () => {
    expect(semverToCode("3.181.0")).toBe(3181000);
    expect(semverToCode("3.181.1")).toBe(3181001);
    expect(semverToCode("4.0.0")).toBe(4000000);
  });
  it("大版本单调递增（3.x.x < 4.0.0）", () => {
    expect(semverToCode("4.0.0")).toBeGreaterThan(semverToCode("3.999.999"));
  });
  it("非法输入归 0", () => {
    expect(semverToCode("")).toBe(0);
    expect(semverToCode("abc")).toBe(0);
    expect(semverToCode(null)).toBe(0);
  });
});

describe("decideAction 三级决策", () => {
  const cur = { versionCode: 3181000 };
  it("低于最低安全线 → force（全屏阻断）", () => {
    expect(decideAction(cur, { versionCode: 3182000, minVersionCode: 3181001 })).toBe("force");
  });
  it("有新版且未达强制线 → optional（询问+可贪睡）", () => {
    expect(decideAction(cur, { versionCode: 3182000, minVersionCode: 0 })).toBe("optional");
    expect(decideAction(cur, { versionCode: 3182000, minVersionCode: 3181000 })).toBe("optional");
  });
  it("无新版 → latest（静默）", () => {
    expect(decideAction(cur, { versionCode: 3181000 })).toBe("latest");
    expect(decideAction(cur, { versionCode: 3180000 })).toBe("latest");
  });
  it("manifest 缺失/畸形 → latest（不误伤）", () => {
    expect(decideAction(cur, null)).toBe("latest");
    expect(decideAction(cur, {})).toBe("latest");
  });
  it("恰好等于最低线 → 不是 force（线是开区间下界）", () => {
    expect(decideAction(cur, { versionCode: 3182000, minVersionCode: 3181000 })).toBe("optional");
  });
});

describe("isAllowedUpdateUrl 更新包白名单", () => {
  it("放行：suveoo.com 与子域 + https", () => {
    expect(isAllowedUpdateUrl("https://suveoo.com/dl/suveoo-setup-3.182.0.exe")).toBe(true);
    expect(isAllowedUpdateUrl("https://cdn.suveoo.com/dl/x.exe")).toBe(true);
  });
  it("拒绝：非 https / 非 suveoo 域 / 仿冒域", () => {
    expect(isAllowedUpdateUrl("http://suveoo.com/dl/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://evil.com/dl/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://suveoo.com.evil.com/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://suveoo.com@evil.com/x.exe")).toBe(false); // userinfo 混淆（hostname=evil.com）
    expect(isAllowedUpdateUrl("ftp://suveoo.com/x")).toBe(false);
  });
  it("拒绝：环回/私网/链路本地/保留地址", () => {
    expect(isAllowedUpdateUrl("https://localhost/dl/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://127.0.0.1/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://10.0.0.5/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://192.168.1.4/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://172.16.0.9/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://169.254.1.1/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://0.0.0.0/x.exe")).toBe(false);
    expect(isAllowedUpdateUrl("https://224.0.0.1/x.exe")).toBe(false);
  });
  it("拒绝：畸形输入", () => {
    expect(isAllowedUpdateUrl("")).toBe(false);
    expect(isAllowedUpdateUrl("not a url")).toBe(false);
    expect(isAllowedUpdateUrl(null)).toBe(false);
  });
});
