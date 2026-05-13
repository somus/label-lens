import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import {
  acceptanceBySource,
  correctionRateBySource,
  relabelBySource,
} from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

/**
 * tiny.jsonl primary sources (PRD §10.8 + ADR 0001 highest-confidence rule):
 *   ids 0-7 → llm:gpt-4
 *   id 8    → regex.simple
 *   id 9    → rule.entry_boundary
 *
 * Seed 4 effective reviews on llm:gpt-4 (2 accepted, 1 relabeled, 1 rejected)
 * plus a skipped that must NOT count toward rates, plus 1 accepted on
 * regex.simple. rule.entry_boundary has no reviewed records.
 */
function seedSourceMix(db: Db): void {
  const ids = recordIds(db);
  const ts = (s: typeof insertReview extends (...a: infer A) => unknown ? A[1] : never) => s;
  insertReview(db, {
    record_id: ids[0]!,
    status: "accepted",
    final_label: "food",
    prev_label: null,
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[1]!,
    status: "accepted",
    final_label: "travel",
    prev_label: null,
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[2]!,
    status: "relabeled",
    final_label: "travel",
    prev_label: "shopping",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[3]!,
    status: "rejected",
    final_label: null,
    prev_label: "utility",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[4]!,
    status: "skipped",
    final_label: null,
    prev_label: null,
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[8]!,
    status: "accepted",
    final_label: "food",
    prev_label: null,
    source_of_truth: "human",
  });
  void ts;
}

describe("acceptanceBySource", () => {
  test("rate = accepted / reviewed-excluding-skipped; sorted by rate ASC", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedSourceMix(store.db);

    expect(acceptanceBySource(store.db)).toEqual([
      {
        kind: "acceptance-by-source",
        source: "llm:gpt-4",
        rate: 0.5,
        reviewed: 4,
      },
      {
        kind: "acceptance-by-source",
        source: "regex.simple",
        rate: 1,
        reviewed: 1,
      },
    ]);
  });

  test("source with zero reviews is omitted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(acceptanceBySource(store.db)).toEqual([]);
  });
});

describe("relabelBySource", () => {
  test("rate = relabeled / reviewed; sorted DESC (weakest first)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedSourceMix(store.db);

    expect(relabelBySource(store.db)).toEqual([
      {
        kind: "relabel-by-source",
        source: "llm:gpt-4",
        rate: 0.25,
        reviewed: 4,
      },
      {
        kind: "relabel-by-source",
        source: "regex.simple",
        rate: 0,
        reviewed: 1,
      },
    ]);
  });
});

describe("correctionRateBySource (weakest source headline)", () => {
  test("sort by relabel rate DESC; first row is the weakest", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedSourceMix(store.db);

    const rows = correctionRateBySource(store.db);
    expect(rows[0]).toEqual({
      kind: "correction-rate-by-source",
      source: "llm:gpt-4",
      rate: 0.25,
      reviewed: 4,
    });
    expect(rows).toHaveLength(2);
  });
});
