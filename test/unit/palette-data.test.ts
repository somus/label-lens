import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { runSignals } from "../../src/signals/run.ts";
import { fetchPaletteData } from "../../src/store/palette-data.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("fetchPaletteData", () => {
  test("returns counts for builtin queues", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const data = fetchPaletteData(store.db, ["food", "travel"]);
    expect(data.counts.get(":pending")).toBeGreaterThan(0);
    expect(data.counts.get(":marked")).toBe(0);
  });

  test("returns distinct sources from dataset", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const data = fetchPaletteData(store.db, ["food"]);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.sources.every((s) => typeof s === "string")).toBe(true);
  });

  test("returns config labels sorted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const data = fetchPaletteData(store.db, ["travel", "food", "utility"]);
    expect(data.labels).toEqual(["food", "travel", "utility"]);
  });

  test("returns source counts matching sources", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const data = fetchPaletteData(store.db, []);
    for (const source of data.sources) {
      expect(data.sourceCounts.has(source)).toBe(true);
      expect(data.sourceCounts.get(source)!).toBeGreaterThan(0);
    }
  });

  test("issue types populated after signals run", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidenceThreshold: 0.5 });
    const data = fetchPaletteData(store.db, []);
    expect(data.issueTypes.length).toBeGreaterThan(0);
  });

  test("returns value candidates for the visual filter builder", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    const data = fetchPaletteData(store.db, ["food", "travel"]);
    expect(data.filterValues.finalLabels).toContain("travel");
    expect(data.filterValues.prevLabels).toContain("food");
    expect(data.filterValues.confidences).toEqual([]);
  });
});
