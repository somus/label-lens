import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, sqliteView, text } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
  sourcePath: text("source_path").notNull(),
  rowIndex: integer("row_index").notNull(),
  text: text("text").notNull(),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  raw: text("raw").notNull(),
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
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["accepted", "relabeled", "rejected", "skipped"],
    }).notNull(),
    finalLabel: text("final_label"),
    prevLabel: text("prev_label"),
    note: text("note"),
    reviewedAt: text("reviewed_at").notNull(),
    sourceOfTruth: text("source_of_truth", {
      enum: ["human", "human+assistant"],
    }).notNull(),
  },
  (t) => [
    index("idx_reviews_record").on(t.recordId),
    index("idx_reviews_status").on(t.status),
    index("idx_reviews_final").on(t.finalLabel),
    index("idx_reviews_prev").on(t.prevLabel),
  ],
);

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
export type RecordWithPrimary = typeof recordsWithPrimary.$inferSelect;

// Re-export sql tag so callers don't need a second drizzle-orm import for ad-hoc fragments.
export { sql };
