import { quit } from "./app/quit.ts";
import { bindingsFor, buildRegistry, type Command, type CommandRegistry } from "./command.ts";
import { DOC_VIEW_COMMANDS } from "./doc/doc-view-commands.ts";
import { exportCommand, paletteExportCommand } from "./export/run.ts";
import { guidelinesShow } from "./guidelines/show.ts";
import { helpShow } from "./help/show.ts";
import { paletteGuidelines } from "./palette/guidelines.ts";
import { paletteHelp } from "./palette/help.ts";
import { paletteOpen } from "./palette/open.ts";
import {
  paletteByCorrection,
  paletteByIssue,
  paletteByLabel,
  paletteByReason,
  paletteBySource,
  paletteMarked,
  paletteQueue,
  paletteWhere,
} from "./palette/queue.ts";
import { paletteAssistant, paletteReload } from "./palette/stubs.ts";
import { nextQueue, prevQueue } from "./queue/cycle-queue.ts";
import { openQueueScreen } from "./queue/open-screen.ts";
import { queueSwitchCommands } from "./queue/switch.ts";
import { accept, reject, relabelByIndexCommands, skip } from "./record/decisions.ts";
import { next } from "./record/next.ts";
import { openNoteCommand } from "./record/open-note.ts";
import { openRelabelPicker } from "./record/open-relabel-picker.ts";
import { prev } from "./record/prev.ts";
import { showDoc } from "./record/show-doc.ts";
import { toggleMark } from "./record/toggle-mark.ts";
import { undo } from "./record/undo.ts";
import { paletteStats, statsShow } from "./stats/show.ts";

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
  openQueueScreen,
  ...queueSwitchCommands,
  showDoc,
  ...DOC_VIEW_COMMANDS,
  paletteOpen,
  helpShow,
  guidelinesShow,
  paletteQueue,
  paletteBySource,
  paletteByReason,
  paletteByLabel,
  paletteByIssue,
  paletteByCorrection,
  paletteWhere,
  paletteMarked,
  paletteGuidelines,
  paletteHelp,
  paletteStats,
  statsShow,
  exportCommand,
  paletteExportCommand,
  paletteAssistant,
  paletteReload,
  quit,
];

export function defaultRegistry(): CommandRegistry {
  return buildRegistry(ALL_COMMANDS);
}

export type { Command, CommandRegistry } from "./command.ts";
export { bindingsFor };
