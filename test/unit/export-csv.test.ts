import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { exportCsvString, formatCsvLabel } from "../../src/export/csv.ts";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("exportCsvString", () => {
  test("emits an RFC 4180 header + one row per accepted/relabeled record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const csv = exportCsvString(store.db);
    const [header, ...rest] = csv.split("\r\n").filter((l) => l.length > 0);
    expect(header).toBe("id,text,label,reviewed_at");
    expect(rest).toHaveLength(1);
    const fields = rest[0]!.split(",");
    expect(fields[0]).toBe(ids[0]);
    expect(fields[1]).toBe("Lunch at Zomato Bangalore");
    expect(fields[2]).toBe("food");
    expect(fields[3]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("formatCsvLabel: joins multi-label arrays with ; (MVP separator)", () => {
    expect(formatCsvLabel("food")).toBe("food");
    expect(formatCsvLabel(null)).toBe("");
    expect(formatCsvLabel(["food", "travel"])).toBe("food;travel");
    expect(formatCsvLabel([])).toBe("");
  });

  test("includes a document_id column when any exported row has one", async () => {
    using store = await openTmpStore({ ingest: "boundary.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "SECTION_HEADER",
      prev_label: null,
      source_of_truth: "human",
    });
    const csv = exportCsvString(store.db);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("id,text,label,reviewed_at,document_id");
    expect(row!.endsWith(",resume-1")).toBe(true);
  });

  test("omits document_id column when every exported row's document_id is null", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const csv = exportCsvString(store.db);
    const header = csv.split("\r\n")[0];
    expect(header).toBe("id,text,label,reviewed_at");
  });

  test("escapes fields containing commas, quotes, and newlines per RFC 4180", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    // Patch a record's text to contain tricky characters
    store.db.run(sql`UPDATE records SET text = ${'hello, "world"\nnext'} WHERE id = ${ids[0]}`);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const csv = exportCsvString(store.db);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    // First field is id (no escaping); second field is text — must be quoted
    // with embedded `"` doubled. Easiest: just assert the text field appears
    // verbatim quoted.
    expect(csv).toContain('"hello, ""world""\nnext"');
    expect(lines).toHaveLength(2); // header + one data row (newline inside quoted field is OK)
  });
});
