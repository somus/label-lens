import type { LabellensConfig } from "../../../config/config.ts";
import { createSingleLabelTask } from "./single-label.ts";
import type { TaskRenderer } from "./types.ts";

export type { DecisionRenderArgs, TaskKind, TaskRenderer } from "./types.ts";

/**
 * Resolve the configured task type into a renderer. Today the boundary
 * and classification tasks share `SingleLabelTask` and differ only in
 * subject-pane neighbour count + intensity. New task types (multi-label,
 * extraction, span/NER) plug in here as additional branches without
 * touching the screen file.
 */
export function resolveTaskRenderer(config: LabellensConfig): TaskRenderer {
  if (config.task === "boundary") {
    const n = config.boundary?.contextLines ?? 3;
    return createSingleLabelTask({
      mode: "boundary",
      contextRowsBefore: n,
      contextRowsAfter: n,
    });
  }
  const previewLines = config.classification?.previewLines ?? 2;
  return createSingleLabelTask({
    mode: "classification",
    contextRowsBefore: previewLines,
    contextRowsAfter: previewLines,
  });
}
