import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { exportJsonlString } from "../../src/export/jsonl.ts";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

function markOrphan(db: Db, id: string): void {
  db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${id}`);
}

function lines(out: string): string[] {
  return out.length === 0 ? [] : out.split("\n").filter((l) => l.length > 0);
}

describe("exportJsonlString — default", () => {
  test("round-trips arbitrary input fields into the meta object", async () => {
    using store = await openTmpStore({ ingest: "meta.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "travel",
      source_of_truth: "human",
    });

    const rows = lines(exportJsonlString(store.db)).map((l) => JSON.parse(l));
    expect(rows[0].meta).toEqual({ user_id: "u-7", category_hint: "restaurant" });
    expect(rows[1].meta).toEqual({ user_id: "u-7", tags: ["recurring", "essential"] });
  });

  test("omits meta when no extra input fields are present", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const row = JSON.parse(lines(exportJsonlString(store.db))[0]!);
    expect(row.meta).toBeUndefined();
    expect(Object.hasOwn(row, "meta")).toBe(false);
  });

  test("excludes skipped and rejected records by default", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "rejected",
      final_label: null,
      prev_label: "shopping",
      source_of_truth: "human",
    });

    const rows = lines(exportJsonlString(store.db)).map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids[0]);
  });

  test("includeRejected: emits rejected records with label:null, still excludes skipped", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "rejected",
      final_label: null,
      prev_label: "travel",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });

    const rows = lines(exportJsonlString(store.db, { includeRejected: true })).map((l) =>
      JSON.parse(l),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(ids[0]);
    expect(rows[0].label).toBe("food");
    expect(rows[1].id).toBe(ids[1]);
    expect(rows[1].label).toBeNull();
  });

  test("excludes orphan records by default; includeOrphans surfaces them", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "accepted",
      final_label: "travel",
      prev_label: null,
      source_of_truth: "human",
    });
    markOrphan(store.db, ids[1]!);

    const defaultRows = lines(exportJsonlString(store.db)).map((l) => JSON.parse(l));
    expect(defaultRows.map((r) => r.id)).toEqual([ids[0]]);

    const withOrphans = lines(exportJsonlString(store.db, { includeOrphans: true })).map((l) =>
      JSON.parse(l),
    );
    expect(withOrphans.map((r) => r.id).sort()).toEqual([ids[0], ids[1]].sort());
  });

  test("emits document_id as a top-level field for boundary records", async () => {
    using store = await openTmpStore({ ingest: "boundary.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "SECTION_HEADER",
      prev_label: null,
      source_of_truth: "human",
    });

    const row = JSON.parse(lines(exportJsonlString(store.db))[0]!);
    expect(row.document_id).toBe("doc-1");
  });

  test("omits document_id when the record has none", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const row = JSON.parse(lines(exportJsonlString(store.db))[0]!);
    expect(Object.hasOwn(row, "document_id")).toBe(false);
  });

  test("emits one line per accepted or relabeled record, in row order", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);

    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "relabeled",
      final_label: "rideshare",
      prev_label: "travel",
      source_of_truth: "human",
    });

    const out = exportJsonlString(store.db);
    const rows = lines(out).map((l) => JSON.parse(l) as Record<string, unknown>);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(ids[0]);
    expect(rows[0]!.text).toBe("Lunch at Zomato Bangalore");
    expect(rows[0]!.label).toBe("food");
    expect(typeof rows[0]!.reviewed_at).toBe("string");
    expect(rows[1]!.id).toBe(ids[1]);
    expect(rows[1]!.label).toBe("rideshare");
  });
});
