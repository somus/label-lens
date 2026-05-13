import { sql } from "drizzle-orm";
import type { TxOrDb } from "./db.ts";
import { COMPUTED_SIGNAL_SOURCE } from "./issues.ts";
import { progressCounts } from "./queries.ts";
import { BUILTIN_QUEUES, type QueueDefinition, type QueueId } from "./queues/registry.ts";
import { recordsWithPrimary } from "./schema.ts";

export type StatRow =
  | { kind: "progress"; bucket: "total" | "reviewed" | "pending" | "skipped"; count: number }
  | { kind: "decision"; status: "accepted" | "relabeled" | "rejected" | "skipped"; count: number }
  | { kind: "acceptance-by-source"; source: string; rate: number; reviewed: number }
  | { kind: "relabel-by-source"; source: string; rate: number; reviewed: number }
  | { kind: "correction-rate-by-source"; source: string; rate: number; reviewed: number }
  | { kind: "relabel-by-reason"; reason: string; rate: number; reviewed: number }
  | { kind: "top-correction"; from: string; to: string; count: number }
  | { kind: "correction-rate-by-label"; prevLabel: string; rate: number; reviewed: number }
  | { kind: "imported-issue"; issueType: string; count: number }
  | { kind: "suggested-next"; queueId: QueueId; score: number }
  | { kind: "all-caught-up" };

type SourceCounts = { accepted: number; relabeled: number; rejected: number; reviewed: number };

function bySourceCounts(db: TxOrDb): Map<string, SourceCounts> {
  const rows = db.all<{ source: string | null; status: string | null; n: number }>(sql`
    SELECT primary_source AS source, latest_status AS status, COUNT(*) AS n
    FROM (
      SELECT
        rwp.primary_source,
        (
          SELECT er.status FROM effective_reviews er
          WHERE er.record_id = rwp.id
          ORDER BY er.id DESC LIMIT 1
        ) AS latest_status
      FROM records_with_primary rwp
    )
    GROUP BY primary_source, latest_status
  `);
  const out = new Map<string, SourceCounts>();
  for (const r of rows) {
    if (r.source == null) continue;
    const cur = out.get(r.source) ?? { accepted: 0, relabeled: 0, rejected: 0, reviewed: 0 };
    if (r.status === "accepted") {
      cur.accepted += r.n;
      cur.reviewed += r.n;
    } else if (r.status === "relabeled") {
      cur.relabeled += r.n;
      cur.reviewed += r.n;
    } else if (r.status === "rejected") {
      cur.rejected += r.n;
      cur.reviewed += r.n;
    }
    out.set(r.source, cur);
  }
  return out;
}

export function aggregateProgressRows(db: TxOrDb): StatRow[] {
  const c = progressCounts(db);
  return [
    { kind: "progress", bucket: "total", count: c.total },
    { kind: "progress", bucket: "reviewed", count: c.accepted + c.relabeled + c.rejected },
    { kind: "progress", bucket: "pending", count: c.pending },
    { kind: "progress", bucket: "skipped", count: c.skipped },
  ];
}

export function aggregateDecisionRows(db: TxOrDb): StatRow[] {
  const c = progressCounts(db);
  return [
    { kind: "decision", status: "accepted", count: c.accepted },
    { kind: "decision", status: "relabeled", count: c.relabeled },
    { kind: "decision", status: "rejected", count: c.rejected },
    { kind: "decision", status: "skipped", count: c.skipped },
  ];
}

export function acceptanceBySource(db: TxOrDb): StatRow[] {
  const counts = bySourceCounts(db);
  const rows: StatRow[] = [];
  for (const [source, c] of counts) {
    if (c.reviewed === 0) continue;
    rows.push({
      kind: "acceptance-by-source",
      source,
      rate: c.accepted / c.reviewed,
      reviewed: c.reviewed,
    });
  }
  rows.sort((a, b) => {
    if (a.kind !== "acceptance-by-source" || b.kind !== "acceptance-by-source") return 0;
    if (a.rate !== b.rate) return a.rate - b.rate;
    return a.source.localeCompare(b.source);
  });
  return rows;
}

export function relabelBySource(db: TxOrDb): StatRow[] {
  const counts = bySourceCounts(db);
  const rows: StatRow[] = [];
  for (const [source, c] of counts) {
    if (c.reviewed === 0) continue;
    rows.push({
      kind: "relabel-by-source",
      source,
      rate: c.relabeled / c.reviewed,
      reviewed: c.reviewed,
    });
  }
  rows.sort((a, b) => {
    if (a.kind !== "relabel-by-source" || b.kind !== "relabel-by-source") return 0;
    if (a.rate !== b.rate) return b.rate - a.rate;
    return a.source.localeCompare(b.source);
  });
  return rows;
}

