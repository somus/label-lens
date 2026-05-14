import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 36,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display: displayFor({ color: "truecolor", motion: true }),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("motion feedback", () => {
  test("palette open starts fade-in motion while preserving palette content", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);

    mockInput.pressKey(":");
    await renderOnce();

    expect(app.motion.snapshot("palette.open")).toMatchObject({ active: true, kind: "fadeIn" });
    const frame = captureCharFrame();
    expect(frame).toContain("Filters");
    expect(frame).toContain("[enter] run");
  });

  test("accept starts footer feedback and keeps the review screen readable", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);

    mockInput.pressKey("a");
    await renderOnce();

    expect(app.motion.snapshot("footer.accept")).toMatchObject({
      active: true,
      kind: "flash",
      tone: "success",
    });
    const frame = captureCharFrame();
    expect(frame).toContain("[a] accept");
    expect(frame).toContain("Reviewed:");
  });

  test("last pending decision flashes queue complete", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const keep = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
    )[0]!.id;
    store.db.run(sql`DELETE FROM records WHERE id != ${keep}`);
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);

    mockInput.pressKey("a");
    await renderOnce();

    expect(captureCharFrame()).toContain("queue complete");
  });

  test("mono display disables motion but keeps feedback text readable", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 36,
    });
    const app = createAppContext({
      db: store.db,
      config,
      display: displayFor({ color: "mono", motion: false }),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app });
    await renderOnce();

    mockInput.pressKey("a");
    await renderOnce();

    expect(app.motion.snapshot("footer.accept").active).toBe(false);
    expect(captureCharFrame()).toContain("[a] accept");
  });
});
