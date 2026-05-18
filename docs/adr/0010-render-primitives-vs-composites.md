# Render layer: primitives vs composites

- **Status:** Accepted
- **Date:** 2026-05-19

PRD §16.1 set a "4–6 small files" budget for `src/render/`. Today the directory holds ~30 files. The first read is "the wrapper outgrew its mandate." The actual shape is two tiers.

**Primitives** (`box`, `input`, `select`, `text`, `scrollbox`, `markdown`, `events`) are 2-line re-exports of `@opentui/core`. They exist as a hypothetical seam: a single adapter (OpenTUI) sits behind them; they become a real seam only when a second adapter lands. `src/render/index.ts` already documents the rule — do not extend with project-specific logic — because doing so would prematurely deepen a module whose purpose is forward-compatibility, not present behaviour.

**Composites** (`palette-view`, `theme`, `banded-record`, `filter-view`, `chrome/*`, `badge`, `label-chip`, `glyph-map`, `oklab`, `scrollbar`, `anim`, …) are first-class project view modules. They compose primitives with themes, `Segment`s, and types from CONTEXT.md. They are domain-coupled by design and uncapped.

PRD §16.1's budget was about primitives. Composites are first-class. This ADR records the distinction so future contributors don't read the file count as a smell.

## Decision rule for a new render file

- If it 1:1 wraps an OpenTUI renderable or re-exports an OpenTUI type, it's a **primitive**. Stay thin. Reach `@opentui/core` directly here, nowhere else.
- If it composes primitives with project knowledge (themes, label semantics, queue context, `Segment` types), it's a **composite**. May import OpenTUI styling primitives (`bg`, `fg`, `bold`, `StyledText`, `TextChunk`). No file-count cap.

## Leak policy

`screens/`, `overlay/`, `actions/` import only from `src/render/`. Two exceptions:

- `CliRenderer` — the renderer handle itself. Wrapping is meaningless; that _is_ the renderer. Imported directly in `src/cli/run.ts` and three screen entry points.
- `PasteEvent` — re-exported via `src/render/events.ts` as part of this ADR. `src/screens/review.ts` reads it from `src/render`, not `@opentui/core`.

After #77 lands and deletes `src/screens/stats.ts`, the only `@opentui/core` import outside `src/render/` and `src/cli/` will be `CliRenderer`.

## Consequences

- PRD §16.1's "4–6 small files" framing is superseded **for primitives only**. The primitives tier honours that budget; composites do not. PRD itself is not edited (ADR convention).
- Future render-file PRs have a clear decision rule. The author no longer has to defend the tier on every PR.
- Primitives remain hypothetical wrappers. When a second renderer adapter ever lands (alternate renderer, Ink, pi-tui, stable-snapshot harness), the existing primitives become real seams without further refactoring.
- New OpenTUI types or events that screens need go through a thin re-export in `src/render/`, not direct `@opentui/core` imports.
