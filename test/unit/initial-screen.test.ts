import { describe, expect, test } from "bun:test";
import { chooseInitialScreen } from "../../src/cli/initial-screen.ts";
import { insertReview } from "../../src/store/records.ts";
import { records } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("chooseInitialScreen", () => {
  test("zero effective reviews → queue screen", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(chooseInitialScreen(store.db)).toBe("queue");
  });

  test("any effective review → review screen", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const first = store.db.select({ id: records.id }).from(records).limit(1).get();
    expect(first?.id).toBeDefined();
    insertReview(store.db, {
      record_id: first!.id,
      status: "accepted",
      final_label: "food",
      prev_label: "food",
      source_of_truth: "human",
    });
    expect(chooseInitialScreen(store.db)).toBe("review");
  });
});
