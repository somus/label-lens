import type { LabellensConfig } from "../../../config/config.ts";
import { createMultiLabelTask } from "./multi-label.ts";
import { createSingleLabelTask } from "./single-label.ts";
import type { TaskRenderer } from "./types.ts";

export type { DecisionRenderArgs, TaskKind, TaskRenderer } from "./types.ts";

/**
 * Resolve the configured task type into a renderer. Boundary and
 * classification share `SingleLabelTask` (different subject-pane neighbour
 * count + intensity); multi-label has its own renderer. New task types
 * (extraction, span/NER) plug in here as additional branches without
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
  if (config.task === "multi-label") {
    const previewLines = config.classification?.previewLines ?? 2;
    return createMultiLabelTask({
      contextRowsBefore: previewLines,
      contextRowsAfter: previewLines,
    });
  }
  const previewLines = config.classification?.previewLines ?? 2;
  return createSingleLabelTask({
    mode: "classification",
    contextRowsBefore: previewLines,
    contextRowsAfter: previewLines,
  });
}
