import { describe, expect, it } from "vitest";
import { SITE_GUIDE_PAGES, siteGuideLookup } from "../../worker-main.js";

/* 第十一期 site_guide：知识库结构锁定 + 查询行为。
 *  路由集 vs 前端 75 页的差集比对在 backend/scripts/check-site-coverage.mjs（node 直跑——workerd 池无宿主文件系统）。 */

describe("site_guide 覆盖度（76 页）", () => {
  it("知识库恰为 76 页、路由唯一（与前端差集由 scripts/check-site-coverage.mjs 锁定；第一百二十六轮 +report-loss 挂失页）", () => {
    expect(SITE_GUIDE_PAGES).toHaveLength(76);
    expect(new Set(SITE_GUIDE_PAGES.map((p) => p.route)).size).toBe(76);
  });

  it("每页知识字段完整（purpose/entry/actions/flow/notes/section/aliases 非空）", () => {
    for (const p of SITE_GUIDE_PAGES) {
      expect(p.purpose?.length, `${p.route} purpose`).toBeGreaterThan(8);
      expect(p.entry?.length, `${p.route} entry`).toBeGreaterThan(3);
      expect(Array.isArray(p.actions) && p.actions.length, `${p.route} actions`).toBeGreaterThan(0);
      expect(p.flow?.length, `${p.route} flow`).toBeGreaterThan(8);
      expect(p.notes?.length, `${p.route} notes`).toBeGreaterThan(2);
      expect(p.section?.length, `${p.route} section`).toBeGreaterThan(0);
      expect(Array.isArray(p.aliases) && p.aliases.length, `${p.route} aliases`).toBeGreaterThan(0);
    }
  });
});

describe("site_guide 查询行为", () => {
  it("不带 query → 全站概览（含 76 页总数与分区）", () => {
    const out = siteGuideLookup(undefined);
    expect(out.total_pages).toBe(76);
    expect(out.sections.length).toBeGreaterThanOrEqual(5);
    const routes = out.sections.flatMap((s) => s.pages.map((p) => p.route));
    expect(new Set(routes).size).toBe(76);
  });

  it("「转账记录导出 CSV」→ /transfer/history 居首", () => {
    const out = siteGuideLookup("转账记录在哪导出 CSV");
    expect(out.matches[0].route).toBe("/transfer/history");
    expect(out.matches[0].actions.join()).toContain("导出 CSV");
  });

  it("「怎么给卡片解冻」→ 卡片管理/单卡设置页命中", () => {
    const out = siteGuideLookup("怎么给卡片解冻");
    const routes = out.matches.map((m) => m.route);
    expect(routes.some((r) => r === "/account/cards" || r.startsWith("/account/card/"))).toBe(true);
  });

  it("「订阅怎么退」→ /pay/subscriptions 命中且流程含黄级确认", () => {
    const out = siteGuideLookup("订阅怎么退");
    expect(out.matches.map((m) => m.route)).toContain("/pay/subscriptions");
    const sub = out.matches.find((m) => m.route === "/pay/subscriptions");
    expect(sub.flow).toContain("黄");
  });

  it("基金名精确别名命中对应详情页（ai-semi）", () => {
    const out = siteGuideLookup("Suveoo 全球半导体 AI 精选");
    expect(out.matches[0].route).toBe("/wealth/funds/ai-semi");
  });

  it("无匹配时给换词提示而非空数组", () => {
    const out = siteGuideLookup("zzzqqqxxx");
    expect(out.matches).toEqual([]);
    expect(out.matches_none).toContain("无匹配");
  });
});
