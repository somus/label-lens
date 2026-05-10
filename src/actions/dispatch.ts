import type { Scope } from "../keymap/engine.ts";
import type { ActionContext, CommandRegistry } from "./command.ts";

export type DispatchResult =
  | { kind: "ok"; action: string }
  | { kind: "unknown"; action: string }
  | { kind: "scope-mismatch"; action: string }
  | { kind: "disabled"; action: string }
  | { kind: "error"; action: string; error: unknown };

export async function dispatch(
  registry: CommandRegistry,
  scope: Scope,
  ctx: ActionContext,
  actionName: string,
  argument?: string,
): Promise<DispatchResult> {
  const cmd = registry.get(actionName);
  if (!cmd) return { kind: "unknown", action: actionName };
  if (cmd.scope !== scope && cmd.scope !== "global") {
    return { kind: "scope-mismatch", action: actionName };
  }
  if (cmd.enabled && !cmd.enabled(ctx)) {
    if (cmd.disabledMessage) {
      const msg =
        typeof cmd.disabledMessage === "function" ? cmd.disabledMessage(ctx) : cmd.disabledMessage;
      ctx.setFlash(msg, "info");
    }
    return { kind: "disabled", action: actionName };
  }
  try {
    await cmd.run(ctx, argument);
    return { kind: "ok", action: actionName };
  } catch (err) {
    ctx.setFlash(formatError(actionName, err), "error");
    return { kind: "error", action: actionName, error: err };
  }
}

function formatError(action: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `${action}: ${msg}`;
}
