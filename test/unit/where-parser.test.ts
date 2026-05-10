import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { WhereParseError } from "../../src/store/where-parser.ts";
import { openTmpStore } from "../util/tmp.ts";

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("where: parser", () => {
  test("single string-equality predicate matches the equivalent factory", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const a = queueRecords(store.db, resolveQueue("by-source:llm:gpt-4").query);
    const b = queueRecords(store.db, resolveQueue("where:source = 'llm:gpt-4'").query);
    expect(ids(b)).toEqual(ids(a));
    expect(b.length).toBeGreaterThan(0);
  });

  test("numeric comparison: confidence < 0.5", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, resolveQueue("where:confidence < 0.5").query);
    for (const r of rows) {
      const c = r.primaryPrediction?.confidence ?? null;
      expect(c).not.toBeNull();
      expect(c!).toBeLessThan(0.5);
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  test("AND combines predicates", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(
      store.db,
      resolveQueue("where:source = 'llm:gpt-4' and confidence < 0.5").query,
    );
    for (const r of rows) {
      expect(r.primaryPrediction?.source).toBe("llm:gpt-4");
      expect((r.primaryPrediction?.confidence ?? Infinity) < 0.5).toBe(true);
    }
  });

  test("OR + parens", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(
      store.db,
      resolveQueue("where:(source = 'regex.simple' or source = 'rule.entry_boundary')").query,
    );
    for (const r of rows) {
      expect(["regex.simple", "rule.entry_boundary"]).toContain(r.primaryPrediction?.source ?? "");
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  test("IN list", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const rows = queueRecords(
      store.db,
      resolveQueue("where:final_label in ('food', 'travel')").query,
    );
    expect(rows.find((r) => r.id === id)).toBeDefined();
  });

  test("issue_type compiles to EXISTS subquery", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const empty = queueRecords(
      store.db,
      resolveQueue("where:issue_type = 'source_disagreement'").query,
    );
    expect(empty.length).toBe(0);
    const matched = queueRecords(store.db, resolveQueue("where:issue_type = 'label_issue'").query);
    expect(matched.length).toBe(1);
    expect(matched[0]?.text).toBe("Senior Engineer at Acme");
  });

  test("issue_type IN (...)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const matched = queueRecords(
      store.db,
      resolveQueue("where:issue_type in ('label_issue', 'outlier')").query,
    );
    expect(matched.length).toBe(1);
  });

  test("column-vs-column comparison: final_label != prev_label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    const rows = queueRecords(
      store.db,
      resolveQueue("where:final_label != prev_label and prev_label = 'food'").query,
    );
    expect(rows.map((r) => r.id)).toEqual([id]);
  });

  test("rejects issue_type on the rhs of a column-vs-column comparison", () => {
    expect(() => resolveQueue("where:status = issue_type")).toThrow(WhereParseError);
  });

  test("rejects unknown column", () => {
    expect(() => resolveQueue("where:foo = 'bar'")).toThrow(WhereParseError);
    expect(() => resolveQueue("where:foo = 'bar'")).toThrow(/unknown column foo/);
  });

  test("rejects unknown operator (e.g. like)", () => {
    expect(() => resolveQueue("where:source like 'foo'")).toThrow(WhereParseError);
    expect(() => resolveQueue("where:source like 'foo'")).toThrow(/unknown operator like/);
  });

  test("rejects empty expression", () => {
    expect(() => resolveQueue("where:")).toThrow(WhereParseError);
  });

  test("status = 'pending' matches untouched records", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const all = queueRecords(store.db, resolveQueue("where:status = 'pending'").query);
    expect(all.length).toBe(10);
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const after = queueRecords(store.db, resolveQueue("where:status = 'pending'").query);
    expect(after.find((r) => r.id === id)).toBeUndefined();
    expect(after.length).toBe(9);
  });

  test("status != 'skipped' keeps pending records (NULL coerced)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    const rows = queueRecords(store.db, resolveQueue("where:status != 'skipped'").query);
    expect(rows.length).toBe(9);
    expect(rows.find((r) => r.id === id)).toBeUndefined();
  });
});
