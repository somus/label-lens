import { quit } from "./app/quit.ts";
import { bindingsFor, buildRegistry, type Command, type CommandRegistry } from "./command.ts";
import { accept } from "./record/accept.ts";
import { next } from "./record/next.ts";
import { openNoteCommand } from "./record/open-note.ts";
import { openRelabelPicker } from "./record/open-relabel-picker.ts";
import { prev } from "./record/prev.ts";
import { reject } from "./record/reject.ts";
import { relabelByIndexCommands } from "./record/relabel-by-index.ts";
import { skip } from "./record/skip.ts";
import { toggleMark } from "./record/toggle-mark.ts";
import { undo } from "./record/undo.ts";

export const ALL_COMMANDS: Command[] = [
  accept as unknown as Command,
  next as unknown as Command,
  prev as unknown as Command,
  reject as unknown as Command,
  skip as unknown as Command,
  toggleMark as unknown as Command,
  undo as unknown as Command,
  openNoteCommand as unknown as Command,
  openRelabelPicker as unknown as Command,
  ...(relabelByIndexCommands as unknown as Command[]),
  quit as unknown as Command,
];

export function defaultRegistry(): CommandRegistry {
  return buildRegistry(ALL_COMMANDS);
}

export type { Command, CommandRegistry } from "./command.ts";
export { bindingsFor };
