import { describe, expect, test } from "bun:test";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { openAssistant } from "../../src/overlay/assistant.ts";
import type { ExtractionFormState } from "../../src/overlay/extraction-form.ts";
import type { AssistantState } from "../../src/overlay/types.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

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

const fakeExtractionForm = { kind: "extraction-form", state: {} as ExtractionFormState } as const;

function doneState(recordId: string): AssistantState {
  return {
    recordId,
    predictedLabel: "food",
    reasoningExpanded: false,
    status: "done",
    suggestion: "food",
    confidence: "high",
    recommendedAction: "accept",
    reason: "looks good",
  };
}

describe("assistant save+restore", () => {
  test("opening a non-assistant overlay while assistant is `done` saves the state", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.openOverlay({ kind: "assistant", state: doneState("rec-1") });
    app.openOverlay(fakeExtractionForm);
    expect(app.overlay).toEqual(fakeExtractionForm);
    expect(app.savedAssistantState?.recordId).toBe("rec-1");
  });

  test("closing the foreground overlay restores the suspended assistant", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.openOverlay({ kind: "assistant", state: doneState("rec-1") });
    app.openOverlay(fakeExtractionForm);
    app.closeOverlay();
    expect(app.overlay?.kind).toBe("assistant");
    if (app.overlay?.kind === "assistant") {
      expect(app.overlay.state.recordId).toBe("rec-1");
    }
    expect(app.savedAssistantState).toBeNull();
  });

  test("loading-state assistant is NOT saved when another overlay opens", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.openOverlay({ kind: "assistant", state: openAssistant("rec-1") });
    app.openOverlay(fakeExtractionForm);
    expect(app.savedAssistantState).toBeNull();
  });

  test("reopening assistant (re-firing `i`) clears any stale saved state", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.savedAssistantState = doneState("rec-0");
    app.openOverlay({ kind: "assistant", state: openAssistant("rec-1") });
    expect(app.savedAssistantState).toBeNull();
    expect(app.overlay?.kind).toBe("assistant");
  });

  test("closing an assistant overlay directly returns to no overlay (not a restore loop)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.openOverlay({ kind: "assistant", state: doneState("rec-1") });
    app.closeOverlay();
    expect(app.overlay).toBeNull();
    expect(app.savedAssistantState).toBeNull();
  });

  test("clearSavedAssistant drops the suspended state (used by record nav)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.savedAssistantState = doneState("rec-1");
    app.clearSavedAssistant();
    expect(app.savedAssistantState).toBeNull();
  });
});
