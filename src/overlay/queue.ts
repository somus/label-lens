import type { AppContext } from "../app/context.ts";
import { queueRecords } from "../store/queries.ts";
import { nonOrphanRecordCount, queueCount } from "../store/queues/queue-counts.ts";
import { QUEUE_CYCLE, type QueueId, resolveQueue } from "../store/queues/registry.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

/**
 * Queue picker overlay. Surfaced
 * via `:queue` or `shift+Q`. Shows the static built-in queues grouped by
 * intent (Review / Signal) with their current row counts and a preview
 * of the first record for the highlighted queue. Selecting a queue
 * switches the active cursor via `queue.switch.<id>`.
 */

export type QueueRow = {
  id: QueueId;
  label: string;
  description: string;
  count: number;
  /** First record in the queue, eagerly computed for the preview pane. Null
   *  when the queue is empty. */
  preview: RecordWithPrimaryPrediction | null;
};

export type QueueSection = { title: string; icon: string; rows: QueueRow[] };

export type QueueState = {
  sections: QueueSection[];
  /** Flat index into the concatenated section rows for highlight tracking. */
  highlight: number;
  /** Cached total record count for the dataset — drives the progress bars
   *  in the preview / counts column. */
  totalRecords: number;
};

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  pending: "Awaiting your label",
  skipped: "Reviewed but punted",
  marked: "Flagged for follow-up via [m]",
  "low-confidence": "Predictions with the weakest scores",
  disagreements: "Sources predict different labels",
  flagged: "Imported or computed signals",
};

const QUEUE_SECTION_LAYOUT: Array<{ title: string; icon: string; ids: QueueId[] }> = [
  { title: "Review Queues", icon: "⊞", ids: ["pending", "skipped", "marked"] },
  { title: "Signal Queues", icon: "◆", ids: ["low-confidence", "disagreements", "flagged"] },
];

export function openQueue(app: AppContext): QueueState {
  const totalRecords = totalRecordCount(app);
  const sections: QueueSection[] = QUEUE_SECTION_LAYOUT.filter((sec) =>
    sec.ids.some((id) => QUEUE_CYCLE.includes(id)),
  ).map((sec) => ({
    title: sec.title,
    icon: sec.icon,
    rows: sec.ids
      .filter((id) => QUEUE_CYCLE.includes(id))
      .map((id) => {
        const def = resolveQueue(id);
        const first = queueRecords(app.db, { ...def.query, limit: 1 })[0] ?? null;
        return {
          id,
          label: def.label,
          description: QUEUE_DESCRIPTIONS[id] ?? "",
          count: queueCount(app.db, def),
          preview: first,
        };
      }),
  }));
  const flat = sections.flatMap((s) => s.rows);
  const initial = Math.max(
    0,
    flat.findIndex((r) => r.id === app.queueId),
  );
  return { sections, highlight: initial, totalRecords };
}

function totalRecordCount(app: AppContext): number {
  // Scoped to non-orphan rows so per-queue progress bars stay coherent with
  // built-in queue counts after a re-ingest that flagged rows as orphans.
  return nonOrphanRecordCount(app.db);
}

function packed(state: QueueState): Overlay {
  return { kind: "queue", state };
}

function flatRows(state: QueueState): QueueRow[] {
  return state.sections.flatMap((s) => s.rows);
}

export function reduceQueue(state: QueueState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind === "commit") return commit(state);
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };
  const rows = flatRows(state);
  const name = event.event.name;
  if (name === "escape" || name === "q") {
    return { overlay: null, effects: [{ kind: "close" }] };
  }
  if (name === "return" || name === "enter") return commit(state);
  if (name === "j" || name === "down") {
    return {
      overlay: packed({ ...state, highlight: Math.min(rows.length - 1, state.highlight + 1) }),
      effects: [],
    };
  }
  if (name === "k" || name === "up") {
    return {
      overlay: packed({ ...state, highlight: Math.max(0, state.highlight - 1) }),
      effects: [],
    };
  }
  return { overlay: packed(state), effects: [] };
}

function commit(state: QueueState): ReduceResult {
  const rows = flatRows(state);
  const row = rows[state.highlight];
  if (!row) return { overlay: null, effects: [{ kind: "close" }] };
  if (row.count === 0) {
    // No-op — stay open so the user can pick another. The grayed count
    // and dim row already convey "empty"; a flash would just be noise.
    return { overlay: packed(state), effects: [] };
  }
  return {
    overlay: null,
    effects: [{ kind: "runCommand", commandName: `queue.switch.${row.id}` }, { kind: "close" }],
  };
}
