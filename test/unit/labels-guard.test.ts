import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { findUnknownLabels } from "../../src/store/labels.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("findUnknownLabels", () => {
  test("returns empty when every label in the DB is configured", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // tiny.jsonl uses: food, travel, shopping, utility, salary, rent, other, ENTRY_START
    const configured = [
      "food",
      "travel",
      "shopping",
      "utility",
      "salary",
      "rent",
      "other",
      "ENTRY_START",
    ];
    expect(findUnknownLabels(store.db, configured)).toEqual([]);
  });

  test("flags labels present in predictions but missing from config", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const result = findUnknownLabels(store.db, ["food", "travel"]);
    const labels = result.map((r) => r.label).sort();
    expect(labels).toContain("shopping");
    expect(labels).toContain("rent");
    expect(labels).not.toContain("food");
  });

  test("flags labels appearing only in reviews.final_label or prev_label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`)
      .map((r) => r.id);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "relabeled",
      final_label: "legacy_final",
      prev_label: "legacy_prev",
      source_of_truth: "human",
    });

    const tinyAll = [
      "food",
      "travel",
      "shopping",
      "utility",
      "salary",
      "rent",
      "other",
      "ENTRY_START",
    ];
    const result = findUnknownLabels(store.db, tinyAll);
    const labels = result.map((r) => r.label);
    expect(labels).toContain("legacy_final");
    expect(labels).toContain("legacy_prev");
  });

  test("counts are per-distinct-record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const result = findUnknownLabels(store.db, []);
    const food = result.find((r) => r.label === "food");
    expect(food?.count).toBeGreaterThanOrEqual(1);
  });
});
