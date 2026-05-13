import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { applyDiff, diffIngest } from "../../src/ingest/reingest.ts";
import { openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

type Row = { text: string; prediction: string; confidence: number; source: string };

function jsonl(rows: Row[]): string {
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}

function makeRows(n: number, source: string, confBase: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      text: `Sample row ${i}`,
      prediction: i % 2 === 0 ? "food" : "travel",
      confidence: confBase + (i % 7) * 0.001,
      source,
    });
  }
  return rows;
}

describe("smart re-ingest acceptance", () => {
  test("500 reviews survive an LLM upgrade (predictions-only re-ingest)", async () => {
    using dir = tmpdir({ prefix: "labellens-acc-" });
    const dbPath = join(dir.path, "state.db");
    const db = openDb(dbPath);

    const v1Path = join(dir.path, "v1.jsonl");
    writeFileSync(v1Path, jsonl(makeRows(500, "llm:gpt-4", 0.8)));
    await ingestFile(db, v1Path, DEFAULT_FIELDS);

    const ids = db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`)
      .map((r) => r.id);
    for (const id of ids) {
      insertReview(db, {
        record_id: id,
        status: "accepted",
        final_label: "food",
        prev_label: null,
        source_of_truth: "human",
      });
    }

    // Same texts, different model + bumped confidence — every record falls
    // into the predictionsOnly bucket.
    const v2Path = join(dir.path, "v2.jsonl");
    writeFileSync(v2Path, jsonl(makeRows(500, "llm:gpt-5", 0.95)));
    const diff = await diffIngest(db, v2Path, DEFAULT_FIELDS);
    expect(diff.predictionsOnly).toHaveLength(500);
    expect(diff.orphans).toEqual([]);
    expect(diff.newRecords).toEqual([]);

    applyDiff(db, diff);

    // All 500 reviews intact.
    const reviewCount = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM effective_reviews`)[0]!
      .n;
    expect(reviewCount).toBe(500);

    // Predictions all switched to llm:gpt-5.
    const sources = db.all<{ source: string; n: number }>(
      sql`SELECT source, COUNT(*) AS n FROM predictions GROUP BY source`,
    );
    expect(sources).toEqual([{ source: "llm:gpt-5", n: 500 }]);

    db.$client.close();
  });

  test("text edit on 1 of 10 → 1 orphan + 1 new; pending queue holds 9 live, orphans queue holds 1", async () => {
    using dir = tmpdir({ prefix: "labellens-acc2-" });
    const dbPath = join(dir.path, "state.db");
    const db = openDb(dbPath);

    const v1: Row[] = makeRows(10, "llm:gpt-4", 0.8);
    const v1Path = join(dir.path, "v1.jsonl");
    writeFileSync(v1Path, jsonl(v1));
    await ingestFile(db, v1Path, DEFAULT_FIELDS);

    const v2 = v1.map((r, i) => (i === 0 ? { ...r, text: "Edited row 0" } : r));
    const v2Path = join(dir.path, "v2.jsonl");
    writeFileSync(v2Path, jsonl(v2));

    const diff = await diffIngest(db, v2Path, DEFAULT_FIELDS);
    expect(diff.orphans).toHaveLength(1);
    expect(diff.newRecords).toHaveLength(1);
    expect(diff.newRecords[0]!.text).toBe("Edited row 0");
    expect(diff.predictionsOnly).toEqual([]);

    applyDiff(db, diff);

    const { queueRecords } = await import("../../src/store/queries.ts");
    const { resolveQueue } = await import("../../src/store/queues/registry.ts");
    const pending = queueRecords(db, resolveQueue("pending").query);
    expect(pending).toHaveLength(10); // 9 unchanged + 1 new
    const orphans = queueRecords(db, resolveQueue("orphans").query);
    expect(orphans).toHaveLength(1);

    db.$client.close();
  });
});
