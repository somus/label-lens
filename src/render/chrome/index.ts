import type { AppContext } from "../../app/context.ts";
import type { SidebarData } from "../../app/sidebar-data.ts";
import type { Scope } from "../../keymap/engine.ts";
import { Box } from "../box.ts";
import { pickSidebar, type ResolvedDisplay, sidebarWidth } from "../capability.ts";
import { ActionFooter } from "./action-footer.ts";
import { Sidebar } from "./sidebar.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

export { ActionFooter } from "./action-footer.ts";
export type { Segment, Tone } from "./status-bar.ts";
export { StatusBar } from "./status-bar.ts";

/**
 * Vertical rows the Chrome wrapper consumes beyond the body. Depends on
 * whether the sidebar is rendered:
 *
 *   sidebar visible: 1 row — bottom action footer (status bar suppressed).
 *   sidebar hidden : 3 rows — top status bar (1) + spacer (1) + footer (1).
 *
 * Padding on the outer Box adds blank top/bottom rows but the body itself
 * lives inside an overflow:hidden Box, so the body's `flexGrow: 1` consumes
 * everything left.
 *
 * Screens that compute their own viewport (doc-view paging) must call this
 * function rather than hardcoding a constant.
 */
export function chromeRowOverhead(display: ResolvedDisplay, terminalWidth: number): number {
  return pickSidebar(display, terminalWidth) ? 1 : 3;
}

/** Back-compat constant — value for the no-sidebar default. Prefer the function. */
export const CHROME_ROW_OVERHEAD = 3;

export type ChromeProps =
  | {
      display: ResolvedDisplay;
      app: AppContext;
      scope: Scope;
      statusLeft: Segment[];
      statusRight?: Segment[];
      footerHint?: Segment[];
      /** When set, the footer paints in this flash kind's tone bg (toast). */
      flashKind?: "success" | "info" | "warning" | "error";
      /** Sidebar snapshot. When supplied and `pickSidebar(display, width)` is
       *  true, sidebar replaces the top status bar. */
      sidebar?: SidebarData;
      /** Terminal width in columns; forwarded to StatusBar for narrow-terminal
       *  truncation and used to decide sidebar visibility / width. */
      width?: number;
      body: ReturnType<typeof Box>;
    }
  | {
      display: ResolvedDisplay;
      app?: undefined;
      scope?: undefined;
      statusLeft: Segment[];
      statusRight?: Segment[];
      /** Required in registry-less mode — footer renders verbatim. */
      footerHint: Segment[];
      flashKind?: "success" | "info" | "warning" | "error";
      sidebar?: SidebarData;
      width?: number;
      body: ReturnType<typeof Box>;
    };

/**
 * Slice-1 chrome wrapper. Without sidebar: renders top status bar + body +
 * bottom action footer. With sidebar visible (≥120 cols + sidebar data
 * supplied): the top status bar is suppressed, and the body row holds main
 * pane | 1ch gap | sidebar in horizontal flex.
 *
 * Each screen passes its own status segments; the footer derives from the
 * active command registry filtered by scope. Pass `footerHint` to override the
 * derived hints (used by overlays and flash messages).
 *
 * Registry-less mode: omit `app`/`scope` and pass `footerHint` directly. Used
 * by screens that mount before AppContext is wired (reingest prompt, ADR 0008).
 */
export function Chrome(props: ChromeProps): ReturnType<typeof Box> {
  const { display, statusLeft, statusRight, footerHint, width, body, sidebar, flashKind } = props;
  const footer = props.app
    ? ActionFooter({
        display,
        app: props.app,
        scope: props.scope,
        hint: footerHint,
        flashKind,
        width,
      })
    : ActionFooter({ display, hint: footerHint as Segment[], flashKind, width });

  const sidebarVisible =
    width !== undefined && sidebar !== undefined && pickSidebar(display, width);

  if (sidebarVisible) {
    const sbWidth = sidebarWidth(width);
    return Box(
      { flexDirection: "column", flexGrow: 1, padding: 1 },
      Box(
        { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
        Box({ flexDirection: "column", flexBasis: 0, flexGrow: 1, overflow: "hidden" }, body),
        Box({ width: 1, flexShrink: 0 }),
        Sidebar({
          display,
          data: sidebar,
          width: sbWidth,
          motion: props.app?.motion,
          observeProgress: props.app?.observeProgress,
        }),
      ),
      footer,
    );
  }

  return Box(
    { flexDirection: "column", flexGrow: 1, padding: 1 },
    StatusBar({ display, left: statusLeft, right: statusRight, width }),
    Box({ height: 1 }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, body),
    footer,
  );
}
