import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("review screen — smart-next status indicator", () => {
  test("shows '▸ smart' badge when navigation.smartNext=true and queue=pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "pending" });
    await renderOnce();
    expect(captureCharFrame()).toContain("▸ smart");
  });

  test("omits '▸ smart' badge when flag off", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "pending" });
    await renderOnce();
    expect(captureCharFrame()).not.toContain("▸ smart");
  });

  test("omits '▸ smart' badge when active queue is not pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "low-confidence" });
    await renderOnce();
    expect(captureCharFrame()).not.toContain("▸ smart");
  });
});
