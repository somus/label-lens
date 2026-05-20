import type { AppContext } from "../../app/context.ts";
import { openBulkConfirm } from "../../overlay/bulk-confirm.ts";
import { latestEffectiveByRecord, queueRecords } from "../../store/queries.ts";
import { resolveQueue } from "../../store/queues/registry.ts";
import type { RecordWithPrimaryPrediction } from "../../types.ts";
import type { Command } from "../command.ts";
import type { BulkAction } from "../record/bulk.ts";
import { selectBulkTargets } from "../record/bulk.ts";

function gather(app: AppContext): {
  marked: RecordWithPrimaryPrediction[];
  reviewed: Set<string>;
} {
  const marked = queueRecords(app.db, resolveQueue("marked").query);
  // `reviewed` includes every effective Review status — accepted, relabeled,
  // rejected, AND skipped. By design (ADR 0003): skipped is its own Review
  // state, not pending. A marked+skipped record is therefore excluded from
  // bulk review actions; the reviewer must `u` the skip first if they want
  // to re-decide it in a batch.
  const reviewed = new Set(latestEffectiveByRecord(app.db).keys());
  return { marked, reviewed };
}

function openConfirm(app: AppContext, action: BulkAction, argument?: string): void {
  const { marked, reviewed } = gather(app);
  if (marked.length === 0) {
    app.setFlash("Bulk: no marked records", "warning");
    return;
  }
  const { eligible, excluded } = selectBulkTargets({ action, marked, reviewed });
  // `:bulk-unmark` operates on every marked record regardless of Review
  // state — the eligibility refusal below only applies to review actions.
  if (action !== "unmark" && eligible.length === 0) {
    app.setFlash("Bulk: no eligible records (all marked already reviewed)", "warning");
    return;
  }
  let label: string | undefined;
  if (action === "relabel") {
    label = argument?.trim();
    if (!label) {
      app.setFlash(":bulk-relabel requires a label", "error");
      return;
    }
    const configured = app.config.labels.some((entry) =>
      typeof entry === "string" ? entry === label : entry.name === label,
    );
    if (!configured) {
      app.setFlash(`:bulk-relabel: label "${label}" not configured`, "error");
      return;
    }
  }
  app.openOverlay({
    kind: "bulk-confirm",
    state: openBulkConfirm({ action, eligible, excluded, label }),
  });
}

export const paletteBulkAccept: Command = {
  name: "palette.bulk-accept",
  scope: "global",
  palette: ":bulk-accept",
  paletteMetadata: {
    category: "actions",
    arity: 0,
    description: "Bulk accept marked records",
  },
  run: (ctx) => openConfirm(ctx, "accept"),
};

export const paletteBulkRelabel: Command = {
  name: "palette.bulk-relabel",
  scope: "global",
  palette: ":bulk-relabel",
  paletteMetadata: {
    category: "actions",
    arity: 1,
    description: "Bulk relabel marked records (<label>)",
  },
  run: (ctx, argument) => openConfirm(ctx, "relabel", argument),
};

export const paletteBulkReject: Command = {
  name: "palette.bulk-reject",
  scope: "global",
  palette: ":bulk-reject",
  paletteMetadata: {
    category: "actions",
    arity: 0,
    description: "Bulk reject marked records",
  },
  run: (ctx) => openConfirm(ctx, "reject"),
};

export const paletteBulkSkip: Command = {
  name: "palette.bulk-skip",
  scope: "global",
  palette: ":bulk-skip",
  paletteMetadata: {
    category: "actions",
    arity: 0,
    description: "Bulk skip marked records",
  },
  run: (ctx) => openConfirm(ctx, "skip"),
};

export const paletteBulkUnmark: Command = {
  name: "palette.bulk-unmark",
  scope: "global",
  palette: ":bulk-unmark",
  paletteMetadata: {
    category: "actions",
    arity: 0,
    description: "Clear marked from every marked record",
  },
  run: (ctx) => openConfirm(ctx, "unmark"),
};

export const bulkCommands: Command[] = [
  paletteBulkAccept,
  paletteBulkRelabel,
  paletteBulkReject,
  paletteBulkSkip,
  paletteBulkUnmark,
];
