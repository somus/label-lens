import { sql } from "drizzle-orm";
import { manPageTopics } from "../man/loader.ts";
import type { Db } from "./db.ts";
import { COMPUTED_SIGNAL_SOURCE } from "./issues.ts";
import { queueCount } from "./queues/queue-counts.ts";
import { BUILTIN_QUEUES } from "./queues/registry.ts";
import { recordsWithPrimary } from "./schema.ts";

export type PaletteData = {
  counts: Map<string, number>;
  sources: string[];
  labels: string[];
  reasons: string[];
  issueTypes: string[];
  corrections: Array<{ from: string; to: string }>;
  sourceCounts: Map<string, number>;
  labelCounts: Map<string, number>;
  topics: string[];
  formats: string[];
  queueNames: string[];
};

export function fetchPaletteData(db: Db, labels: string[]): PaletteData {
  const counts = new Map<string, number>();
  for (const [id, def] of Object.entries(BUILTIN_QUEUES)) {
    const n = queueCount(db, def);
    counts.set(`:${id}`, n);
    counts.set(id, n);
  }

  const sources = db
    .all<{ source: string }>(
      sql`SELECT DISTINCT primary_source AS source FROM ${recordsWithPrimary} WHERE primary_source IS NOT NULL ORDER BY source`,
    )
    .map((r) => r.source);

  const reasons = db
    .all<{ reason: string }>(
      sql`SELECT DISTINCT primary_reason AS reason FROM ${recordsWithPrimary} WHERE primary_reason IS NOT NULL ORDER BY reason`,
    )
    .map((r) => r.reason);

  const issueTypes = db
    .all<{ type: string }>(
      sql`SELECT DISTINCT type FROM issues WHERE source IS NULL OR source != ${COMPUTED_SIGNAL_SOURCE} ORDER BY type`,
    )
    .map((r) => r.type);

  const corrections = db.all<{ from: string; to: string }>(
    sql`SELECT DISTINCT prev_label AS "from", final_label AS "to" FROM effective_reviews WHERE status = 'relabeled' AND prev_label IS NOT NULL AND final_label IS NOT NULL ORDER BY prev_label, final_label`,
  );

  const sourceCounts = new Map<string, number>();
  for (const row of db.all<{ source: string; n: number }>(
    sql`SELECT primary_source AS source, COUNT(*) AS n FROM ${recordsWithPrimary} WHERE primary_source IS NOT NULL GROUP BY primary_source`,
  )) {
    sourceCounts.set(row.source, row.n);
  }

  const labelCounts = new Map<string, number>();
  for (const row of db.all<{ label: string; n: number }>(
    sql`SELECT primary_label AS label, COUNT(*) AS n FROM ${recordsWithPrimary} WHERE primary_label IS NOT NULL GROUP BY primary_label`,
  )) {
    labelCounts.set(row.label, row.n);
  }

  return {
    counts,
    sources,
    labels: labels.slice().sort(),
    reasons,
    issueTypes,
    corrections,
    sourceCounts,
    labelCounts,
    topics: manPageTopics(),
    formats: ["jsonl", "csv", "stats"],
    queueNames: Object.keys(BUILTIN_QUEUES),
  };
}
