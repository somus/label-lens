import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

function seedCorrection(store: TmpStore): void {
  const id = store.db.all<{ id: string }>(
    sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
  )[0]!.id;
  insertReview(store.db, {
    record_id: id,
    status: "relabeled",
    final_label: "travel",
    prev_label: "food",
    source_of_truth: "human",
  });
}

describe("stats overlay e2e", () => {
  test("Enter drills the highlighted stat row into its review queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 120,
      height: 40,
    });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app });
    await renderOnce();

    mockInput.pressKey("t");
    await renderOnce();
    expect(app.overlay?.kind).toBe("stats");
    for (let i = 0; i < 40; i++) {
      const overlay = app.overlay;
      if (overlay?.kind !== "stats") throw new Error("expected stats overlay");
      const line = overlay.state.lines[overlay.state.highlight];
      if (line?.kind === "row" && line.drillTo === "by-correction:food:travel") break;
      mockInput.pressKey("j");
      await renderOnce();
    }

    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();

    expect(app.overlay).toBeNull();
    expect(app.queueId).toBe("by-correction:food:travel");
  });
});
