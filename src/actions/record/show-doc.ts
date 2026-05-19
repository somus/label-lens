import { resolveDocumentId } from "../../boundary/document.ts";
import type { Command } from "../command.ts";

export const showDoc: Command = {
  name: "record.show-doc",
  scope: "review",
  bindings: { vim: "g d", simple: "d" },
  footer: { label: "doc", order: 85, group: "utility" },
  enabled: (ctx) => resolveDocumentId(ctx.cursor?.current() ?? null, ctx.config) !== null,
  disabledMessage: (ctx) =>
    ctx.config.task !== "boundary"
      ? "Doc-view is only available for boundary task."
      : "Doc-view unavailable: no document grouping field on this record (configure boundary.documentField).",
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    const documentId = resolveDocumentId(record, ctx.config);
    if (!documentId) return;
    ctx.openDocView({ documentId, returnRecordId: record.id, scrollTop: 0 });
  },
};
