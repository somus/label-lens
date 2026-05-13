import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { ActionFooter } from "./action-footer.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

export { ActionFooter } from "./action-footer.ts";
export type { Segment, Tone } from "./status-bar.ts";
export { StatusBar } from "./status-bar.ts";

/**
 * Vertical rows the Chrome wrapper consumes beyond the body:
 *   1 row — top status bar
 *   1 row — spacer
 *   1 row — bottom action footer
 *
 * Padding on the outer Box adds blank top/bottom rows but the body itself
 * lives inside an overflow:hidden Box, so the body's `flexGrow: 1` consumes
 * everything left. Body height = terminalHeight - CHROME_ROW_OVERHEAD (with
 * an additional ±1 if padding actually subtracts a row on the renderer in
 * use; tests confirm 3 holds for our OpenTUI version).
 *
 * Screens that compute their own viewport (doc-view paging) must subtract
 * this constant rather than hardcoding the number.
 */
export const CHROME_ROW_OVERHEAD = 3;

export type ChromeProps = {
  display: ResolvedDisplay;
  app: AppContext;
  scope: Scope;
  statusLeft: Segment[];
  statusRight?: Segment[];
  footerHint?: Segment[];
  /** Terminal width in columns; forwarded to StatusBar for narrow-terminal
   *  truncation. Tests can omit it. */
  width?: number;
  body: ReturnType<typeof Box>;
};

/**
 * Slice-1 chrome wrapper. Renders top status bar + body + bottom action footer.
 * Each screen passes its own status segments; the footer derives from the
 * active command registry filtered by scope. Pass `footerHint` to override the
 * derived hints (used by overlays and flash messages).
 */
export function Chrome(props: ChromeProps): ReturnType<typeof Box> {
  const { display, app, scope, statusLeft, statusRight, footerHint, width, body } = props;
  return Box(
    { flexDirection: "column", flexGrow: 1, padding: 1 },
    StatusBar({ display, left: statusLeft, right: statusRight, width }),
    Box({ height: 1 }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, body),
    ActionFooter({ display, app, scope, hint: footerHint }),
  );
}
