import type { CliRenderer } from "@opentui/core";
import { dispatch } from "../actions/dispatch.ts";
import { commitPickerSelection } from "../actions/record/commit-picker.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, reviewContext } from "../app/context.ts";
import { labelName } from "../config/config.ts";
import { resolve } from "../keymap/engine.ts";
import { pickerReduce } from "../picker/reducer.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { progressCounts, recentReviews } from "../store/queries.ts";
import type { QueueId } from "../store/queues/registry.ts";
import type { StoredReview } from "../types.ts";

export type ReviewScreenHandle = {
  destroy: () => void;
};

const STATUS_SYMBOL: Record<StoredReview["status"], string> = {
  accepted: "+",
  relabeled: "~",
  rejected: "-",
  skipped: ">",
  undone: "<",
  pending: "?",
};

export function mountReviewScreen(args: {
  renderer: CliRenderer;
  app: AppContext;
  registry?: CommandRegistry;
  initialQueueId?: QueueId;
}): ReviewScreenHandle {
  const { renderer, app } = args;
  const registry = args.registry ?? defaultRegistry();
  const ctx = reviewContext(app, args.initialQueueId ?? "pending");
  const bindings = bindingsFor([...registry.values()]);

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const counts = progressCounts(ctx.db);
    const reviewedTotal = counts.accepted + counts.relabeled + counts.rejected;
    const record = ctx.cursor.current();
    const flash = ctx.flash && ctx.flash.expiresAt > Date.now() ? ctx.flash : null;
    const history = recentReviews(ctx.db, 5);

    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },

        Box(
          { flexDirection: "row", justifyContent: "space-between" },
          Text({ content: ` LabelLens · ${basename(ctx.config.input.path)}` }),
          Text({
            content: `Reviewed: ${reviewedTotal} / ${counts.total} · Skipped: ${counts.skipped} · Pending: ${counts.pending}`,
            attributes: TextAttributes.DIM,
          }),
        ),

        Box({ height: 1 }),

        record
          ? Box(
              { flexDirection: "column", borderStyle: "rounded", padding: 1 },
              Text({ content: record.text }),
            )
          : Box(
              { padding: 2 },
              Text({
                content: "All records reviewed. Press q to quit.",
                attributes: TextAttributes.DIM,
              }),
            ),

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

        record ? labelListBox(ctx.config.labels, record.primaryPrediction?.label ?? null) : Box({}),

        record?.note
          ? Box(
              { flexDirection: "row", marginTop: 1 },
              Text({
                content: ` note: ${truncate(record.note, 200)}${record.note.length > 200 ? " (press n for full)" : ""}`,
                attributes: TextAttributes.DIM,
              }),
            )
          : Box({}),

        Box({ height: 1 }),

        history.length > 0
          ? Box(
              { flexDirection: "row" },
              Text({
                content: ` history: ${formatHistory(history)}`,
                attributes: TextAttributes.DIM,
              }),
            )
          : Box({}),

        ctx.mode === "picker" && ctx.picker
          ? pickerOverlay(ctx.picker.filter, ctx.picker.candidates, ctx.picker.highlight)
          : Box({}),

        ctx.mode === "note" && ctx.notePrompt ? noteOverlay(ctx.notePrompt.value) : Box({}),

        Box({ flexGrow: 1 }),

        flash
          ? Box(
              { flexDirection: "row" },
              Text({
                content: ` ! ${flash.message}`,
                attributes: TextAttributes.BOLD,
              }),
            )
          : Box(
              { flexDirection: "row" },
              Text({
                content:
                  " a accept   r relabel   x reject   s skip   m mark   n note   u undo   j next   k prev   q quit",
                attributes: TextAttributes.DIM,
              }),
            ),
      ),
    );
  };

  app.requestRender = renderState;
  ctx.requestRender = renderState;

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    if (app.mode === "picker") {
      handlePickerKey(app, ctx, event);
      renderState();
      return;
    }
    if (app.mode === "note") {
      handleNoteKey(registry, ctx, app, event);
      renderState();
      return;
    }
    const action = resolve(bindings, "review", {
      name: event.name,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });
    if (!action) return;
    void dispatch(registry, "review", ctx, action);
  };

  renderer.keyInput.on("keypress", onKey);
  renderState();

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", onKey);
    },
  };
}

