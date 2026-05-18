import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { buildRegistry, type Command } from "../../src/actions/command.ts";
import { relabelByKeyCommand } from "../../src/actions/record/decisions.ts";
import { ALL_COMMANDS } from "../../src/actions/registry.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { currentReview } from "../../src/store/queries.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function configWithKeys(labelChip: "configured" | "both" = "configured"): LabellensConfig {
  return {
    task: "classification",
    labels: [
      { name: "food", key: "f" },
      "travel",
      { name: "utility", key: "y" },
      "shopping",
      "salary",
      "rent",
      "other",
      "ENTRY_START",
    ],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
    display: { labelChip },
  };
}

async function mount(
  store: Awaited<ReturnType<typeof openTmpStore>>,
  opts: { labelChip?: "configured" | "both" } = {},
) {
  const labelChip = opts.labelChip ?? "configured";
  const config = configWithKeys(labelChip);
  const { renderer, renderOnce, captureCharFrame, mockInput } = await createTestRenderer({
    width: 120,
    height: 24,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display: displayFor({ color: "truecolor", labelChip }),
    requestRender: () => {},
    onQuit: () => {},
  });
  const perLabelCommands = config.labels
    .map(relabelByKeyCommand)
    .filter((c): c is Command => c !== null);
  const registry = buildRegistry([...ALL_COMMANDS, ...perLabelCommands]);
  mountReviewScreen({ renderer, app, registry });
  await renderOnce();
  return { app, renderOnce, captureCharFrame, mockInput };
}

describe("per-label key", () => {
  test("pressing the configured key commits the relabel", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store);
    const id = ctx.app.cursor!.current()!.id;
    ctx.mockInput.pressKey("y");
    await ctx.renderOnce();
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("utility");
  });

  test("chip rail renders [k] when label has key, [N] otherwise (configured mode)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store);
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("[f]");
    expect(frame).toContain("food");
    expect(frame).toContain("[2]");
    expect(frame).toContain("travel");
  });

  test("chip rail renders [N/k] in both mode", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store, { labelChip: "both" });
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("[1/f]");
    expect(frame).toContain("[3/y]");
    expect(frame).toContain("[2]");
  });

  test("picker shows [k] chip for keyed candidate", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store);
    ctx.mockInput.pressKey("r");
    await ctx.renderOnce();
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("[f]");
    expect(frame).toContain("food");
  });

  test("picker commits when configured key pressed inside overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = await mount(store);
    const id = ctx.app.cursor!.current()!.id;
    ctx.mockInput.pressKey("r");
    await ctx.renderOnce();
    ctx.mockInput.pressKey("y");
    await ctx.renderOnce();
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("utility");
  });
});
