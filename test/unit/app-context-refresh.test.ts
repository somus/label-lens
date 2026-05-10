import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { runSignals } from "../../src/signals/run.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

describe("AppContext.refreshAllCursors", () => {
  test("re-queries every open cursor so newly written issues surface", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    // Pre-existing imported issue keeps `flagged` non-zero. Switch to
    // `by-issue:low_confidence` instead — empty until signals run.
    const lowConfQueue = "by-issue:low_confidence" as const;
    const cursor = app.getCursor(lowConfQueue);
    expect(cursor.total).toBe(0);

    runSignals(store.db, { lowConfidenceThreshold: 0.5 });

    // Without refresh, the cached cursor still reports 0.
    expect(cursor.total).toBe(0);
    app.refreshAllCursors();
    expect(cursor.total).toBeGreaterThan(0);
  });
});
