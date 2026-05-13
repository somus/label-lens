import type { AppContext } from "../../app/context.ts";
import { clearDocLines, loadDocLines } from "../../screens/doc-view.ts";
import type { Command } from "../command.ts";

const HALF_PAGE_LINES = 10;

function setScroll(ctx: AppContext, next: number): void {
  if (!ctx.docView) return;
  const lines = loadDocLines(ctx);
  if (!lines) return;
  const max = Math.max(0, lines.rows.length - 1);
  ctx.docView.scrollTop = Math.max(0, Math.min(next, max));
  ctx.requestRender();
}

function delta(ctx: AppContext, d: number): void {
  if (!ctx.docView) return;
  setScroll(ctx, ctx.docView.scrollTop + d);
}

export const docNext: Command = {
  name: "doc.next",
  scope: "doc-view",
  binding: ["j", "down"],
  footer: { label: "scroll ↓", order: 10 },
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => delta(ctx, 1),
};

export const docPrev: Command = {
  name: "doc.prev",
  scope: "doc-view",
  binding: ["k", "up"],
  footer: { label: "scroll ↑", order: 20 },
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => delta(ctx, -1),
};

export const docPageDown: Command = {
  name: "doc.page-down",
  scope: "doc-view",
  binding: ["ctrl+d", "pagedown"],
  footer: { label: "page ↓", order: 30 },
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => delta(ctx, HALF_PAGE_LINES),
};

export const docPageUp: Command = {
  name: "doc.page-up",
  scope: "doc-view",
  binding: ["ctrl+u", "pageup"],
  footer: { label: "page ↑", order: 40 },
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => delta(ctx, -HALF_PAGE_LINES),
};

export const docTop: Command = {
  name: "doc.top",
  scope: "doc-view",
  binding: "g g",
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => setScroll(ctx, 0),
};

export const docBottom: Command = {
  name: "doc.bottom",
  scope: "doc-view",
  binding: "shift+g",
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => {
    const lines = loadDocLines(ctx);
    if (!lines) return;
    setScroll(ctx, lines.rows.length - 1);
  },
};

export const docClose: Command = {
  name: "doc.close",
  scope: "doc-view",
  binding: ["escape", "q"],
  footer: { label: "close", order: 50 },
  enabled: (ctx) => ctx.docView !== null,
  run: (ctx) => {
    clearDocLines(ctx);
    ctx.closeDocView();
  },
};

export const DOC_VIEW_COMMANDS: Command[] = [
  docNext,
  docPrev,
  docPageDown,
  docPageUp,
  docTop,
  docBottom,
  docClose,
];
