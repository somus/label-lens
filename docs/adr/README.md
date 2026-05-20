# Architecture Decision Records

Load-bearing design decisions for LabelLens. Each ADR captures the context, the decision, and the consequences. ADRs are immutable once accepted — they are not edited in place. A later ADR supersedes an earlier one.

## Lifecycle

- **Proposed** — draft, open for discussion.
- **Accepted** — binding for current behaviour.
- **Superseded** — replaced by a later ADR (linked in the header).

## Index

| #    | Title                                                                           | Status     |
| ---- | ------------------------------------------------------------------------------- | ---------- |
| [0001](./0001-content-hash-identity.md) | Record identity: content-hash by default | Accepted   |
| [0002](./0002-smart-reingest.md) | Re-ingest distinguishes text vs prediction changes | Accepted   |
| [0003](./0003-skipped-distinct-state.md) | `skipped` is a distinct review state | Accepted   |
| [0004](./0004-source-of-truth-includes-viewing.md) | Source-of-truth tags assistant viewing | Accepted   |
| [0005](./0005-drizzle-orm-with-bundled-migrations.md) | Drizzle ORM + bun:sqlite, bundled migrations | Accepted   |
| [0006](./0006-no-darwin-x64-prebuilt.md) | Don't ship a darwin-x64 prebuilt | Superseded |
| [0007](./0007-effective-review-entry.md) | `effective_reviews` as the current-state entry point | Accepted   |
| [0008](./0008-chrome-system.md) | Chrome system: status bar + action footer | Accepted   |
| [0009](./0009-assistant-inline-footer.md) | Assistant renders as an inline footer overlay | Accepted   |
| [0010](./0010-render-primitives-vs-composites.md) | Render layer: primitives vs composites | Accepted   |
| [0011](./0011-cursor-not-a-deepening-target.md) | `Cursor` is not a deepening target | Accepted   |
| [0012](./0012-where-dsl-excludes-orphans-by-default.md) | `where:` DSL excludes orphans by default | Accepted   |
| [0013](./0013-overlay-key-propagation.md) | Overlay key propagation | Accepted   |
| [0014](./0014-keybinding-presets.md) | Keybinding presets (simple/vim + custom) | Accepted   |
