import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { ActionFooter } from "./action-footer.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

export { ActionFooter } from "./action-footer.ts";
export type { Segment, Tone } from "./status-bar.ts";
export { StatusBar } from "./status-bar.ts";

export type ChromeProps = {
  display: ResolvedDisplay;
  app: AppContext;
  scope: Scope;
  statusLeft: Segment[];
  statusRight?: Segment[];
  footerHint?: Segment[];
  body: ReturnType<typeof Box>;
};

/**
 * Slice-1 chrome wrapper. Renders top status bar + body + bottom action footer.
 * Each screen passes its own status segments; the footer derives from the
 * active command registry filtered by scope. Pass `footerHint` to override the
 * derived hints (used by overlays and flash messages).
 */
export function Chrome(props: ChromeProps): ReturnType<typeof Box> {
  const { display, app, scope, statusLeft, statusRight, footerHint, body } = props;
  return Box(
    { flexDirection: "column", flexGrow: 1, padding: 1 },
    StatusBar({ display, left: statusLeft, right: statusRight }),
    Box({ height: 1 }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, body),
    ActionFooter({ display, app, scope, hint: footerHint }),
  );
}
