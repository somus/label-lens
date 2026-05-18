import { afterEach, describe, expect, test } from "bun:test";
import { dispatch } from "../../src/actions/dispatch.ts";
import { __setAssistantQueryFn } from "../../src/actions/record/open-assistant.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const validResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "Cafe + lunch.",
  evidenceFor: ["lunch"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

function configBase(assistant?: LabellensConfig["assistant"]): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "utility", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
    assistant,
  };
}

function makeApp(db: Db, config: LabellensConfig): AppContext {
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

afterEach(() => {
  __setAssistantQueryFn(null);
});

describe("record.openAssistant", () => {
  test("with assistant.enabled=false opens configure-assistant overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db, configBase({ enabled: false }));
    await dispatch(defaultRegistry(), "review", app, "record.openAssistant");
    expect(app.overlay?.kind).toBe("configure-assistant");
  });

  test("with assistant.enabled=false and no assistant config opens configure overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db, configBase(undefined));
    await dispatch(defaultRegistry(), "review", app, "record.openAssistant");
    expect(app.overlay?.kind).toBe("configure-assistant");
  });

  test("with enabled config fires queryAssistant and settles to done on success", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(
      store.db,
      configBase({
        enabled: true,
        provider: "ollama",
        model: "llama3",
        privacyAcknowledged: true,
      }),
    );
    __setAssistantQueryFn(async ({ onToken }) => {
      onToken?.("thinking");
      return { response: validResponse, wasCached: false };
    });
    await dispatch(defaultRegistry(), "review", app, "record.openAssistant");
    // Let microtasks drain so the .then() handler runs.
    await new Promise((r) => setTimeout(r, 5));
    expect(app.overlay?.kind).toBe("assistant");
    if (app.overlay?.kind === "assistant" && app.overlay.state.status === "done") {
      expect(app.overlay.state.suggestion).toBe("food");
    } else {
      throw new Error("expected assistant overlay in done state");
    }
  });

  test("queryAssistant rejection settles overlay to error", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(
      store.db,
      configBase({
        enabled: true,
        provider: "ollama",
        model: "llama3",
        privacyAcknowledged: true,
      }),
    );
    __setAssistantQueryFn(async () => {
      throw new Error("network down");
    });
    await dispatch(defaultRegistry(), "review", app, "record.openAssistant");
    await new Promise((r) => setTimeout(r, 5));
    if (app.overlay?.kind === "assistant" && app.overlay.state.status === "error") {
      expect(app.overlay.state.errorMessage).toContain("network down");
    } else {
      throw new Error("expected assistant overlay in error state");
    }
  });

  test("missing model in config settles overlay to error before query", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(
      store.db,
      configBase({
        enabled: true,
        provider: "anthropic",
        // model omitted
        privacyAcknowledged: true,
      }),
    );
    await dispatch(defaultRegistry(), "review", app, "record.openAssistant");
    if (app.overlay?.kind === "assistant" && app.overlay.state.status === "error") {
      expect(app.overlay.state.errorMessage).toContain("model");
    } else {
      throw new Error("expected assistant overlay in error state");
    }
  });
});
