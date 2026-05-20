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

const cfg: LabellensConfig = {
  task: "multi-label",
  labels: CONFIGURED,
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

async function makeStore(): Promise<{ db: Db; dispose: () => void }> {
  const dir = tmpdir({ prefix: "labellens-draft-" });
  const db = openDb(join(dir.path, "state.db"));
  const jsonl = join(dir.path, "in.jsonl");
  writeFileSync(
    jsonl,
    `${[
      { text: "a", predictions: [{ label: ["spam", "toxicity"], confidence: 0.9, source: "m" }] },
      { text: "b", predictions: [{ label: ["promotion"], confidence: 0.8, source: "m" }] },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
    "utf8",
  );
  await ingestFile(db, jsonl, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(cfg));
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
    config: cfg,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(app, "pending");
  return app;
}

test("AppContext.multiLabelDraft starts null and is null after a fresh enter", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    expect(app.multiLabelDraft).toBeNull();
  } finally {
    store.dispose();
  }
});

test("clearMultiLabelDraft empties the draft", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    app.multiLabelDraft = { recordId: "rec-1", selected: new Set(["spam"]) };
    app.clearMultiLabelDraft();
    expect(app.multiLabelDraft).toBeNull();
  } finally {
    store.dispose();
  }
});

test("digit toggleByIndex seeds draft from primary then toggles label in/out", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    // First press: seed from primary {spam, toxicity} then toggle [3]=promotion in.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.3");
    expect(app.multiLabelDraft?.recordId).toBe(id);
    expect([...app.multiLabelDraft!.selected].sort()).toEqual(
      ["promotion", "spam", "toxicity"].sort(),
    );
    // Second press on [3] removes promotion.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.3");
    expect([...app.multiLabelDraft!.selected].sort()).toEqual(["spam", "toxicity"]);
    // Press [1] removes spam.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.1");
    expect([...app.multiLabelDraft!.selected]).toEqual(["toxicity"]);
  } finally {
    store.dispose();
  }
});

test("toggleByIndex with out-of-range digit flashes and leaves draft untouched", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.9");
    expect(app.multiLabelDraft).toBeNull();
    expect(app.flash?.kind).toBe("error");
  } finally {
    store.dispose();
  }
});

test("commitDraft with set equal to primary commits status accepted", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    // Toggle [3]=promotion in then back out → draft equals primary again.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.3");
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.3");
    const result = await dispatch(defaultRegistry(), "review", app, "record.commitMultiLabelDraft");
    expect(result.kind).toBe("ok");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe('["spam","toxicity"]');
    expect(cur?.prev_label).toBeNull();
    expect(app.multiLabelDraft).toBeNull();
  } finally {
    store.dispose();
  }
});

test("commitDraft with set differing from primary commits status relabeled", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    // Drop toxicity, add promotion.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.2");
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.3");
    await dispatch(defaultRegistry(), "review", app, "record.commitMultiLabelDraft");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe('["spam","promotion"]');
    expect(cur?.prev_label).toBe('["spam","toxicity"]');
  } finally {
    store.dispose();
  }
});

test("commitDraft with empty selected set flashes error and leaves no review", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    // Remove both predicted labels.
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.1");
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.2");
    expect(app.multiLabelDraft?.selected.size).toBe(0);
    await dispatch(defaultRegistry(), "review", app, "record.commitMultiLabelDraft");
    expect(currentReview(store.db, id)).toBeNull();
    expect(app.flash?.kind).toBe("error");
  } finally {
    store.dispose();
  }
});

test("commitDraft is a no-op when no draft exists (and Enter on empty draft does nothing)", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.commitMultiLabelDraft");
    expect(currentReview(store.db, id)).toBeNull();
  } finally {
    store.dispose();
  }
});

test("record navigation clears the multi-label draft", async () => {
  const store = await makeStore();
  try {
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    app.multiLabelDraft = { recordId: id, selected: new Set(["spam"]) };
    await dispatch(defaultRegistry(), "review", app, "record.next");
    expect(app.multiLabelDraft).toBeNull();
    // sanity: no review committed by nav
    expect(currentReview(store.db, id)).toBeNull();
  } finally {
    store.dispose();
  }
});
