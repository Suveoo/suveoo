/** IPC 路由白名单与入参形状校验（渲染层输入不可信） */
import { describe, it, expect } from "vitest";
import { ROUTES } from "../main/ipc.js";

const ok = (key, arg) => ROUTES[key] && ROUTES[key](arg);
const bad = (key, arg) => !ok(key, arg);

describe("插件方法白名单", () => {
  it("四个插件共 16 个方法全部注册", () => {
    expect(Object.keys(ROUTES).length).toBe(16);
    const expectCount = { NativeBridge: 2, LocalNotifications: 5, Biometric: 5, Update: 4 };
    for (const [p, n] of Object.entries(expectCount)) {
      expect(Object.keys(ROUTES).filter((k) => k.startsWith(p + ":")).length, p).toBe(n);
    }
  });
  it("未注册方法不存在（调用即拒）", () => {
    expect(ROUTES["Fs:readFile"]).toBeUndefined();
    expect(ROUTES["Update:exec"]).toBeUndefined();
    expect(ROUTES["NativeBridge:eval"]).toBeUndefined();
  });
});

describe("NativeBridge:saveToken", () => {
  it("合法：空串（登出）或正常 token", () => {
    expect(ok("NativeBridge:saveToken", { token: "" })).toBe(true);
    expect(ok("NativeBridge:saveToken", { token: "jwt.abc.def" })).toBe(true);
  });
  it("拒绝：缺字段/超长/非字符串", () => {
    expect(bad("NativeBridge:saveToken", {})).toBe(true);
    expect(bad("NativeBridge:saveToken", { token: "x".repeat(4097) })).toBe(true);
    expect(bad("NativeBridge:saveToken", { token: 123 })).toBe(true);
  });
});

describe("LocalNotifications:schedule", () => {
  const good = { notifications: [{ id: 1, title: "t", body: "b", extra: { url: "/account" } }] };
  it("合法载荷通过", () => expect(ok("LocalNotifications:schedule", good)).toBe(true));
  it("拒绝：非数组/超量/缺字段", () => {
    expect(bad("LocalNotifications:schedule", { notifications: "x" })).toBe(true);
    expect(bad("LocalNotifications:schedule", { notifications: Array.from({ length: 21 }, (_, i) => ({ id: i })) })).toBe(true);
    expect(bad("LocalNotifications:schedule", null)).toBe(true);
  });
});

describe("Biometric:storeCredentials", () => {
  it("合法凭据通过；缺一/超长拒绝", () => {
    expect(ok("Biometric:storeCredentials", { email: "a@b.c", password: "p" })).toBe(true);
    expect(bad("Biometric:storeCredentials", { email: "a@b.c" })).toBe(true);
    expect(bad("Biometric:storeCredentials", { email: "x".repeat(201), password: "p" })).toBe(true);
  });
});

describe("Update:download / install", () => {
  it("download 必须带 url 且 ≤500 字符", () => {
    expect(ok("Update:download", { url: "https://suveoo.com/dl/a.exe", sha256: "ab".repeat(32) })).toBe(true);
    expect(bad("Update:download", {})).toBe(true);
    expect(bad("Update:download", { url: "x".repeat(501) })).toBe(true);
  });
  it("install 必须带 fileUri", () => {
    expect(ok("Update:install", { fileUri: "C:\\x\\a.exe" })).toBe(true);
    expect(bad("Update:install", { file: "a.exe" })).toBe(true);
  });
});
