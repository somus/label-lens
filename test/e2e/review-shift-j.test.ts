import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("review screen — shift+J / shift+K escape hatch", () => {
  test("shift+J advances by document order even when smart-next is on", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Attach a built-in `labellens:computed` Issue to ATM withdrawal so the
    // weighted smart-pending score pins it at index 0 ahead of the fixture's
    // imported `label_issue` on Senior Engineer.
    const atm = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'ATM withdrawal'`,
    )[0]!;
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${atm.id}, 'low_confidence', 0.78, 'labellens:computed', ${new Date().toISOString()})
    `);

    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "pending" });
    await renderOnce();

    // Smart-pending puts ATM withdrawal at the top.
    expect(app.cursor?.current()?.text).toBe("ATM withdrawal");

    // shift+J advances in document order — next pending row after ATM
    // withdrawal in tiny.jsonl is "Refund from Swiggy".
    mockInput.pressKey("J", { shift: true });
    await renderOnce();
    expect(app.cursor?.current()?.text).toBe("Refund from Swiggy");

    // shift+K returns to ATM withdrawal.
    mockInput.pressKey("K", { shift: true });
    await renderOnce();
    expect(app.cursor?.current()?.text).toBe("ATM withdrawal");
  });
});
