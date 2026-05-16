import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function displayFor(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return {
    color,
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
    motion: false,
    sidebar: "auto",
    richGradient: false,
  };
}

async function setup(store: TmpStore, opts: { width?: number; display?: ResolvedDisplay } = {}) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: opts.width ?? 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display: opts.display ?? defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("Q", { shift: true });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("queue overlay — live preview", () => {
  test("renders first-record preview for highlighted queue (pending)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, captureCharFrame } = await setup(store, { display: displayFor("truecolor") });
    expect(app.overlay?.kind).toBe("queue");
    expect(captureCharFrame()).toContain("Lunch at Zomato Bangalore");
  });

  test("preview updates as highlight moves to low-confidence", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, {
      display: displayFor("truecolor"),
    });
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    expect(captureCharFrame()).toContain("ATM withdrawal");
  });

  test("empty queue preview shows '(no records)' placeholder", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, {
      display: displayFor("truecolor"),
    });
    mockInput.pressKey("j");
    await renderOnce();
    expect(captureCharFrame()).toContain("(no records)");
  });
});
