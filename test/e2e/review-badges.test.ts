import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { runSignals } from "../../src/signals/run.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("review screen — issue badges", () => {
  test("renders PRD §10.4 wording for low_confidence and source_disagreement", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Coffee at Blue Tokai: primary `food` at 0.81 from `llm:gpt-4`. Bump the
    // default so the primary trips the low-confidence threshold; the record
    // also carries a secondary `regex.simple` prediction that drives
    // source_disagreement, giving both badges on the same row.
    runSignals(store.db, { lowConfidence: { default: 0.9, bySource: [] } });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "by-issue:source_disagreement" });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Coffee at Blue Tokai");
    expect(frame).toContain("Model is uncertain (confidence");
    expect(frame).toContain("Sources disagree on this record");
    // Wording rule: must NOT use the verdict-flavored copy.
    expect(frame).not.toContain("Likely label error");
  });

  test("renders exact_duplicate copy on a duplicate-cluster member", async () => {
    using store = await openTmpStore({ ingest: "duplicates.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "by-issue:exact_duplicate" });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Identical text appears 3 times in this dataset");
  });
});
