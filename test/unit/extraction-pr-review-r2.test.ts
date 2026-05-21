import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { switchQueue } from "../../src/actions/queue/switch.ts";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { cacheAssistantResponse } from "../../src/store/assistant-queries.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
  assistant: { enabled: true, provider: "ollama" },
} as unknown as LabellensConfig;

function mkApp(db: Parameters<typeof createAppContext>[0]["db"]) {
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

const cachedResponse: AssistantResponse = {
  suggestedLabel: "travel",
  confidence: "high",
  reasoning: "x",
  evidenceFor: [],
  evidenceAgainst: [],
  recommendedAction: "relabel",
};

describe("hydrateAssistantFromCache marks record as viewed (thread 2)", () => {
  test("installs cache → adds record id to viewedAssistant", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    cacheAssistantResponse(store.db, id, "h1", cachedResponse);
    const app = mkApp(store.db);
    app.hydrateAssistantFromCache();
    expect(app.overlay?.kind).toBe("assistant");
    expect(app.viewedAssistant.has(id)).toBe(true);
  });
});

describe("close effect preserves hydrate-installed overlay (thread 3)", () => {
  test("close still clears overlay when not hydrated this batch", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = mkApp(store.db);
    app.overlay = { kind: "note", state: { recordId: "x", value: "y", presets: [] } };
    applyEffects(app, "pending", [{ kind: "close" }]);
    expect(app.overlay).toBeNull();
  });

  test("commitDecision → cursor.change hydrate → trailing close preserves the hydrated overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 2`,
    );
    if (ids.length < 2) return;
    const [first, second] = ids;
    // Cache an assistant suggestion for the second record only — when the
    // queue refresh advances the cursor past the first record, hydrate
    // installs this row's suggestion as the new overlay.
    cacheAssistantResponse(store.db, second!.id, "h1", cachedResponse);
    const app = mkApp(store.db);
    applyEffects(app, "pending", [
      {
        kind: "commitDecision",
        recordId: first!.id,
        status: "accepted",
        finalLabel: "food",
        prevLabel: null,
        sourceOfTruth: "human",
      },
      { kind: "close" },
    ]);
    expect(app.overlay?.kind).toBe("assistant");
    if (app.overlay?.kind === "assistant") {
      expect(app.overlay.state.recordId).toBe(second!.id);
    }
  });
});

describe("switchQueue closes stale assistant overlay (thread 4)", () => {
  test("an active assistant overlay is dropped when the queue switches", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = mkApp(store.db);
    const overlay = {
      kind: "assistant" as const,
      state: {
        recordId: "old-rec",
        predictedLabel: null,
        reasoningExpanded: false,
        status: "done" as const,
        suggestion: "food",
        confidence: "high" as const,
        recommendedAction: "accept" as const,
        reason: "x",
      },
    };
    // Cast through unknown so the narrow `never` inference from the
    // initial null state doesn't reject the assignment.
    app.overlay = overlay as unknown as typeof app.overlay;
    switchQueue(app, "skipped");
    expect(app.overlay === null || app.overlay.kind !== "assistant").toBe(true);
  });
});
