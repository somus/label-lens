# `Cursor` is not a deepening target

- **Status:** Accepted
- **Date:** 2026-05-19

Architecture reviews periodically suggest extracting a `CursorRegistry` Module that owns the per-Queue `Map<QueueId, Cursor>` currently held in `AppContext` (`src/app/context.ts:256-270`). The suggestion is intuitive: CONTEXT.md says "one Cursor per Queue, persisted at app scope," and that persistence lives on AppContext rather than in a Module named for the concept.

This ADR records the rejection so future architecture-review tooling that re-suggests the refactor can be pointed here.

## Decision

`Cursor` (`src/cursor/cursor.ts`) stays at its current shape. No `CursorRegistry` is introduced. `AppContext.cursors` plus `getCursor` / `hasCursor` / `refreshAllCursors` continue to live on AppContext.

## Why

The Cursor Module is genuinely thin (~110 lines) but every method earns its keep:

- `refresh()` (`src/cursor/cursor.ts:61-73`) re-fetches the queue, re-anchors on the prior Record ID, and clamps the index. This is the load-bearing piece — without it, the "preserve focus across queue switches and re-ingests" invariant from CONTEXT.md would live at every callsite.
- `next` / `prev` / `seek` / `seekIndex` enforce bounds-clamp and emit `change` events. ~8 callers across `actions/` and `overlay/effects.ts` rely on those invariants.
- `window(beforeN, afterN)` slices for the context strip; one caller but the slice + focused-index math is non-trivial to inline correctly.
- `recordIds`, `current`, `total`, `position` are accessors with a stable contract.

A hypothetical `CursorRegistry` fails the LANGUAGE-of-architecture deletion test: removing it returns ~20 lines of registry plumbing to AppContext exactly where they live today. That is rearrangement, not deepening. Depth comes from leverage at the interface — the registry interface (`get`, `has`, `refreshAll`) wouldn't hide any complexity its absence would expose at N callers.

## Consequences

- The thin file-size of `src/cursor/cursor.ts` is not evidence of a deepening opportunity. It is the correct size.
- Future review tools that re-suggest a `CursorRegistry` extraction should be pointed at this ADR.
- Separately: `refreshAllCursors` has no production caller (#82). That is a wire-it-or-delete-it question for the method itself, not a reason to move the map.

## Related

Companion to the broader architecture-review pass: #75 (Queue predicate composition), #77 (Stats overlay + propagation), #79 (AssistantState union), #80 (render tier ADR), #82 (`refreshAllCursors` orphan API).
