import { describe, expect, test } from "bun:test";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("by-source queue factory", () => {
  test("filters records by their primary prediction source", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const def = resolveQueue("by-source:llm:gpt-4");
    expect(def.label).toBe("Source: llm:gpt-4");
    const rows = queueRecords(store.db, def.query);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.primaryPrediction?.source).toBe("llm:gpt-4");
    }
  });

  test("returns empty for an unknown source", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const def = resolveQueue("by-source:no-such-model");
    expect(queueRecords(store.db, def.query).length).toBe(0);
  });

  test("rejects an empty source argument", async () => {
    expect(() => resolveQueue("by-source:")).toThrow();
  });
});
