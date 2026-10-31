/** macOS 平台差异纯函数：返回键映射 / DMG 安装器候选 / 深链归一 / 动态路由重写（mac 补充面） */
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { navKeyAction, classifyTarget } from "../main/navigation.js";
import { installerCandidate } from "../main/update.js";
import { rewriteDynamicRoutes, resolveAsset } from "../main/protocol.js";
/* 测试跨平台可跑：断言一律先归一到 POSIX 分隔符（Windows 宿主/ mac VM 结果一致） */
const slash = (s) => (s == null ? s : String(s).replace(/\\/g, "/"));

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
  const DIR = path.join(os.tmpdir(), "suveoo-updates-test");
  it("updates 目录内的 .dmg / .zip 入选", () => {
    expect(slash(installerCandidate(path.join(DIR, "suveoo-setup-3.183.0.dmg"), DIR))).toBe(slash(path.join(DIR, "suveoo-setup-3.183.0.dmg")));
    expect(slash(installerCandidate(path.join(DIR, "suveoo-macos-3.183.0.zip"), DIR))).toBe(slash(path.join(DIR, "suveoo-macos-3.183.0.zip")));
  });
  it(".exe 一律拒绝（Windows 残留语义不适用 mac）", () => {
    expect(installerCandidate(path.join(DIR, "suveoo-setup-3.183.0.exe"), DIR)).toBeNull();
  });
  it("目录外/穿越/其他后缀拒绝", () => {
    expect(installerCandidate(path.join(os.tmpdir(), "evil.dmg"), DIR)).toBeNull();
    expect(installerCandidate(path.join(DIR, "..", "evil.dmg"), DIR)).toBeNull(); // resolve 后落在目录外
    expect(installerCandidate(path.join(DIR, "notes.txt"), DIR)).toBeNull();
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

describe("rewriteDynamicRoutes 动态路由重写（镜像 worker-main.js；队长实测 Bug4 根因）", () => {
  it("卡片页 slug 剥离：history/settings/report-loss 三键", () => {
    expect(rewriteDynamicRoutes("/account/card/debit-card-4/history")).toBe("/account/card/history");
    expect(rewriteDynamicRoutes("/account/card/credit-card-1/settings/")).toBe("/account/card/settings");
    expect(rewriteDynamicRoutes("/account/card/debit-card-2/report-loss")).toBe("/account/card/report-loss");
  });
  it("AI 会话 URL 复用 /ai 页", () => {
    expect(rewriteDynamicRoutes("/ai/s/AbC_123-xyz")).toBe("/ai");
    expect(rewriteDynamicRoutes("/ai/s/abc/")).toBe("/ai");
  });
  it("卡面图旧路径重写到 mastercard/（存量 art 兼容）", () => {
    expect(rewriteDynamicRoutes("/assets/images/cards-front/credit-cards/foo.webp")).toBe("/assets/images/cards-front/credit-cards/mastercard/foo.webp");
    expect(rewriteDynamicRoutes("/assets/images/cards-front/debit-cards/bar.webp")).toBe("/assets/images/cards-front/debit-cards/mastercard/bar.webp");
  });
  it("已有组织目录与新式路径不重写；普通路径原样返回", () => {
    expect(rewriteDynamicRoutes("/assets/images/cards-front/credit-cards/visa/foo.webp")).toBe("/assets/images/cards-front/credit-cards/visa/foo.webp");
    expect(rewriteDynamicRoutes("/account/cards")).toBe("/account/cards");
    expect(rewriteDynamicRoutes("/")).toBe("/");
  });
  it("resolveAsset 落地：卡片三页与 /ai/s/{id} 在壳内可解析到真实文件（修复前 404）", () => {
    expect(slash(resolveAsset("/account/card/debit-card-4/history"))).toContain("account/card/history/index.html");
    expect(slash(resolveAsset("/account/card/credit-card-1/report-loss"))).toContain("account/card/report-loss/index.html");
    expect(slash(resolveAsset("/account/card/debit-card-2/settings"))).toContain("account/card/settings/index.html");
    expect(slash(resolveAsset("/ai/s/abc123"))).toContain("ai/index.html");
  });
});
