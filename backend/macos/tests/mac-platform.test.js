/** macOS 平台差异纯函数：返回键映射 / DMG 安装器候选 / 深链归一（mac 补充面） */
import { describe, it, expect } from "vitest";
import { navKeyAction } from "../main/navigation.js";
import { installerCandidate } from "../main/update.js";
import { classifyTarget } from "../main/navigation.js";

describe("navKeyAction 返回/前进键映射", () => {
  const key = (o) => ({ type: "keyDown", key: "a", ...o });
  it("mac：Cmd+←/→ 为返回/前进", () => {
    expect(navKeyAction(key({ meta: true, key: "ArrowLeft" }), true)).toBe("back");
    expect(navKeyAction(key({ meta: true, key: "ArrowRight" }), true)).toBe("fwd");
  });
  it("mac：Cmd+[ / Cmd+] 为返回/前进（Safari/Chrome 惯例）", () => {
    expect(navKeyAction(key({ meta: true, key: "[" }), true)).toBe("back");
    expect(navKeyAction(key({ meta: true, key: "]" }), true)).toBe("fwd");
  });
  it("Alt+←/→ 双平台均生效（外接 Win 键盘）", () => {
    expect(navKeyAction(key({ alt: true, key: "ArrowLeft" }), true)).toBe("back");
    expect(navKeyAction(key({ alt: true, key: "ArrowRight" }), false)).toBe("fwd");
  });
  it("Windows：Cmd(=Meta)+方向不触发；mac：Cmd 修饰裸方向键之外不触发", () => {
    expect(navKeyAction(key({ meta: true, key: "ArrowLeft" }), false)).toBeNull();
    expect(navKeyAction(key({ meta: true, key: "ArrowRight" }), false)).toBeNull();
  });
  it("无修饰/其他键/keyUp 一律 null", () => {
    expect(navKeyAction(key({ key: "ArrowLeft" }), true)).toBeNull();
    expect(navKeyAction(key({ meta: true, key: "A" }), true)).toBeNull();
    expect(navKeyAction(key({ type: "keyUp", meta: true, key: "ArrowLeft" }), true)).toBeNull();
    expect(navKeyAction(null, true)).toBeNull();
  });
});

describe("installerCandidate DMG/zip 安装器候选（mac 安装语义）", () => {
  const DIR = "/Users/u/Library/Application Support/Suveoo/updates";
  it("updates 目录内的 .dmg / .zip 入选", () => {
    expect(installerCandidate(`${DIR}/suveoo-setup-3.183.0.dmg`, DIR)).toBe(`${DIR}/suveoo-setup-3.183.0.dmg`);
    expect(installerCandidate(`${DIR}/suveoo-macos-3.183.0.zip`, DIR)).toBe(`${DIR}/suveoo-macos-3.183.0.zip`);
  });
  it(".exe 一律拒绝（Windows 残留语义不适用 mac）", () => {
    expect(installerCandidate(`${DIR}/suveoo-setup-3.183.0.exe`, DIR)).toBeNull();
  });
  it("目录外/穿越/其他后缀拒绝", () => {
    expect(installerCandidate("/tmp/evil.dmg", DIR)).toBeNull();
    expect(installerCandidate(`${DIR}/../evil.dmg`, DIR)).toBeNull(); // resolve 后落在目录外
    expect(installerCandidate(`${DIR}/notes.txt`, DIR)).toBeNull();
    expect(installerCandidate(DIR, DIR)).toBeNull(); // 目录本身且无后缀
  });
  it("非字符串/空串拒绝", () => {
    expect(installerCandidate(null, DIR)).toBeNull();
    expect(installerCandidate("", DIR)).toBeNull();
    expect(installerCandidate(123, DIR)).toBeNull();
  });
});

describe("classifyTarget mac 深链补充面", () => {
  it("二级深链 suveoo://ai/s/{id} 归一为本地路径", () => {
    const t = classifyTarget("suveoo://ai/s/abc123");
    expect(t).toEqual({ kind: "internal", url: "suveoo-app://local/ai/s/abc123" });
  });
  it("深链带 query/hash 保留", () => {
    const t = classifyTarget("suveoo://download?src=dl#top");
    expect(t.kind).toBe("internal");
    expect(t.url).toBe("suveoo-app://local/download?src=dl#top");
  });
  it("深链 host 形态（suveoo://home）与 authority 形态等价归一", () => {
    expect(classifyTarget("suveoo://home").url).toBe("suveoo-app://local/home");
    expect(classifyTarget("suveoo:///home").url).toBe("suveoo-app://local/home");
  });
  it("非 suveoo 深链 scheme 拒绝", () => {
    expect(classifyTarget("suveoo-app://local/…").kind).toBe("internal"); // 本地协议本体
    expect(classifyTarget("otherscheme://home").kind).toBe("deny");
  });
});
