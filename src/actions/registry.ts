import { quit } from "./app/quit.ts";
import { bindingsFor, buildRegistry, type Command, type CommandRegistry } from "./command.ts";
import { accept } from "./record/accept.ts";
import { next } from "./record/next.ts";
import { prev } from "./record/prev.ts";

export const ALL_COMMANDS: Command[] = [
  accept as unknown as Command,
  next as unknown as Command,
  prev as unknown as Command,
  quit as unknown as Command,
];

export function defaultRegistry(): CommandRegistry {
  return buildRegistry(ALL_COMMANDS);
}

export type { Command, CommandRegistry } from "./command.ts";
export { bindingsFor };
