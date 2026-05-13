import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { exportStatsMarkdown } from "../../src/export/stats.ts";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("exportStatsMarkdown", () => {
  test("renders the standard sections with dataset basename and ISO timestamp", async () => {
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
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });

    const md = exportStatsMarkdown(store.db, "/var/data/transactions.jsonl");

    expect(md).toContain("# LabelLens stats — transactions.jsonl");
    expect(md).toMatch(/Generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(md).toContain("## Progress");
    expect(md).toContain("**Reviewed**: 2 / 10");
    expect(md).toContain("**Skipped**: 1");
    expect(md).toContain("**Pending**: 7");
    expect(md).toContain("## By source");
    expect(md).toContain("| Source | Acceptance rate | Relabel rate | Records reviewed |");
    expect(md).toContain("llm:gpt-4");
    expect(md).toContain("## Top corrections");
    expect(md).toContain("| From | To | Count |");
    expect(md).toContain("| travel | rideshare | 1 |");
    expect(md).toContain("## Imported issues");
    expect(md).toContain("| label_issue | 1 |"); // from tiny.jsonl record #10
    expect(md).toContain("## Suggested next queue");
    expect(md).toMatch(/`[a-z-]+(:[a-z0-9:_-]+)?`/i);
  });

  test("renders cleanly with an empty database (no records reviewed)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const md = exportStatsMarkdown(store.db, "./reviewed.jsonl");
    expect(md).toContain("# LabelLens stats — reviewed.jsonl");
    expect(md).toContain("**Reviewed**: 0 / 10");
    expect(md).toContain("**Pending**: 10");
  });
});
