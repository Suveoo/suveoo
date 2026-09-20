import { describe, expect, it } from "vitest";
import { columnMigrations } from "../../worker-main.js";

/** 幂等列迁移：DDL 保持老表结构，新列一律经 columnMigrations 补齐（生产老 DO 与测试新 DO 同路径）。 */
const CHATS_OLD = ["id", "title", "ts"];
const CHATS_NEW = [...CHATS_OLD, "created_at", "updated_at", "msg_count", "last_preview", "archived"];
const CHATS_ALTERS = [
  "ALTER TABLE chats ADD COLUMN created_at TEXT",
  "ALTER TABLE chats ADD COLUMN updated_at TEXT",
  "ALTER TABLE chats ADD COLUMN msg_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE chats ADD COLUMN last_preview TEXT",
  "ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
];
const PAYEES_OLD = ["id", "name", "account", "group_label", "email", "created_at"];
const PAYEES_NEW = [...PAYEES_OLD, "phone"];
const ALL = [
  "ALTER TABLE profile ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tx ADD COLUMN card TEXT",
  "ALTER TABLE payees ADD COLUMN phone TEXT",
  ...CHATS_ALTERS,
];

describe("columnMigrations（幂等列迁移清单）", () => {
  it("老库（无 session_epoch / 无 card / chats 老三列 / payees 无手机号）→ 产出全部 8 条 ALTER", () => {
    const out = columnMigrations({ profile: ["user_id", "email", "password_hash"], tx: ["id", "ts"], chats: CHATS_OLD, payees: PAYEES_OLD });
    expect(out).toEqual(ALL);
  });

  it("已迁移（各表列齐备）→ 空（重复执行不炸）", () => {
    expect(columnMigrations({ profile: ["user_id", "session_epoch"], tx: ["id", "card"], chats: CHATS_NEW, payees: PAYEES_NEW })).toEqual([]);
  });

  it("半迁移（profile/tx/payees 已补，chats 老三列）→ 只补 chats 五列；空输入 → 全部 8 条", () => {
    expect(columnMigrations({ profile: ["session_epoch"], tx: ["id", "card"], chats: CHATS_OLD, payees: PAYEES_NEW })).toEqual(CHATS_ALTERS);
    expect(columnMigrations({})).toHaveLength(8);
  });

  it("chats 部分迁移（只缺 last_preview/archived）→ 只补缺失两列", () => {
    const out = columnMigrations({ profile: ["session_epoch"], tx: ["card"], chats: [...CHATS_OLD, "created_at", "updated_at", "msg_count"], payees: PAYEES_NEW });
    expect(out).toEqual(["ALTER TABLE chats ADD COLUMN last_preview TEXT", "ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"]);
  });

  it("payees 单独缺 phone（第三十轮老 DO）→ 只补手机号列", () => {
    expect(columnMigrations({ profile: ["session_epoch"], tx: ["card"], chats: CHATS_NEW, payees: PAYEES_OLD }))
      .toEqual(["ALTER TABLE payees ADD COLUMN phone TEXT"]);
  });
});
