import { describe, expect, test } from "bun:test";
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { relabelByKeyCommand } from "../../src/actions/record/decisions.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { currentReview } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: [{ name: "food", key: "f" }, { name: "travel", key: "t" }, "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function makeApp(db: Db): AppContext {
  const app = createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(app, "pending");
  return app;
}

describe("relabelByKeyCommand factory", () => {
  test("returns null for string-form label entry", () => {
    expect(relabelByKeyCommand("food")).toBeNull();
  });

  test("returns null for object entry without key", () => {
    expect(relabelByKeyCommand({ name: "food" })).toBeNull();
  });

  test("builds command with stable name + key binding", () => {
    const cmd = relabelByKeyCommand({ name: "food", key: "f" });
    expect(cmd).not.toBeNull();
    expect(cmd!.name).toBe("record.relabelByKey.food");
    expect(cmd!.binding).toBe("f");
    expect(cmd!.scope).toBe("review");
  });
});

describe("relabelByKeyCommand dispatch", () => {
  test("matches predicted label → status='accepted'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    const cmd = relabelByKeyCommand({ name: "food", key: "f" })!;
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", app, cmd.name);
    expect(result.kind).toBe("ok");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });

  test("non-predicted label → status='relabeled' with prev_label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    const cmd = relabelByKeyCommand({ name: "travel", key: "t" })!;
    const registry = buildRegistry([cmd]);
    await dispatch(registry, "review", app, cmd.name);
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
    expect(cur?.prev_label).toBe("food");
  });
});
