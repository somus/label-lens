import { writeFileSync } from "node:fs";
import { switchQueue } from "../actions/queue/switch.ts";
import { commitBatch, commitBulkUnmark } from "../actions/record/bulk.ts";
import { type AppContext, effectiveQueueId } from "../app/context.ts";
import { type BuiltinIssueType, isBuiltinIssueType } from "../learning/smart-learning.ts";
import { flash } from "../render/anim.ts";
import { COMPUTED_SIGNAL_SOURCE, issuesForRecord } from "../store/issues.ts";
import { predicateQueue } from "../store/queues/predicate.ts";
import { queueCount } from "../store/queues/queue-counts.ts";
import type { QueueId } from "../store/queues/registry.ts";
import { insertReview, updateRecordNote } from "../store/records.ts";
import { reduceOverlay } from "./reduce.ts";
import type { Effect, OverlayEvent } from "./types.ts";

function builtinIssueTypesFor(app: AppContext, recordId: string): BuiltinIssueType[] {
  const types: BuiltinIssueType[] = [];
  for (const issue of issuesForRecord(app.db, recordId)) {
    if (issue.source !== COMPUTED_SIGNAL_SOURCE) continue;
    if (isBuiltinIssueType(issue.type)) types.push(issue.type);
  }
  return types;
}

/**
 * Refresh whichever cursor is actually backing the active screen. Smart-next
 * (PRD §14.7) opens a `smart-pending` cursor under the user-facing
 * `pending` queueId; refreshing by `queueId` alone would update the wrong
 * cursor and let just-reviewed records linger in the on-screen list. Also
 * refresh the user-facing cursor when it differs so the shift+J/K escape
 * hatch (which seeks through the plain `pending` cursor) sees fresh data.
 */
function refreshQueue(app: AppContext, queueId: QueueId): { total: number } {
  const effective = effectiveQueueId(app, queueId);
  const cursor = app.getCursor(effective);
  cursor.refresh();
  if (effective !== queueId && app.hasCursor(queueId)) {
    app.getCursor(queueId).refresh();
  }
  return cursor;
}

export type DispatchCommandFn = (name: string, argument?: string) => void | Promise<void>;

/**
 * Post an async overlay event (e.g. streamToken from `queryAssistant`) onto
 * the active overlay's reducer. Routes through `reduceOverlay` so reducers
 * stay pure, then applies any emitted effects. No-ops when no overlay is
 * open (the reviewer dismissed before the token arrived).
 */
export function dispatchOverlayEvent(app: AppContext, queueId: QueueId, event: OverlayEvent): void {
  if (!app.overlay) return;
  const result = reduceOverlay(app.overlay, event);
  if (result.overlay) {
    // Direct mutate — closeOverlay() would also clear and re-render, but the
    // reducer here typically returns the same kind with updated state, and we
    // want one render at the end, not two.
    app.overlay = result.overlay;
  }
  applyEffects(app, queueId, result.effects);
  app.requestRender();
}

/**
 * Interpret data Effects emitted by an Overlay reducer against the AppContext.
 * Source-of-truth side effects (ADR 0004) live here so reducers stay pure.
 *
 * `dispatchCommand` is the screen-supplied callback that re-enters the
 * Command dispatcher when an overlay emits a `runCommand` effect (palette).
 * Unit tests can omit it; the interpreter then flashes an error rather
 * than silently dropping the dispatch.
 */
