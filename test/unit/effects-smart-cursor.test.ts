import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("applyEffects refreshes the active smart-pending cursor", () => {
  test("commitDecision drops the reviewed record from the on-screen smart cursor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Pump ATM withdrawal to score=3 so smart-pending pins it at index 0.
    const atm = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'ATM withdrawal'`,
    )[0]!;
    store.db.run(sql`
      INSERT INTO predictions (record_id, label, confidence, source, raw)
      VALUES (${atm.id}, 'cash', 0.18, 'regex.simple', '{}')
    `);
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${atm.id}, 'low_confidence', 0.18, 'signals', ${new Date().toISOString()})
    `);

    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");
    expect(app.cursor?.queueId).toBe("smart-pending");
    expect(app.cursor?.current()?.text).toBe("ATM withdrawal");
    const totalBefore = app.cursor!.total;

    // Simulate the decisions.ts call site.
    applyEffects(app, "pending", [
      {
        kind: "commitDecision",
        recordId: atm.id,
        status: "accepted",
        finalLabel: "other",
        prevLabel: null,
        sourceOfTruth: "human",
      },
    ]);

    // The smart cursor must have dropped the reviewed record — same data
    // source as `pending`, just signal-weighted ordering.
    expect(app.cursor!.total).toBe(totalBefore - 1);
    expect(app.cursor!.current()?.text).not.toBe("ATM withdrawal");
  });
});
