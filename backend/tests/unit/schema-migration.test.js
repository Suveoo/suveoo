import { describe, expect, it } from "vitest";
import { columnMigrations } from "../../worker-main.js";

/** 幂等列迁移：DDL 保持老表结构，新列一律经 columnMigrations 补齐（生产老 DO 与测试新 DO 同路径）。 */
describe("columnMigrations（幂等列迁移清单）", () => {
  it("老库（无 session_epoch / 无 card）→ 产出两条 ALTER", () => {
    const out = columnMigrations({ profile: ["user_id", "email", "password_hash"], tx: ["id", "ts"] });
    expect(out).toEqual([
      "ALTER TABLE profile ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE tx ADD COLUMN card TEXT",
    ]);
  });

  it("已迁移（两列齐备）→ 空（重复执行不炸）", () => {
    expect(columnMigrations({ profile: ["user_id", "session_epoch"], tx: ["id", "card"] })).toEqual([]);
  });

  it("半迁移（仅 profile 已补）→ 只补 tx.card；空输入 → 两条 ALTER", () => {
    expect(columnMigrations({ profile: ["session_epoch"], tx: ["id"] })).toEqual(["ALTER TABLE tx ADD COLUMN card TEXT"]);
    expect(columnMigrations({})).toHaveLength(2);
  });
});
