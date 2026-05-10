import type { QueueQuery } from "../queries.ts";
import { parseWhere } from "../where-parser.ts";
import { byCorrection } from "./by-correction.ts";
import { byIssue } from "./by-issue.ts";
import { byLabel } from "./by-label.ts";
import { byReason } from "./by-reason.ts";
import { bySource } from "./by-source.ts";
import { disagreements } from "./disagreements.ts";
import { flagged } from "./flagged.ts";
import { lowConfidence } from "./low-confidence.ts";
import { marked } from "./marked.ts";
import { pending } from "./pending.ts";
import { skipped } from "./skipped.ts";

export type QueueId = string;

export type QueueDefinition = {
  id: QueueId;
  label: string;
  query: QueueQuery;
};

export const BUILTIN_QUEUES: Record<QueueId, QueueDefinition> = {
  pending,
  skipped,
  "low-confidence": lowConfidence,
  disagreements,
  flagged,
  marked,
};

/** Order in which `[` / `]` cycle the focused queue. Static queues only. */
export const QUEUE_CYCLE: QueueId[] = [
  "pending",
  "skipped",
  "low-confidence",
  "disagreements",
  "flagged",
  "marked",
];

export function resolveQueue(id: QueueId): QueueDefinition {
  if (id.startsWith("where:")) return parseWhere(id.slice("where:".length));
  const colonAt = id.indexOf(":");
  if (colonAt > 0) {
    const head = id.slice(0, colonAt);
    const rest = id.slice(colonAt + 1);
    switch (head) {
      case "by-source":
        return bySource(rest);
      case "by-reason":
        return byReason(rest);
      case "by-label":
        return byLabel(rest);
      case "by-issue":
        return byIssue(rest);
      case "by-correction": {
        const sep = rest.indexOf(":");
        if (sep < 1) throw new Error("by-correction needs <from>:<to>");
        return byCorrection(rest.slice(0, sep), rest.slice(sep + 1));
      }
    }
  }
  const def = BUILTIN_QUEUES[id];
  if (!def) throw new Error(`unknown queue: ${id}`);
  return def;
}
