import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { openDb } from "../../src/store/db.ts";
import { DEFAULT_FIELDS } from "../util/tmp.ts";

function boundaryConfig(inputPath: string): LabellensConfig {
  return {
    task: "boundary",
    labels: ["NOISE"],
    boundary: { documentField: "document_id", contextLines: 3 },
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setupCtx(rows: Record<string, unknown>[], config: LabellensConfig) {
  const dir = mkdtempSync(join(osTmpdir(), "ll-showdoc-"));
  const inputPath = join(dir, "data.jsonl");
  const dbPath = join(dir, "state.db");
  await Bun.write(inputPath, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);
  const ctx = createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(ctx);
  return ctx;
}

describe("record.show-doc command", () => {
  test("dispatch opens doc view when documentField resolves", async () => {
    const ctx = await setupCtx(
      [
        { text: "doc-1 line A", meta: { document_id: "doc-1" } },
        { text: "doc-1 line B", meta: { document_id: "doc-1" } },
      ],
      boundaryConfig("/tmp/data.jsonl"),
    );
    const result = await dispatch(defaultRegistry(), "review", ctx, "record.show-doc");
    expect(result.kind).toBe("ok");
    expect(ctx.docView).not.toBeNull();
    expect(ctx.docView?.documentId).toBe("doc-1");
  });

  test("dispatch flashes disabled message when no document grouping", async () => {
    const ctx = await setupCtx([{ text: "no doc id here" }], boundaryConfig("/tmp/data.jsonl"));
    const result = await dispatch(defaultRegistry(), "review", ctx, "record.show-doc");
    expect(result.kind).toBe("disabled");
    expect(ctx.docView).toBeNull();
    expect(ctx.flash?.message).toContain("Doc-view unavailable");
  });

  test("dispatch flashes classification-task message when task is not boundary", async () => {
    const cfg: LabellensConfig = {
      task: "classification",
      labels: ["food"],
      input: { path: "/x", format: "jsonl", fields: DEFAULT_FIELDS },
      output: { path: "/y", format: "jsonl" },
    };
    const ctx = await setupCtx([{ text: "x", meta: { document_id: "doc-1" } }], cfg);
    const result = await dispatch(defaultRegistry(), "review", ctx, "record.show-doc");
    expect(result.kind).toBe("disabled");
    expect(ctx.flash?.message).toContain("boundary task");
  });
});
