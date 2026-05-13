import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { applyDiff } from "../../src/ingest/reingest.ts";
import { insertReview } from "../../src/store/records.ts";
import { predictions, records, recordTags, reviews } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("applyDiff", () => {
  test("predictionsOnly: predictions replaced, review survives", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
    )[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    applyDiff(store.db, {
      predictionsOnly: [
        {
          id,
          predictions: [
            {
              label: "food",
              confidence: 0.99,
              source: "llm:gpt-5",
              reason: null,
              raw: '{"label":"food","confidence":0.99,"source":"llm:gpt-5"}',
            },
          ],
        },
      ],
      orphans: [],
      newRecords: [],
    });

    const preds = store.db.select().from(predictions).where(eq(predictions.recordId, id)).all();
    expect(preds).toHaveLength(1);
    expect(preds[0]!.source).toBe("llm:gpt-5");
    expect(preds[0]!.confidence).toBe(0.99);

    const revs = store.db.select().from(reviews).where(eq(reviews.recordId, id)).all();
    expect(revs).toHaveLength(1);
    expect(revs[0]!.finalLabel).toBe("food");
  });

  test("orphans: flag flipped, predictions + reviews + tags intact", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
    )[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    store.db
      .insert(recordTags)
      .values({ recordId: id, tag: "marked", createdAt: new Date().toISOString() })
      .run();
    const predsBefore = store.db
      .select()
      .from(predictions)
      .where(eq(predictions.recordId, id))
      .all();

    applyDiff(store.db, { predictionsOnly: [], orphans: [id], newRecords: [] });

    const rec = store.db.select().from(records).where(eq(records.id, id)).all()[0]!;
    expect(rec.orphan).toBe(true);
    const predsAfter = store.db
      .select()
      .from(predictions)
      .where(eq(predictions.recordId, id))
      .all();
    expect(predsAfter.length).toBe(predsBefore.length);
    const revs = store.db.select().from(reviews).where(eq(reviews.recordId, id)).all();
    expect(revs).toHaveLength(1);
    const tags = store.db.select().from(recordTags).where(eq(recordTags.recordId, id)).all();
    expect(tags).toHaveLength(1);
  });

  test("newRecords: insert behaves like fresh ingest", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const before = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;

    applyDiff(store.db, {
      predictionsOnly: [],
      orphans: [],
      newRecords: [
        {
          id: "abc123",
          sourcePath: "/tmp/x.jsonl",
          rowIndex: 999,
          text: "New entry",
          contextBefore: null,
          contextAfter: null,
          raw: '{"text":"New entry","prediction":"food","source":"llm:gpt-4"}',
          predictions: [
            {
              label: "food",
              confidence: 0.5,
              source: "llm:gpt-4",
              reason: null,
              raw: '{"label":"food","confidence":0.5,"source":"llm:gpt-4"}',
            },
          ],
        },
      ],
    });

    const after = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;
    expect(after).toBe(before + 1);
    const inserted = store.db.select().from(records).where(eq(records.id, "abc123")).all()[0]!;
    expect(inserted.text).toBe("New entry");
    expect(inserted.orphan).toBe(false);
    const preds = store.db
      .select()
      .from(predictions)
      .where(eq(predictions.recordId, "abc123"))
      .all();
    expect(preds).toHaveLength(1);
  });
});
