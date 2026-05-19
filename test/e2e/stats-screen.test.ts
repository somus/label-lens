import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
    keys: { preset: "vim" },
  };
}

async function setup(
  store: TmpStore,
  size: { width: number; height: number } = { width: 100, height: 40 },
) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: size.width,
    height: size.height,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("t");
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

function seedCorrection(store: TmpStore): void {
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
}

function seedDecisionBuckets(store: TmpStore): void {
  const ids = store.db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`);
  insertReview(store.db, {
    record_id: ids[0]!.id,
    status: "accepted",
    final_label: "food",
    prev_label: "food",
    source_of_truth: "human",
  });
  insertReview(store.db, {
    record_id: ids[1]!.id,
    status: "relabeled",
    final_label: "travel",
    prev_label: "food",
    source_of_truth: "human",
  });
  insertReview(store.db, {
    record_id: ids[2]!.id,
    status: "rejected",
    final_label: null,
    prev_label: "shopping",
    source_of_truth: "human",
  });
  insertReview(store.db, {
    record_id: ids[3]!.id,
    status: "skipped",
    final_label: null,
    prev_label: null,
    source_of_truth: "human",
  });
}

describe("stats overlay e2e", () => {
  test("renders core sections + first-drillable highlight + footer", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedDecisionBuckets(store);
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(frame).toContain("Stats");
    expect(frame).toContain("Progress:");
    expect(frame).toContain("Total 10");
    expect(frame).toContain("Reviewed 3");
    expect(frame).toContain("Pending 6");
    expect(frame).toContain("Decisions:");
    expect(frame).toContain("Accepted 1");
    expect(frame).toContain("Relabeled 1");
    expect(frame).toContain("Rejected 1");
    expect(frame).toContain("Skipped 1");
    expect(frame).toContain("Top corrections");
    expect(frame).toContain("food → travel");
    expect(frame).toContain("Suggested next queue");
    expect(frame).toContain("[j/k] navigate");
    expect(frame).toMatch(/^.*>\s+/m);
    expect(frame).toMatchSnapshot();
  });

  test("can drill to by-correction by stepping to the corrections section", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { app, mockInput, renderOnce } = await setup(store);
    for (let i = 0; i < 40; i++) {
      const overlay = app.overlay;
      if (overlay?.kind !== "stats") throw new Error("expected stats overlay");
      const line = overlay.state.lines[overlay.state.highlight];
      if (line?.kind === "row" && line.drillTo === "by-correction:food:travel") break;
      mockInput.pressKey("j");
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
    expect(app.queueId).toBe("by-correction:food:travel");
  });

  test("escape and q close the overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const a = await setup(store);
    a.mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await a.renderOnce();
    expect(a.app.overlay).toBeNull();

    const b = await setup(store);
    b.mockInput.pressKey("q");
    await b.renderOnce();
    expect(b.app.overlay).toBeNull();
  });

  test("Enter on the initial highlight drills to a real queue id", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
    expect(app.queueId).not.toBe("pending");
  });

  test("j past the last drillable row clamps; k past the first clamps", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { app, mockInput, renderOnce } = await setup(store);
    if (app.overlay?.kind !== "stats") throw new Error("expected stats overlay");
    for (let i = 0; i < 60; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const tail = app.overlay.state.highlight;
    mockInput.pressKey("j");
    await renderOnce();
    expect(app.overlay.state.highlight).toBe(tail);

    for (let i = 0; i < 60; i++) {
      mockInput.pressKey("k");
      await renderOnce();
    }
    const head = app.overlay.state.highlight;
    mockInput.pressKey("k");
    await renderOnce();
    expect(app.overlay.state.highlight).toBe(head);
  });

  test("small terminals keep the highlighted stat row visible while scrolling", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrection(store);
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store, {
      width: 80,
      height: 16,
    });

    for (let i = 0; i < 8; i++) {
      mockInput.pressKey("j");
      await renderOnce();
      if (app.overlay?.kind !== "stats") throw new Error("expected stats overlay");
      const highlighted = app.overlay.state.lines[app.overlay.state.highlight];
      if (highlighted?.kind !== "row") throw new Error("expected highlighted row");
      const frame = captureCharFrame();
      expect(frame).toContain(highlighted.display.trim().split(/\s{2,}/)[0]!);
    }
  });
});