export function relabelByReason(db: TxOrDb): StatRow[] {
  const rows = db.all<{ reason: string | null; status: string | null; n: number }>(sql`
    SELECT primary_reason AS reason, latest_status AS status, COUNT(*) AS n
    FROM (
      SELECT
        rwp.primary_reason,
        (
          SELECT er.status FROM effective_reviews er
          WHERE er.record_id = rwp.id
          ORDER BY er.id DESC LIMIT 1
        ) AS latest_status
      FROM records_with_primary rwp
    )
    GROUP BY primary_reason, latest_status
  `);
  const counts = new Map<string, { relabeled: number; reviewed: number }>();
  for (const r of rows) {
    if (r.reason == null) continue;
    if (r.status !== "accepted" && r.status !== "relabeled" && r.status !== "rejected") continue;
    const cur = counts.get(r.reason) ?? { relabeled: 0, reviewed: 0 };
    if (r.status === "relabeled") cur.relabeled += r.n;
    cur.reviewed += r.n;
    counts.set(r.reason, cur);
  }
  const out: StatRow[] = [];
  for (const [reason, c] of counts) {
    if (c.reviewed === 0) continue;
    out.push({
      kind: "relabel-by-reason",
      reason,
      rate: c.relabeled / c.reviewed,
      reviewed: c.reviewed,
    });
  }
  out.sort((a, b) => {
    if (a.kind !== "relabel-by-reason" || b.kind !== "relabel-by-reason") return 0;
    if (a.rate !== b.rate) return b.rate - a.rate;
    return a.reason.localeCompare(b.reason);
  });
  return out;
}

export function topCorrections(db: TxOrDb, limit = 5): StatRow[] {
  const rows = db.all<{ prev_label: string | null; final_label: string | null; n: number }>(sql`
    SELECT er.prev_label, er.final_label, COUNT(*) AS n
    FROM effective_reviews er
    WHERE er.status = 'relabeled'
      AND er.id = (
        SELECT er2.id FROM effective_reviews er2
        WHERE er2.record_id = er.record_id
        ORDER BY er2.id DESC LIMIT 1
      )
    GROUP BY er.prev_label, er.final_label
    ORDER BY n DESC, er.prev_label ASC, er.final_label ASC
    LIMIT ${limit}
  `);
  const out: StatRow[] = [];
  for (const r of rows) {
    if (r.prev_label == null || r.final_label == null) continue;
    out.push({ kind: "top-correction", from: r.prev_label, to: r.final_label, count: r.n });
  }
  return out;
}

export function correctionRateByLabel(db: TxOrDb, limit = 5): StatRow[] {
  const rows = db.all<{ prev_label: string | null; status: string | null; n: number }>(sql`
    SELECT er.prev_label, er.status, COUNT(*) AS n
    FROM effective_reviews er
    WHERE er.id = (
      SELECT er2.id FROM effective_reviews er2
      WHERE er2.record_id = er.record_id
      ORDER BY er2.id DESC LIMIT 1
    )
    AND er.prev_label IS NOT NULL
    AND er.status IN ('accepted', 'relabeled', 'rejected')
    GROUP BY er.prev_label, er.status
  `);
  const counts = new Map<string, { relabeled: number; reviewed: number }>();
  for (const r of rows) {
    if (r.prev_label == null) continue;
    const cur = counts.get(r.prev_label) ?? { relabeled: 0, reviewed: 0 };
    if (r.status === "relabeled") cur.relabeled += r.n;
    cur.reviewed += r.n;
    counts.set(r.prev_label, cur);
  }
  const out: StatRow[] = [];
  for (const [prevLabel, c] of counts) {
    if (c.reviewed === 0 || c.relabeled === 0) continue;
    out.push({
      kind: "correction-rate-by-label",
      prevLabel,
      rate: c.relabeled / c.reviewed,
      reviewed: c.reviewed,
    });
  }
  out.sort((a, b) => {
    if (a.kind !== "correction-rate-by-label" || b.kind !== "correction-rate-by-label") return 0;
    if (a.rate !== b.rate) return b.rate - a.rate;
    return a.prevLabel.localeCompare(b.prevLabel);
  });
  return out.slice(0, limit);
}

function pendingInQueue(db: TxOrDb, def: QueueDefinition): number {
  const pendingPred = sql`NOT EXISTS (
    SELECT 1 FROM effective_reviews er
    WHERE er.record_id = ${recordsWithPrimary.id}
  )`;
  let q = db.select({ n: sql<number>`COUNT(*)` }).from(recordsWithPrimary).$dynamic();
  q = def.query.where
    ? q.where(sql`(${def.query.where}) AND (${pendingPred})`)
    : q.where(pendingPred);
  return q.get()?.n ?? 0;
}

