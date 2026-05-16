import { sql } from "drizzle-orm";
import type { Db } from "../store/db.ts";
import { effectiveReviews } from "../store/schema.ts";

/**
 * Decide which screen mounts at boot. With zero effective reviews the user has
 * never touched this dataset (or just nuked everything); open the queue overlay
 * so they pick a starting queue instead of being dumped into Review on
 * `pending` with no orientation. Otherwise resume Review.
 */
export function chooseInitialScreen(db: Db): "queue" | "review" {
  const row = db.select({ n: sql<number>`COUNT(*)` }).from(effectiveReviews).get();
  return (row?.n ?? 0) === 0 ? "queue" : "review";
}
