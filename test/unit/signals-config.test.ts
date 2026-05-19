import { describe, expect, test } from "bun:test";
import { runSignals } from "../../src/signals/run.ts";
import { issues, predictions, records } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

async function seedFixture() {
  const store = await openTmpStore({ ingest: "tiny.jsonl" });
  store.db.delete(predictions).run();
  store.db.delete(records).run();
  store.db
    .insert(records)
    .values([
      {
        id: "r1",
        sourcePath: "x",
        rowIndex: 0,
        text: "alpha",
        contextBefore: null,
        contextAfter: null,
        raw: "{}",
        orphan: false,
      },
      {
        id: "r2",
        sourcePath: "x",
        rowIndex: 1,
        text: "beta",
        contextBefore: null,
        contextAfter: null,
        raw: "{}",
        orphan: false,
      },
    ])
    .run();
  store.db
    .insert(predictions)
    .values([
      { recordId: "r1", label: "food", confidence: 0.2, source: "model", reason: null, raw: "{}" },
      {
        recordId: "r2",
        label: "food",
        confidence: 0.9,
        source: "model_a",
        reason: null,
        raw: "{}",
      },
      {
        recordId: "r2",
        label: "travel",
        confidence: 0.8,
        source: "model_b",
        reason: null,
        raw: "{}",
      },
    ])
    .run();
  return store;
}

describe("runSignals enabled gate", () => {
  test("enabled=undefined computes every signal (parity with old behavior)", async () => {
    using store = await seedFixture();
    runSignals(store.db);
    const rows = store.db.select().from(issues).all();
    const types = new Set(rows.map((r) => r.type));
    expect(types.has("low_confidence")).toBe(true);
    expect(types.has("source_disagreement")).toBe(true);
  });

  test("enabled=['lowConfidence'] skips disagreement + duplicate", async () => {
    using store = await seedFixture();
    runSignals(store.db, { enabled: ["lowConfidence"] });
    const rows = store.db.select().from(issues).all();
    const types = new Set(rows.map((r) => r.type));
    expect(types.has("low_confidence")).toBe(true);
    expect(types.has("source_disagreement")).toBe(false);
  });

  test("lowConfidence.default gates which records emit low_confidence", async () => {
    using store = await seedFixture();
    runSignals(store.db, { lowConfidence: { default: 0.1, bySource: [] } });
    const rows = store.db.select().from(issues).all();
    expect(rows.find((r) => r.type === "low_confidence" && r.recordId === "r1")).toBeUndefined();
  });
});
