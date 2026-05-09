import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { hasTag, tagsForRecord, toggleTag } from "../../src/store/tags.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("record tags", () => {
  test("toggleTag inserts then removes", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    expect(hasTag(store.db, id, "marked")).toBe(false);
    expect(toggleTag(store.db, id, "marked")).toBe(true);
    expect(hasTag(store.db, id, "marked")).toBe(true);
    expect(toggleTag(store.db, id, "marked")).toBe(false);
    expect(hasTag(store.db, id, "marked")).toBe(false);
  });

  test("tags are independent per record + tag", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 2`)
      .map((r) => r.id);
    toggleTag(store.db, ids[0]!, "marked");
    toggleTag(store.db, ids[1]!, "review");
    expect(tagsForRecord(store.db, ids[0]!)).toEqual(["marked"]);
    expect(tagsForRecord(store.db, ids[1]!)).toEqual(["review"]);
  });

  test("toggleTag is idempotent across reads", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    toggleTag(store.db, id, "marked");
    expect(tagsForRecord(store.db, id)).toEqual(["marked"]);
    expect(tagsForRecord(store.db, id)).toEqual(["marked"]);
  });
});
