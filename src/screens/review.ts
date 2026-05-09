import type { CliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import { dispatch } from "../actions/dispatch.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, reviewContext } from "../app/context.ts";
import { resolve } from "../keymap/engine.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import type { QueueId } from "../store/queues/registry.ts";

export type ReviewScreenHandle = {
  destroy: () => void;
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
    const total = totalRecords(ctx);
    const reviewed = reviewedCount(ctx);
    const record = ctx.cursor.current();
    const flash = ctx.flash && ctx.flash.expiresAt > Date.now() ? ctx.flash : null;

    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },

        Box(
          { flexDirection: "row", justifyContent: "space-between" },
          Text({ content: ` LabelLens · ${basename(ctx.config.input.path)}` }),
          Text({
            content: `${reviewed} / ${total}   q quit`,
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
                content: " a accept    j next    k prev    q quit",
                attributes: TextAttributes.DIM,
              }),
            ),
      ),
    );
  };

  app.requestRender = renderState;
  ctx.requestRender = renderState;

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
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

function reviewedCount(ctx: ReturnType<typeof reviewContext>): number {
  const row = ctx.db.all<{ n: number }>(
    sql`SELECT COUNT(DISTINCT record_id) AS n FROM reviews WHERE status IN ('accepted','relabeled','rejected')`,
  );
  return row[0]?.n ?? 0;
}

function totalRecords(ctx: ReturnType<typeof reviewContext>): number {
  const row = ctx.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`);
  return row[0]?.n ?? 0;
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
