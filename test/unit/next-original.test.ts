import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { nextOriginal, prevOriginal } from "../../src/actions/record/next-original.ts";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("shift+j / shift+k navigate original (row-index) order", () => {
  test("under smart-next, shift+j advances to next pending row, not next smart row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Attach a built-in `labellens:computed` Issue to ATM withdrawal so the
    // weighted smart-pending score pins it at position 0 ahead of the
    // fixture's imported `label_issue` on Senior Engineer.
    const atm = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'ATM withdrawal'`,
    )[0]!;
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${atm.id}, 'low_confidence', 0.78, 'labellens:computed', ${new Date().toISOString()})
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

    // Cursor starts at smart position 0 (ATM withdrawal).
    expect(app.cursor?.current()?.text).toBe("ATM withdrawal");

    // shift+j should advance to next row by ORIGINAL order — the document
    // row immediately after ATM withdrawal is "Refund from Swiggy".
    nextOriginal.run(app);
    expect(app.cursor?.current()?.text).toBe("Refund from Swiggy");

    // shift+k goes back.
    prevOriginal.run(app);
    expect(app.cursor?.current()?.text).toBe("ATM withdrawal");
  });
});