export function applyEffects(
  app: AppContext,
  queueId: QueueId,
  effects: Effect[],
  dispatchCommand?: DispatchCommandFn,
): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case "close":
        app.closeOverlay();
        break;
      case "commitDecision": {
        // Sample built-in Issue types before `insertReview` so the smart-pending
        // weight refresh that follows the cursor refresh reflects this decision.
        // `skipped` is deferred-not-annotated (ADR 0003) and never feeds the
        // learning sampler — a deferral reveals nothing about whether an Issue
        // type is a productive filter.
        if (
          effect.status === "accepted" ||
          effect.status === "relabeled" ||
          effect.status === "rejected"
        ) {
          app.smartLearning.recordDecision(
            effect.status,
            builtinIssueTypesFor(app, effect.recordId),
          );
        }
        insertReview(app.db, {
          record_id: effect.recordId,
          status: effect.status,
          final_label: effect.finalLabel,
          prev_label: effect.prevLabel,
          source_of_truth: effect.sourceOfTruth,
        });
        // Any commit decision against this record retires the in-progress
        // multi-label draft. Picker commit, `a`, `x`, `s`, assistant — all
        // funnel through here so one clear covers every path.
        if (app.multiLabelDraft?.recordId === effect.recordId) {
          app.clearMultiLabelDraft();
        }
        const cursor = refreshQueue(app, queueId);
        if (effect.status === "accepted") {
          app.motion.play("footer.accept", flash(80, "success"));
          app.sessionCounters.reviewed += 1;
        } else if (effect.status === "relabeled") {
          app.motion.play("footer.relabel", flash(80, "accent"));
          app.sessionCounters.reviewed += 1;
        } else if (effect.status === "rejected") {
          app.motion.play("footer.reject", flash(80, "danger"));
          app.sessionCounters.reviewed += 1;
        } else if (effect.status === "skipped") {
          app.sessionCounters.skipped += 1;
        }
        // Flash sidebar Counters row on the affected key so the reviewer
        // sees confirmation even when the main pane stays focused on the
        // band region. Motion gate makes this a no-op at 16 / mono.
        const key =
          effect.status === "skipped" ? "sidebar.counter.skipped" : "sidebar.counter.reviewed";
        app.motion.play(key, flash(200, "accent"));
        if (cursor.total === 0 && app.display.motion) {
          app.setFlash("queue complete", "success");
        }
        break;
      }
      case "updateNote":
        updateRecordNote(app.db, effect.recordId, effect.value);
        refreshQueue(app, queueId);
        break;
      case "markAssistantViewed":
        // ADR 0004: any decision committed for this record during the current
        // focus session is tagged `human+assistant`. Set is cleared on
        // record.next / record.prev so the next record starts fresh.
        app.viewedAssistant.add(effect.recordId);
        break;
      case "updateAssistantConfig": {
        // In-memory update so the next `i` press finds the assistant enabled
        // without restarting. Disk write is best-effort: failure flashes an
        // error but the session keeps the in-memory config — reviewer can
        // proceed and fix the file later. `configPath` is unset in unit
        // tests; the persistence branch is then a no-op.
        app.config.assistant = effect.assistant;
        // sessionApiKey is exported into process.env for the active session
        // only — never persisted to disk. Subsequent runs need the reviewer
        // to export the same env var in their shell (PRD §10.5).
        if (effect.sessionApiKey && effect.assistant.apiKeyEnvVar) {
          process.env[effect.assistant.apiKeyEnvVar] = effect.sessionApiKey;
          app.setFlash(
            `assistant: ready. Export ${effect.assistant.apiKeyEnvVar} in your shell for the next launch.`,
            "info",
          );
        }
        if (app.configPath) {
          try {
            writeFileSync(app.configPath, `${JSON.stringify(app.config, null, 2)}\n`);
          } catch (err) {
            app.setFlash(
              `assistant: failed to persist config (${err instanceof Error ? err.message : String(err)})`,
              "error",
            );
          }
        }
        break;
      }
      case "runCommand":
        if (!dispatchCommand) {
          app.setFlash(`palette: cannot dispatch ${effect.commandName} (no handler)`, "error");
          break;
        }
        void dispatchCommand(effect.commandName, effect.argument);
        break;
      case "drill":
        app.closeOverlay();
        switchQueue(app, effect.queueId);
        break;
      case "pushPaletteHistory":
        app.pushPaletteHistory(effect.entry);
        break;
      case "commitBatch": {
        // Single-session invariant: nothing else can mutate Review state
        // between bulk-confirm opening and Enter, so the `eligible` list
        // captured at overlay-open time is still authoritative here — no
        // re-validation needed. A future async path (background ingest,
        // multi-pane) would have to add that check back.
        const result = commitBatch(app, queueId, {
          action: effect.action,
          eligible: effect.eligible,
          label: effect.label,
        });
        if (!result.ok) {
          const msg =
            result.reason === "no-prediction"
              ? "Cannot bulk accept: at least one record has no prediction"
              : result.reason === "unknown-label"
                ? `Bulk relabel: label "${effect.label ?? ""}" not configured`
                : result.reason === "missing-label"
                  ? "Bulk relabel requires a label"
                  : "Bulk action: nothing to commit";
          app.setFlash(msg, "error");
          break;
        }
        const cursor = refreshQueue(app, queueId);
        const verb =
          effect.action === "accept"
            ? "accepted"
            : effect.action === "relabel"
              ? "relabeled"
              : effect.action === "reject"
                ? "rejected"
                : "skipped";
        app.setFlash(`Bulk: ${verb} ${result.affected} record(s)`, "success");
        if (effect.action !== "skip") app.sessionCounters.reviewed += result.affected;
        else app.sessionCounters.skipped += result.affected;
        if (cursor.total === 0 && app.display.motion) {
          app.setFlash("queue complete", "success");
        }
        break;
      }
      case "commitBulkUnmark": {
        const cleared = commitBulkUnmark(app, effect.eligible);
        refreshQueue(app, queueId);
        app.setFlash(`Bulk: cleared marked from ${cleared} record(s)`, "success");
        break;
      }
      case "scheduleFilterPreview":
        setTimeout(() => {
          const overlay = app.overlay;
          if (overlay?.kind !== "filter-builder") return;
          if (overlay.state.revision !== effect.revision) return;
          try {
            overlay.state = {
              ...overlay.state,
              preview: {
                kind: "ready",
                count: queueCount(app.db, predicateQueue(effect.predicate)),
              },
            };
          } catch (err) {
            overlay.state = {
              ...overlay.state,
              preview: { kind: "error", message: err instanceof Error ? err.message : String(err) },
            };
          }
          try {
            app.requestRender();
          } catch {
            // Tests can dispose the sqlite handle before a debounce fires.
          }
        }, 200);
        break;
    }
  }
}
