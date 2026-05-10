import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  sqliteView,
  text,
} from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
  sourcePath: text("source_path").notNull(),
  rowIndex: integer("row_index").notNull(),
  text: text("text").notNull(),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  raw: text("raw").notNull(),
  note: text("note"),
});

export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    confidence: real("confidence"),
    source: text("source").notNull(),
    reason: text("reason"),
    raw: text("raw").notNull(),
  },
  (t) => [
    index("idx_predictions_record").on(t.recordId),
    index("idx_predictions_source").on(t.source),
    index("idx_predictions_conf").on(t.confidence),
    index("idx_predictions_reason").on(t.reason),
  ],
);

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    score: real("score"),
    source: text("source"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_issues_type").on(t.type), index("idx_issues_record").on(t.recordId)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["accepted", "relabeled", "rejected", "skipped", "undone"],
    }).notNull(),
    finalLabel: text("final_label"),
    prevLabel: text("prev_label"),
    reviewedAt: text("reviewed_at").notNull(),
    sourceOfTruth: text("source_of_truth", {
      enum: ["human", "human+assistant"],
    }).notNull(),
    compensatesReviewId: integer("compensates_review_id").references(
      (): AnySQLiteColumn => reviews.id,
    ),
  },
  (t) => [
    index("idx_reviews_record").on(t.recordId),
    index("idx_reviews_status").on(t.status),
    index("idx_reviews_final").on(t.finalLabel),
    index("idx_reviews_prev").on(t.prevLabel),
    index("idx_reviews_compensates").on(t.compensatesReviewId),
  ],
);

export const recordTags = sqliteTable(
  "record_tags",
  {
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.recordId, t.tag] }), index("idx_record_tags_tag").on(t.tag)],
);

/**
 * Every review row that is currently effective — not undone, not compensated.
 * Single source of truth for "current Review entry" semantics. ADR 0007.
 */
export const effectiveReviews = sqliteView("effective_reviews", {
  id: integer("id").notNull(),
  recordId: text("record_id").notNull(),
  status: text("status", {
    enum: ["accepted", "relabeled", "rejected", "skipped", "undone"],
  }).notNull(),
  finalLabel: text("final_label"),
  prevLabel: text("prev_label"),
  reviewedAt: text("reviewed_at").notNull(),
  sourceOfTruth: text("source_of_truth", {
    enum: ["human", "human+assistant"],
  }).notNull(),
  compensatesReviewId: integer("compensates_review_id"),
}).existing();

/**
 * Every record joined to its primary prediction.
 * Primary = highest confidence; NULL confidence loses to any numeric;
 * ties broken by predictions.id ASC (insertion order). PRD §11.4 + ADR 0001.
 *
 * View definition lives in a raw-SQL migration (drizzle-kit doesn't emit
 * window functions); here we declare its existing columns so the query
 * builder can SELECT from it with full type information.
 */
export const recordsWithPrimary = sqliteView("records_with_primary", {
  id: text("id").notNull(),
  sourcePath: text("source_path").notNull(),
  rowIndex: integer("row_index").notNull(),
  text: text("text").notNull(),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  raw: text("raw").notNull(),
  note: text("note"),
  documentId: text("document_id"),
  primaryPredictionId: integer("primary_prediction_id"),
  primaryLabel: text("primary_label"),
  primaryConfidence: real("primary_confidence"),
  primarySource: text("primary_source"),
  primaryReason: text("primary_reason"),
  primaryRaw: text("primary_raw"),
}).existing();

export type Record_ = typeof records.$inferSelect;
export type NewRecord = typeof records.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type RecordTag = typeof recordTags.$inferSelect;
export type NewRecordTag = typeof recordTags.$inferInsert;
export type RecordWithPrimary = typeof recordsWithPrimary.$inferSelect;

// Re-export sql tag so callers don't need a second drizzle-orm import for ad-hoc fragments.
export { sql };
