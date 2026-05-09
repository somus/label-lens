import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { currentReview, progressCounts } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("slice 2 acceptance — accept → relabel → skip → undo", () => {
  test("end-to-end review loop drives store + UI consistently", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 4`)
      .map((r) => r.id);

    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 110,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config,
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app });
    await renderOnce();

    // Step 1 — accept first record (predicted = food)
    mockInput.pressKey("a");
    await renderOnce();
    expect(currentReview(store.db, ids[0]!)?.status).toBe("accepted");
    expect(currentReview(store.db, ids[0]!)?.final_label).toBe("food");
    expect(progressCounts(store.db).accepted).toBe(1);

    // Step 2 — relabel second record to travel via number key '2'
    mockInput.pressKey("2");
    await renderOnce();
    const second = currentReview(store.db, ids[1]!);
    // tiny.jsonl record 2 ("Uber ride to airport") is predicted as travel by llm:gpt-4 — expect 'accepted'.
    // Whichever way, the label should be 'travel'.
    expect(second?.final_label).toBe("travel");

    // Step 3 — skip third record
    mockInput.pressKey("s");
    await renderOnce();
    expect(currentReview(store.db, ids[2]!)?.status).toBe("skipped");
    const after3 = progressCounts(store.db);
    expect(after3.skipped).toBe(1);

    // Step 4 — undo most recent action (skip)
    mockInput.pressKey("u");
    await renderOnce();
    expect(currentReview(store.db, ids[2]!)).toBeNull();
    const after4 = progressCounts(store.db);
    expect(after4.skipped).toBe(0);
    // Two reviews remain effective: the accept + relabel
    expect(after4.accepted + after4.relabeled).toBe(2);

    // Frame invariants
    const frame = captureCharFrame();
    expect(frame).toContain("Reviewed: 2 / 10");
    expect(frame).toContain("Skipped: 0");
    expect(frame).toContain("Pending: 8");
    expect(frame).toContain("history:");
  });
});
