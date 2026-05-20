import { and, asc, eq, or } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import {
  latestEffectiveFinalLabel,
  latestEffectiveFinalLabelContains,
  nonOrphan,
  primaryLabelContains,
  unreviewed,
} from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

/**
 * Matches a record when:
 *   - latest effective review's final_label = <value>, or
 *   - no effective review exists AND primary prediction label = <value>.
 *
 * Rejected records (final_label IS NULL) explicitly do NOT match — once the
 * reviewer says the prediction is wrong, the record stops being counted under
 * its predicted label. A naive `COALESCE(final_label, primary_label)` would
 * fall through to the prediction on rejection, which is the opposite of the
 * intended semantics.
 *
 * The LIMIT 1 / latest-effective semantics are encapsulated in
 * `latestEffectiveFinalLabel()`; see ADR 0007.
 */
export function byLabel(value: string): QueueDefinition {
  if (value.length === 0) throw new Error("by-label needs <label>");
  return {
    id: `by-label:${value}`,
    label: `Label: ${value}`,
    query: {
      where: and(
        or(
          latestEffectiveFinalLabel(value),
          latestEffectiveFinalLabelContains(value),
          and(unreviewed(), eq(recordsWithPrimary.primaryLabel, value)),
          and(unreviewed(), primaryLabelContains(value)),
        ),
        nonOrphan(),
      ),
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
