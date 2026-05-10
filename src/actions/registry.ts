import { quit } from "./app/quit.ts";
import { bindingsFor, buildRegistry, type Command, type CommandRegistry } from "./command.ts";
import { DOC_VIEW_COMMANDS } from "./doc/doc-view-commands.ts";
import { nextQueue, prevQueue } from "./queue/cycle-queue.ts";
import { accept, reject, relabelByIndexCommands, skip } from "./record/decisions.ts";
import { next } from "./record/next.ts";
import { openNoteCommand } from "./record/open-note.ts";
import { openRelabelPicker } from "./record/open-relabel-picker.ts";
import { prev } from "./record/prev.ts";
import { showDoc } from "./record/show-doc.ts";
import { toggleMark } from "./record/toggle-mark.ts";
import { undo } from "./record/undo.ts";

export const ALL_COMMANDS: Command[] = [
  accept,
  next,
  prev,
  reject,
  skip,
  toggleMark,
  undo,
  openNoteCommand,
  openRelabelPicker,
  ...relabelByIndexCommands,
  nextQueue,
  prevQueue,
  showDoc,
  ...DOC_VIEW_COMMANDS,
  quit,
];

export function defaultRegistry(): CommandRegistry {
  return buildRegistry(ALL_COMMANDS);
}

export type { Command, CommandRegistry } from "./command.ts";
export { bindingsFor };
