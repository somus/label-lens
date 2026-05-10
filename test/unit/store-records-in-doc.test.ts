import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { recordsInDoc } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS } from "../util/tmp.ts";

async function ingestRows(rows: Record<string, unknown>[]) {
  const dir = mkdtempSync(join(osTmpdir(), "ll-doc-"));
  const inputPath = join(dir, "data.jsonl");
  const dbPath = join(dir, "state.db");
  await Bun.write(inputPath, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);
  return db;
}

describe("recordsInDoc", () => {
  test("returns rows matching meta.document_id, ordered by row_index", async () => {
    const rows = [
      { text: "doc1-line0", meta: { document_id: "doc-1" } },
      { text: "doc2-line0", meta: { document_id: "doc-2" } },
      { text: "doc1-line1", meta: { document_id: "doc-1" } },
      { text: "doc2-line1", meta: { document_id: "doc-2" } },
      { text: "doc2-line2", meta: { document_id: "doc-2" } },
    ];
    const db = await ingestRows(rows);
    const doc2 = recordsInDoc(db, "doc-2");
    expect(doc2.map((r) => r.text)).toEqual(["doc2-line0", "doc2-line1", "doc2-line2"]);
  });

  test("falls back to meta.doc when meta.document_id absent", async () => {
    const rows = [
      { text: "a", meta: { doc: "doc-A" } },
      { text: "b", meta: { doc: "doc-B" } },
      { text: "c", meta: { doc: "doc-A" } },
    ];
    const db = await ingestRows(rows);
    const docA = recordsInDoc(db, "doc-A");
    expect(docA.map((r) => r.text)).toEqual(["a", "c"]);
  });

  test("returns empty array when document id has no rows", async () => {
    const rows = [{ text: "a", meta: { document_id: "doc-1" } }];
    const db = await ingestRows(rows);
    expect(recordsInDoc(db, "missing")).toEqual([]);
  });
});
