/**
 * Suveoo for Windows — 动态路由重写单测（镜像 macos/tests/mac-platform.test.js 的路由段）
 * Bug4（第一百五十七轮队长实测）：Worker rewriteDynamicRoutes 在 Electron 壳缺失致
 * 卡片页三按钮 /ai 会话 / 卡面图旧路径壳内 404——本文件实证壳侧镜像与 Worker 行为一致。
 */
import { describe, expect, it } from "vitest";
import { rewriteDynamicRoutes, resolveAsset } from "../main/protocol.js";

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
    const norm = (p) => String(p).replaceAll("\\", "/"); // Windows 路径分隔符归一（mac 同过）
    expect(norm(resolveAsset("/account/card/debit-card-4/history"))).toContain("account/card/history/index.html");
    expect(norm(resolveAsset("/account/card/credit-card-1/report-loss"))).toContain("account/card/report-loss/index.html");
    expect(norm(resolveAsset("/account/card/debit-card-2/settings"))).toContain("account/card/settings/index.html");
    expect(norm(resolveAsset("/ai/s/abc123"))).toContain("ai/index.html");
  });
});
