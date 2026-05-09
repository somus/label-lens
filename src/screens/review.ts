import type { Database } from "bun:sqlite";
import type { CliRenderer } from "@opentui/core";
import { ACTIONS, type ActionContext } from "../actions/registry.ts";
import type { LabellensConfig } from "../config/config.ts";
import { DEFAULT_BINDINGS } from "../keymap/defaults.ts";
import { type Binding, resolve } from "../keymap/engine.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import {
  insertReview,
  listPendingRecords,
  progressCounts,
  type RecordWithPrimaryPrediction,
} from "../store/records.ts";

export type ReviewScreenHandle = {
  destroy: () => void;
};

export function mountReviewScreen(args: {
  renderer: CliRenderer;
  db: Database;
  config: LabellensConfig;
  bindings?: Binding[];
}): ReviewScreenHandle {
  const { renderer, db, config } = args;
  const bindings = args.bindings ?? DEFAULT_BINDINGS;

  let pending: RecordWithPrimaryPrediction[] = listPendingRecords(db);
  let cursor = 0;

  const counts = () => progressCounts(db);

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const { reviewed, total } = counts();
    const record = pending[cursor];

    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },

        // top strip
        Box(
          { flexDirection: "row", justifyContent: "space-between" },
          Text({ content: ` LabelLens · ${basename(config.input.path)}` }),
          Text({
            content: `${reviewed} / ${total}   q quit`,
            attributes: TextAttributes.DIM,
          }),
        ),

        Box({ height: 1 }),

        // candidate
        record
          ? Box(
              {
                flexDirection: "column",
                borderStyle: "rounded",
                padding: 1,
              },
              Text({ content: record.text }),
            )
          : Box(
              { padding: 2 },
              Text({
                content: "All records reviewed. Press q to quit.",
                attributes: TextAttributes.DIM,
              }),
            ),

        // metadata
        record?.primaryPrediction
          ? Box(
              { flexDirection: "row", marginTop: 1 },
              Text({
                content: ` src ${record.primaryPrediction.source}   →   ${record.primaryPrediction.label}${
                  record.primaryPrediction.confidence !== null
                    ? `  (${Math.round(record.primaryPrediction.confidence * 100)}%)`
                    : ""
                }`,
                attributes: TextAttributes.DIM,
              }),
            )
          : Box({}),

        Box({ flexGrow: 1 }),

        // action bar
        Box(
          { flexDirection: "row" },
          Text({
            content: " a accept    j next    k prev    q quit",
            attributes: TextAttributes.DIM,
          }),
        ),
      ),
    );
  };

  const refreshPending = () => {
    pending = listPendingRecords(db);
    if (cursor >= pending.length) cursor = Math.max(0, pending.length - 1);
  };

  const ctx: ActionContext = {
    acceptCurrent: () => {
      const record = pending[cursor];
      if (!record) return;
      insertReview(db, {
        record_id: record.id,
        status: "accepted",
        final_label: record.primaryPrediction?.label ?? null,
        prev_label: null,
        note: null,
        source_of_truth: "human",
      });
      refreshPending();
      renderState();
    },
    next: () => {
      if (pending.length === 0) return;
      cursor = Math.min(cursor + 1, pending.length - 1);
      renderState();
    },
    prev: () => {
      cursor = Math.max(cursor - 1, 0);
      renderState();
    },
    quit: () => {
      renderer.destroy();
      process.exit(0);
    },
  };

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    const action = resolve(bindings, "review", {
      name: event.name,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });
    if (action && ACTIONS[action]) ACTIONS[action](ctx);
  };

  renderer.keyInput.on("keypress", onKey);
  renderState();

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", onKey);
    },
  };
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
