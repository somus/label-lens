import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { __setAssistantQueryFn } from "../../src/actions/record/open-assistant.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { currentReview } from "../../src/store/queries.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const validResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "Cafe + lunch tokens line up with the food label.",
  evidenceFor: ["mentions lunch", "cafe context"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

afterEach(() => {
  __setAssistantQueryFn(null);
});

function config(assistant?: LabellensConfig["assistant"]): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
    assistant,
  };
}

async function mount(
  store: Awaited<ReturnType<typeof openTmpStore>>,
  assistant?: LabellensConfig["assistant"],
) {
  const { renderer, renderOnce, captureCharFrame, mockInput } = await createTestRenderer({
    width: 120,
    height: 24,
  });
  const app = createAppContext({
    db: store.db,
    config: config(assistant),
    display: displayFor({ color: "truecolor" }),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, renderOnce, captureCharFrame, mockInput };
}

describe("assistant flow e2e", () => {
  test("`i` with enabled=false opens configure overlay (provider step)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, { enabled: false });
    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("Configure Assistant");
    expect(frame).toContain("Anthropic");
    expect(frame).toContain("Ollama");
  });

  test("full configure flow persists to in-memory config + opens assistant on next `i`", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, { enabled: false });
    __setAssistantQueryFn(async () => ({ response: validResponse, wasCached: false }));

    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    // Pick Ollama (5th option) — skips privacy step.
    ctx.mockInput.pressKey("5");
    await ctx.renderOnce();
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    // Auth step: type a URL.
    for (const ch of "u") ctx.mockInput.pressKey(ch);
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    expect(ctx.app.config.assistant?.enabled).toBe(true);
    expect(ctx.app.config.assistant?.provider).toBe("ollama");
    expect(ctx.app.overlay).toBeNull();

    // Press `i` again — should open assistant overlay + fire query.
    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    await new Promise((r) => setTimeout(r, 5));
    await ctx.renderOnce();

    expect(ctx.app.overlay?.kind).toBe("assistant");
    if (ctx.app.overlay?.kind === "assistant") {
      expect(ctx.app.overlay.state.status).toBe("done");
      expect(ctx.app.overlay.state.suggestion).toBe("food");
    }
  });

  test("Tab expands reasoning above the summary line", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, {
      enabled: true,
      provider: "ollama",
      model: "llama3",
      privacyAcknowledged: true,
    });
    __setAssistantQueryFn(async () => ({ response: validResponse, wasCached: false }));

    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    await new Promise((r) => setTimeout(r, 5));
    await ctx.renderOnce();

    ctx.mockInput.pressTab();
    await ctx.renderOnce();
    if (ctx.app.overlay?.kind === "assistant") {
      expect(ctx.app.overlay.state.reasoningExpanded).toBe(true);
      expect(ctx.app.overlay.state.reason).toContain("Cafe + lunch");
    } else {
      throw new Error("expected assistant overlay");
    }
  });

  test("Enter commits the recommended action with source_of_truth='human+assistant'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, {
      enabled: true,
      provider: "ollama",
      model: "llama3",
      privacyAcknowledged: true,
    });
    __setAssistantQueryFn(async () => ({ response: validResponse, wasCached: false }));
    const id = ctx.app.cursor!.current()!.id;

    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    await new Promise((r) => setTimeout(r, 5));
    await ctx.renderOnce();
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
    expect(cur?.source_of_truth).toBe("human+assistant");
  });

  test("empty reasoning suppresses [tab] hint in collapsed strip", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, {
      enabled: true,
      provider: "ollama",
      model: "llama3",
      privacyAcknowledged: true,
    });
    __setAssistantQueryFn(async () => ({
      response: { ...validResponse, reasoning: "" },
      wasCached: false,
    }));

    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    await new Promise((r) => setTimeout(r, 5));
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    // Suggestion summary still rendered.
    expect(frame).toContain("accept");
    expect(frame).toContain("food");
    // Tab hint hidden because there's no reasoning to expand. (Enter / Esc
    // hints remain so the reviewer can still commit / dismiss.)
    expect(frame).not.toContain("[tab] reasoning");
  });

  test("Esc dismisses but next `record.accept` still tagged human+assistant (ADR 0004)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, {
      enabled: true,
      provider: "ollama",
      model: "llama3",
      privacyAcknowledged: true,
    });
    __setAssistantQueryFn(async () => ({ response: validResponse, wasCached: false }));
    const id = ctx.app.cursor!.current()!.id;

    ctx.mockInput.pressKey("i");
    await ctx.renderOnce();
    await new Promise((r) => setTimeout(r, 30));
    await ctx.renderOnce();
    ctx.mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await ctx.renderOnce();

    expect(ctx.app.overlay).toBeNull();
    ctx.mockInput.pressKey("a");
    await ctx.renderOnce();
    const cur = currentReview(store.db, id);
    expect(cur?.source_of_truth).toBe("human+assistant");
  });
});