export function suggestedNext(db: TxOrDb): StatRow[] {
  const sourceRates = new Map<string, number>();
  for (const row of relabelBySource(db)) {
    if (row.kind === "relabel-by-source") sourceRates.set(row.source, row.rate);
  }

  const distinctSources = db
    .all<{ source: string }>(sql`
      SELECT DISTINCT primary_source AS source
      FROM records_with_primary
      WHERE primary_source IS NOT NULL
    `)
    .map((r) => r.source);

  const distinctIssueTypes = db
    .all<{ type: string }>(sql`
      SELECT DISTINCT type FROM issues
      WHERE source IS NULL OR source != ${COMPUTED_SIGNAL_SOURCE}
    `)
    .map((r) => r.type);

  type Candidate = { id: QueueId; def: QueueDefinition };
  const candidates: Candidate[] = [];
  for (const id of ["pending", "low-confidence", "disagreements", "flagged", "marked"] as const) {
    const def = BUILTIN_QUEUES[id];
    if (def) candidates.push({ id, def });
  }
  for (const s of distinctSources) {
    candidates.push({
      id: `by-source:${s}`,
      def: {
        id: `by-source:${s}`,
        label: "",
        query: { where: sql`${recordsWithPrimary.primarySource} = ${s}` },
      },
    });
  }
  for (const t of distinctIssueTypes) {
    candidates.push({
      id: `by-issue:${t}`,
      def: {
        id: `by-issue:${t}`,
        label: "",
        query: {
          where: sql`EXISTS (SELECT 1 FROM issues i WHERE i.record_id = ${recordsWithPrimary.id} AND i.type = ${t})`,
        },
      },
    });
  }

  const scored = candidates.map(({ id, def }) => {
    const pending = pendingInQueue(db, def);
    const sourceRate = id.startsWith("by-source:")
      ? (sourceRates.get(id.slice("by-source:".length)) ?? 0.5)
      : 0.5;
    const hasIssuesFactor = id === "flagged" || id.startsWith("by-issue:") ? 0.5 : 0;
    const score = pending * sourceRate * (1 + hasIssuesFactor);
    return { id, pending, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.id.localeCompare(b.id);
  });

  if (scored.length === 0 || scored[0]!.score === 0) {
    return [{ kind: "all-caught-up" }];
  }
  return [{ kind: "suggested-next", queueId: scored[0]!.id, score: scored[0]!.score }];
}

export type Section = { label: string; rows: StatRow[] };

export function allStats(db: TxOrDb): { sections: Section[] } {
  const sections: Section[] = [];
  const push = (label: string, rows: StatRow[]) => {
    if (rows.length > 0) sections.push({ label, rows });
  };
  push("Progress", aggregateProgressRows(db));
  push("Decisions", aggregateDecisionRows(db));
  push("Acceptance by source", acceptanceBySource(db));
  push("Relabel by source", relabelBySource(db));
  push("Relabel by reason", relabelByReason(db));
  push("Top corrections", topCorrections(db));
  push("Labels with highest correction rate", correctionRateByLabel(db));
  push("Weakest sources", correctionRateBySource(db));
  push("Imported issues", importedIssues(db));
  push("Suggested next queue", suggestedNext(db));
  return { sections };
}

export function drillToQueue(row: StatRow): QueueId | null {
  switch (row.kind) {
    case "top-correction":
      return `by-correction:${row.from}:${row.to}`;
    case "acceptance-by-source":
    case "relabel-by-source":
    case "correction-rate-by-source":
      return `by-source:${row.source}`;
    case "relabel-by-reason":
      return `by-reason:${row.reason}`;
    case "correction-rate-by-label": {
      // `drillToQueue` runs eagerly for every row at stats-screen mount, so a
      // single reviewed label containing `'` or `\` must not crash open. The
      // where-parser tokenizer treats `\X` as a literal X, so we escape `\`
      // first (otherwise the subsequent `'`→`\'` rewrite produces sequences
      // the tokenizer would re-collapse) and then escape `'`.
      const escaped = row.prevLabel.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return `where:final_label != prev_label and prev_label = '${escaped}'`;
    }
    case "imported-issue":
      return `by-issue:${row.issueType}`;
    case "suggested-next":
      return row.queueId;
    case "progress":
    case "decision":
    case "all-caught-up":
      return null;
  }
}

export function importedIssues(db: TxOrDb): StatRow[] {
  const rows = db.all<{ type: string; n: number }>(sql`
    SELECT i.type AS type, COUNT(DISTINCT i.record_id) AS n
    FROM issues i
    WHERE i.source IS NULL OR i.source != ${COMPUTED_SIGNAL_SOURCE}
    GROUP BY i.type
    ORDER BY n DESC, i.type ASC
  `);
  return rows.map((r) => ({ kind: "imported-issue", issueType: r.type, count: r.n }));
}

export function correctionRateBySource(db: TxOrDb): StatRow[] {
  const counts = bySourceCounts(db);
  const rows: StatRow[] = [];
  for (const [source, c] of counts) {
    if (c.reviewed === 0) continue;
    rows.push({
      kind: "correction-rate-by-source",
      source,
      rate: c.relabeled / c.reviewed,
      reviewed: c.reviewed,
    });
  }
  rows.sort((a, b) => {
    if (a.kind !== "correction-rate-by-source" || b.kind !== "correction-rate-by-source") return 0;
    if (a.rate !== b.rate) return b.rate - a.rate;
    return a.source.localeCompare(b.source);
  });
  return rows;
}
