import { describe, expect, test } from "bun:test";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("enterReview — smart-next cursor swap", () => {
  test("uses smart-pending cursor when navigation.smartNext=true and queue=pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");
    expect(app.cursor?.queueId).toBe("smart-pending");
    // queueId stays as "pending" so the screen shows "Pending" + "▸ smart" badge.
    expect(app.queueId).toBe("pending");
  });

  test("uses plain pending cursor when smartNext flag is off", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");
    expect(app.cursor?.queueId).toBe("pending");
  });

  test("does not swap for non-pending queues even with flag on", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { smartNext: true } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "low-confidence");
    expect(app.cursor?.queueId).toBe("low-confidence");
  });
});