function labelListBox(
  labels: ReturnType<typeof labelName> extends string ? unknown[] : never,
  predicted: string | null,
) {
  return Box(
    { flexDirection: "column", marginTop: 1 },
    ...(labels as unknown[]).slice(0, 9).map((entry, idx) => {
      const name = labelName(entry as Parameters<typeof labelName>[0]);
      const isPredicted = name === predicted;
      const marker = isPredicted ? " >" : "  ";
      return Text({
        content: ` ${idx + 1} ${name}${marker}`,
        attributes: isPredicted ? TextAttributes.BOLD : TextAttributes.DIM,
      });
    }),
  );
}

function formatHistory(history: StoredReview[]): string {
  return history
    .map((h) => {
      const sym = STATUS_SYMBOL[h.status] ?? "?";
      const lbl = h.final_label ?? h.prev_label ?? "";
      return `${shortId(h.record_id)} ${sym} ${lbl}`;
    })
    .join("  ·  ");
}

function pickerOverlay(
  filter: string,
  candidates: { label: string; predicted: boolean }[],
  highlight: number,
) {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
    Text({ content: ` relabel> ${filter}_` }),
    ...candidates.slice(0, 9).map((c, i) =>
      Text({
        content: ` ${i + 1} ${c.label}${c.predicted ? " >" : ""}${i === highlight ? "  <-" : ""}`,
        attributes: i === highlight ? TextAttributes.BOLD : TextAttributes.DIM,
      }),
    ),
    Text({
      content: " enter commit · esc cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function noteOverlay(value: string) {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
    Text({ content: ` note> ${value}_` }),
    Text({
      content: " enter save · esc cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function handlePickerKey(
  app: AppContext,
  ctx: ReturnType<typeof reviewContext>,
  event: { name: string; ctrl: boolean; shift: boolean; meta: boolean },
) {
  if (!app.picker) return;
  if (event.name === "escape") {
    ctx.exitOverlay();
    return;
  }
  if (event.name === "return") {
    commitPickerSelection(ctx);
    return;
  }
  if (event.name === "up") {
    app.picker = pickerReduce(app.picker, { kind: "up" });
    return;
  }
  if (event.name === "down") {
    app.picker = pickerReduce(app.picker, { kind: "down" });
    return;
  }
  if (event.name === "backspace") {
    app.picker = pickerReduce(app.picker, { kind: "backspace" });
    return;
  }
  const ch = event.name === "space" ? " " : event.name;
  if (ch.length === 1) {
    if (/^[1-9]$/.test(ch)) {
      app.picker = pickerReduce(app.picker, { kind: "number", n: Number(ch) });
      return;
    }
    if (/^[\w \-_]$/i.test(ch)) {
      app.picker = pickerReduce(app.picker, { kind: "char", char: ch });
    }
  }
}

function handleNoteKey(
  registry: CommandRegistry,
  ctx: ReturnType<typeof reviewContext>,
  app: AppContext,
  event: { name: string; ctrl: boolean; shift: boolean; meta: boolean },
) {
  if (!app.notePrompt) return;
  if (event.name === "escape") {
    ctx.exitOverlay();
    return;
  }
  if (event.name === "return") {
    void dispatch(registry, "note", ctx, "record.commitNote");
    return;
  }
  if (event.name === "backspace") {
    app.notePrompt = {
      ...app.notePrompt,
      value: app.notePrompt.value.slice(0, -1),
    };
    return;
  }
  const ch = event.name === "space" ? " " : event.name;
  if (ch.length === 1 && ch >= " " && ch <= "~") {
    app.notePrompt = {
      ...app.notePrompt,
      value: app.notePrompt.value + ch,
    };
  }
}

function shortId(id: string): string {
  return id.slice(0, 6);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
