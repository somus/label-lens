import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { type AppContext, createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { currentReview } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel"],
  input: { path: "x", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "x", format: "jsonl" },
};

function ctx(db: import("../../src/store/db.ts").Db): AppContext {
  return createAppContext({ db, config, requestRender: () => {}, onQuit: () => {} });
}

describe("applyEffects", () => {
  test("commitDecision inserts a review row + refreshes pending cursor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    applyEffects(app, "pending", [
      {
        kind: "commitDecision",
        recordId: id,
        status: "relabeled",
        finalLabel: "travel",
        prevLabel: "food",
        sourceOfTruth: "human",
      },
    ]);
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
    expect(cur?.prev_label).toBe("food");
  });

  test("updateNote writes to records.note", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    applyEffects(app, "pending", [{ kind: "updateNote", recordId: id, value: "hi" }]);
    const note = store.db.all<{ note: string | null }>(
      sql`SELECT note FROM records WHERE id = ${id}`,
    )[0]?.note;
    expect(note).toBe("hi");
  });

  test("close clears AppContext.overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    app.overlay = { kind: "note", state: { recordId: "x", value: "y" } };
    applyEffects(app, "pending", [{ kind: "close" }]);
    expect(app.overlay).toBeNull();
  });

  test("markAssistantViewed is a no-op on AppContext until slice 11", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    expect(() =>
      applyEffects(app, "pending", [{ kind: "markAssistantViewed", recordId: "x" }]),
    ).not.toThrow();
  });
});
