import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountStatsScreen } from "../../src/screens/stats.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  let drilled: string | null = null;
  let cancelled = false;
  const handle = mountStatsScreen({
    renderer,
    app,
    onDrill: (id) => {
      drilled = id;
    },
    onCancel: () => {
      cancelled = true;
    },
  });
  await renderOnce();
  return {
    app,
    mockInput,
    renderOnce,
    captureCharFrame,
    drilled: () => drilled,
    cancelled: () => cancelled,
    destroy: handle.destroy,
  };
}

function seedCorrection(store: TmpStore): string {
  const id = store.db.all<{ id: string }>(
    sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
  )[0]!.id;
  insertReview(store.db, {
    record_id: id,
    status: "relabeled",
    final_label: "travel",
    prev_label: "food",
    source_of_truth: "human",
  });
  return id;
}

describe("stats screen e2e", () => {
  test("renders core sections + first-drillable highlight + footer", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(frame).toContain("Stats");
    expect(frame).toContain("Progress");
    expect(frame).toContain("Reviewed");
    expect(frame).toContain("Top corrections");
    expect(frame).toContain("food → travel");
    expect(frame).toContain("Suggested next queue");
    expect(frame).toContain("j / k navigate");
    // Highlight marker (>) must appear on at least one drillable row.
    expect(frame).toMatch(/^.*>\s+/m);
    expect(frame).toMatchSnapshot();
  });

  test("can drill to by-correction by stepping to the corrections section", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { mockInput, renderOnce, drilled, captureCharFrame } = await setup(store);
    // Walk j until the highlight marker sits on `food → travel`, then RETURN.
    for (let i = 0; i < 40; i++) {
      const frame = captureCharFrame();
      const hitLine = frame
        .split("\n")
        .find((ln) => ln.includes(">") && ln.includes("food → travel"));
      if (hitLine) break;
      mockInput.pressKey("j");
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(drilled()).toBe("by-correction:food:travel");
  });

  test("escape calls onCancel; q calls onCancel", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const a = await setup(store);
    a.mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await a.renderOnce();
    expect(a.cancelled()).toBe(true);
    a.destroy();

    const b = await setup(store);
    b.mockInput.pressKey("q");
    await b.renderOnce();
    expect(b.cancelled()).toBe(true);
    b.destroy();
  });

  test("Enter on the initial highlight drills to a real queue id (no crash on first-line)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, drilled } = await setup(store);
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(drilled()).toBeTruthy();
  });

  test("j past the last drillable row clamps; k past the first clamps", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    // Bash j 60 times; should park at the last drillable row.
    for (let i = 0; i < 60; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const tail = captureCharFrame();
    expect(tail).toContain(">");
    // Bash k 60 times; should park at the first drillable row.
    for (let i = 0; i < 60; i++) {
      mockInput.pressKey("k");
      await renderOnce();
    }
    const head = captureCharFrame();
    expect(head).toContain(">");
  });

  test("mount sets activeScope to 'stats'; destroy restores prior scope", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, destroy } = await setup(store);
    expect(app.activeScope).toBe("stats");
    destroy();
    expect(app.activeScope).toBeUndefined();
  });
});
