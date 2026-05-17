import type { LabelConfigEntry } from "../../../config/config.ts";
import type { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import type { RecordWithPrimaryPrediction } from "../../../types.ts";

export type TaskKind = "classification" | "boundary";

export type DecisionRenderArgs = {
  record: RecordWithPrimaryPrediction | null;
  labels: LabelConfigEntry[];
  display: ResolvedDisplay;
};

/**
 * Renders the decision region for one task type. Today single-label
 * (classification + boundary) is the only concrete renderer; tomorrow
 * multi-label, extraction, and span/NER each ship as one new file in
 * this directory.
 *
 * The screen consults a resolved renderer for:
 *   - `renderDecision` — produces the bottom-of-main-column row(s) the
 *     reviewer commits a label from.
 *   - `contextRowsBefore` / `contextRowsAfter` — how many neighbour rows
 *     to show in the subject pane. Boundary uses semantic context; other
 *     tasks use weaker queue preview.
 *   - `contextIntensity` — `strong` renders neighbours with the boundary
 *     band gradient (§14.5); `weak` renders them dimmer so the reviewer
 *     reads them as queue siblings rather than semantic context.
 */
export type TaskRenderer = {
  id: TaskKind;
  contextRowsBefore: number;
  contextRowsAfter: number;
  contextIntensity: "strong" | "weak";
  renderDecision(args: DecisionRenderArgs): ReturnType<typeof Box>;
};
