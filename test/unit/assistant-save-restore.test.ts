import { describe, expect, test } from "bun:test";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { openAssistant, reduceAssistant } from "../../src/overlay/assistant.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
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

  test("extraction: Enter → form → Esc → Enter re-opens form (full round-trip)", async () => {
    // The bug reported by the user: after Esc closes the prefilled
    // extraction form, the next Enter on the restored assistant strip
    // did nothing. This walks the entire dispatch path the screen runs
    // — reducer → app.overlay assignment → applyEffects — and asserts
    // that the second Enter still emits `openExtractionFormPrefilled`.
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const doneAssistantState: AssistantState = {
      recordId: "rec-1",
      predictedLabel: null,
      reasoningExpanded: false,
      status: "done",
      suggestion: "",
      suggestionObject: { company: "Acme", amount: "100" },
      confidence: "high",
      recommendedAction: "relabel",
      reason: "explicit",
      extraction: {
        fields: [
          { name: "company", type: "string", required: true },
          { name: "amount", type: "string", required: false },
        ],
        predictedObject: { company: "Acme", amount: null },
      },
    };

    // 1. Open assistant overlay.
    app.openOverlay({ kind: "assistant", state: doneAssistantState });

    // 2. First Enter: reducer + applyEffects open the form prefilled.
    let result = reduceAssistant(doneAssistantState, { kind: "commit" });
    app.overlay = result.overlay;
    applyEffects(app, app.queueId!, result.effects);
    expect(app.overlay?.kind).toBe("extraction-form");
    expect(app.savedAssistantState?.recordId).toBe("rec-1");

    // 3. Form Esc: dispatch writes overlay=null, then close effect runs.
    app.overlay = null;
    app.closeOverlay();
    const restored = app.overlay as { kind: string; state: AssistantState } | null;
    expect(restored?.kind).toBe("assistant");
    expect(app.savedAssistantState).toBeNull();

    // 4. Second Enter on the restored assistant — must re-open form.
    if (restored?.kind !== "assistant") throw new Error("expected restored assistant");
    result = reduceAssistant(restored.state, { kind: "commit" });
    app.overlay = result.overlay;
    applyEffects(app, app.queueId!, result.effects);
    expect(app.overlay?.kind).toBe("extraction-form");
  });

  test("Esc-from-form-then-Enter restores even when dispatch zeroed overlay first", async () => {
    // Reproduces the bug from the assistant flow: dispatchOverlayEvent
    // writes `app.overlay = result.overlay` (null on form Esc) before
    // applyEffects runs the trailing `close` effect. closeOverlay then
    // sees overlay === null and used to fall through to overlay=null —
    // losing the suspended assistant state and breaking the next
    // Enter-opens-form gesture. The fix restores whenever
    // savedAssistantState is set, regardless of current overlay value.
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    app.openOverlay({ kind: "assistant", state: doneState("rec-1") });
    app.openOverlay(fakeExtractionForm); // saves assistant
    // Simulate the dispatch order: form Esc reducer returned
    // `overlay: null`, then close effect fires.
    app.overlay = null;
    app.closeOverlay();
    const restored = app.overlay as { kind: string; state: { recordId: string } } | null;
    expect(restored?.kind).toBe("assistant");
    expect(restored?.state.recordId).toBe("rec-1");
    expect(app.savedAssistantState).toBeNull();
  });
});
