import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../../src/ingest/ingest.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { currentReview } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const CONFIGURED = ["spam", "toxicity", "promotion"];

const multiLabelConfig: LabellensConfig = {
  task: "multi-label",
  labels: CONFIGURED,
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

async function makeStore(): Promise<{ db: Db; dispose: () => void }> {
  const dir = tmpdir({ prefix: "labellens-multi-label-" });
  const dbPath = join(dir.path, "state.db");
  const db = openDb(dbPath);
  const jsonl = join(dir.path, "in.jsonl");
  writeFileSync(
    jsonl,
    `${[
      {
        text: "buy cheap stuff",
        predictions: [{ label: ["spam", "toxicity"], confidence: 0.9, source: "modelA" }],
      },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
    "utf8",
  );
  await ingestFile(db, jsonl, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(multiLabelConfig));
  return {
    db,
    dispose: () => {
      db.$client.close();
      dir[Symbol.dispose]();
    },
  };
}

function makeApp(db: Db): AppContext {
  const app = createAppContext({
    db,
    config: multiLabelConfig,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(app, "pending");
  return app;
}

test("multi-label record.accept writes final_label = canonical JSON of primary set", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const before = app.cursor!.current()!;
    const id = before.id;
    expect(before.primaryPrediction?.label).toBe('["spam","toxicity"]');

    const result = await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(result.kind).toBe("ok");

    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe('["spam","toxicity"]');
    expect(cur?.prev_label).toBeNull();
  } finally {
    store.dispose();
  }
});

test("multi-label record.reject writes prev_label = encoded primary set", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.reject");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("rejected");
    expect(cur?.final_label).toBeNull();
    expect(cur?.prev_label).toBe('["spam","toxicity"]');
  } finally {
    store.dispose();
  }
});

test("multi-label skip + undo restores no-review state", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(currentReview(store.db, id)?.final_label).toBe('["spam","toxicity"]');
    await dispatch(defaultRegistry(), "review", app, "record.undo");
    expect(currentReview(store.db, id)).toBeNull();
  } finally {
    store.dispose();
  }
});

test("multi-label task disables relabelByIndex.* commands (no direct single-label commit)", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    const result = await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.1");
    // Either disabled (no-op) or refused — but must NOT write a single-string Review.
    const cur = currentReview(store.db, id);
    expect(cur).toBeNull();
    expect(["ok", "no-such-command", "disabled"]).toContain(result.kind);
  } finally {
    store.dispose();
  }
});
