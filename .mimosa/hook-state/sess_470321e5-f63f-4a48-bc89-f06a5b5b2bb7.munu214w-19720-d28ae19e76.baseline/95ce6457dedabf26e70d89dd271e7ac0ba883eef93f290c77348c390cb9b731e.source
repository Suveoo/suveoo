import { describe, expect, it } from "vitest";
import { TEST_PASSWORD } from "../helpers/test-creds.js";
import {
  signJwt, verifyJwt, constantTimeEqual, hashPassword, verifyPassword, maskEmail,
} from "../../worker-main.js";

const SECRET = "unit-test-secret";

describe("⑦.4 JWT（HS256）", () => {
  it("签发→校验往返，claims 完整保留", async () => {
    const token = await signJwt(SECRET, { sub: "U100001", email: "a@suveoo.com", typ: "session" }, { ttlSeconds: 3600, now: 1760000000000 });
    const claims = await verifyJwt(token, SECRET, { now: 1760000001000 });
    expect(claims.sub).toBe("U100001");
    expect(claims.email).toBe("a@suveoo.com");
    expect(claims.typ).toBe("session");
    expect(claims.jti).toMatch(/^[0-9a-f]{16}$/);
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it("过期拒绝；过期前 1 秒仍有效", async () => {
    const token = await signJwt(SECRET, { sub: "U1", typ: "session" }, { ttlSeconds: 60, now: 1760000000000 });
    expect(await verifyJwt(token, SECRET, { now: 1760000060000 })).toBeNull();      // iat+60s
    expect(await verifyJwt(token, SECRET, { now: 1760000059999 })).not.toBeNull();  // 差 1ms
  });

  it("篡改与错误密钥拒绝", async () => {
    const token = await signJwt(SECRET, { sub: "U1", typ: "session" });
    const tampered = `${token.slice(0, -4)}beef`;
    expect(await verifyJwt(tampered, SECRET)).toBeNull();
    expect(await verifyJwt(token, "wrong-secret")).toBeNull();
    expect(await verifyJwt("not-a-jwt", SECRET)).toBeNull();
    expect(await verifyJwt(null, SECRET)).toBeNull();
  });
});

describe("⑦ 常数时间比较与口令哈希", () => {
  it("constantTimeEqual：相等真、不等假、长度不等直接假", () => {
    expect(constantTimeEqual("abcdef", "abcdef")).toBe(true);
    expect(constantTimeEqual("abcdeg", "abcdef")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("PBKDF2 哈希/校验往返；错误口令拒绝；格式带轮数与盐", async () => {
    const stored = await hashPassword(TEST_PASSWORD);
    expect(stored).toMatch(/^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPassword(TEST_PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("Jinrongkeji2026", stored)).toBe(false);
    expect(await verifyPassword("x", "malformed")).toBe(false);
    // 盐随机：两次哈希不同但均可通过校验
    const stored2 = await hashPassword(TEST_PASSWORD);
    expect(stored2).not.toBe(stored);
    expect(await verifyPassword(TEST_PASSWORD, stored2)).toBe(true);
  });

  it("邮箱掩码", () => {
    expect(maskEmail("demo@suveoo.com")).toBe("de**@suveoo.com");
    expect(maskEmail("ab@suveoo.com")).toBe("ab*@suveoo.com");
  });
});
