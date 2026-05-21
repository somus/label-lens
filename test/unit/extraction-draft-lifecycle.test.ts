import { describe, expect, test } from "bun:test";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "extraction",
  labels: [],
  extraction: {
    fields: [
      { name: "company", type: "string", required: true },
      { name: "amount", type: "string", required: false },
    ],
  },
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

function makeApp(db: Db): AppContext {
  const app = createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(app, "pending");
  return app;
}

describe("extractionDraft lifecycle", () => {
  test("close effect clears extractionDraft so Esc-out does not leak across re-open", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.extractionDraft = { recordId: "rec-1", object: { company: "Stale", amount: null } };
    applyEffects(app, app.queueId!, [{ kind: "close" }]);
    expect(app.extractionDraft).toBeNull();
  });

  test("close effect is a no-op when no draft is in flight", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    expect(app.extractionDraft).toBeNull();
    applyEffects(app, app.queueId!, [{ kind: "close" }]);
    expect(app.extractionDraft).toBeNull();
  });
});
