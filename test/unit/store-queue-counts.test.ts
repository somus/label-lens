import { describe, expect, test } from "bun:test";
import { queueRecords } from "../../src/store/queries.ts";
import { queueCount } from "../../src/store/queues/queue-counts.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("queueCount", () => {
  test("matches queueRecords length for every static built-in", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    for (const id of [
      "pending",
      "skipped",
      "low-confidence",
      "disagreements",
      "flagged",
      "marked",
    ]) {
      const def = resolveQueue(id);
      expect(queueCount(store.db, def)).toBe(queueRecords(store.db, def.query).length);
    }
  });

  test("matches for parameterized factories", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    for (const id of ["by-source:llm:gpt-4", "by-label:food", "by-issue:label_issue"]) {
      const def = resolveQueue(id);
      expect(queueCount(store.db, def)).toBe(queueRecords(store.db, def.query).length);
    }
  });
});
