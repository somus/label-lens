import { describe, expect, test } from "bun:test";
import { openCursor } from "../../src/cursor/cursor.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("Cursor", () => {
  test("starts at the first pending record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    expect(cursor.total).toBe(10);
    expect(cursor.position).toBe(0);
    expect(cursor.current()?.text).toBe("Lunch at Zomato Bangalore");
  });

  test("next/prev moves within bounds", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    cursor.next();
    expect(cursor.position).toBe(1);
    cursor.prev();
    expect(cursor.position).toBe(0);
    cursor.prev();
    expect(cursor.position).toBe(0);
  });

  test("emits change event on movement", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    let changed = 0;
    cursor.on("change", () => {
      changed++;
    });
    cursor.next();
    cursor.next();
    cursor.prev();
    expect(changed).toBe(3);
  });

  test("refresh keeps focus on the same record id when possible", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    cursor.next();
    cursor.next();
    const focused = cursor.current()!;
    cursor.refresh();
    expect(cursor.current()?.id).toBe(focused.id);

    insertReview(store.db, {
      record_id: focused.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    cursor.refresh();
    expect(cursor.total).toBe(9);
    expect(cursor.current()?.id).not.toBe(focused.id);
  });

  test("seek finds a record by id", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    const target = cursor.current()!;
    cursor.next();
    cursor.next();
    expect(cursor.seek(target.id)).toBe(true);
    expect(cursor.current()?.id).toBe(target.id);
    expect(cursor.seek("not-a-real-id")).toBe(false);
  });

  test("seekIndex clamps to bounds", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const cursor = openCursor(store.db, "pending");
    cursor.seekIndex(999);
    expect(cursor.position).toBe(9);
    cursor.seekIndex(-5);
    expect(cursor.position).toBe(0);
  });
});
