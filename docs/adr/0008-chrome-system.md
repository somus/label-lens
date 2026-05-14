# Chrome system: status bar + action footer on every screen

The TUI wraps every screen (review, queue, stats, doc-view, reingest-prompt) in a uniform Chrome layout: a top status bar plus a bottom action footer. The footer is derived from the active command registry filtered by scope — commands opt in with a `Command.footer` marker. Slice 1 of the May 2026 UX overhaul introduced this rule.

## Why

The previous TUI exposed every action through three invisible discovery paths: `?` help, `:` palette, `Shift+Q` queue picker. Each required the user to know one key to learn the others. New users hit a wall; even seasoned users guessed at queue identity from a thin top text line that disappeared on narrow terminals.

Persistent chrome makes orientation ambient. The user sees what screen they're on, what queue is active, what the next 3–5 actions are, and how progress is tracked — without pressing anything. Trading 2 vertical rows for that is correct for a review-loop tool (PRD §10.1: "fast keyboard-first review interface" — fast still wants discoverable).

## Contract

```
+-----------------------------------------------------------+   ← status bar (1 row)
| LabelLens · data.jsonl · Pending · 4/100  ·  Reviewed: 3 |
+-----------------------------------------------------------+
|                                                           |   ← spacer (1 row)
|                                                           |
|                       body (flex grow)                    |
|                                                           |
| [a] accept  [r] relabel  [x] reject  [s] skip  [:] palette|   ← action footer (1 row)
+-----------------------------------------------------------+
```

`CHROME_ROW_OVERHEAD = 3` (status bar + spacer + footer). Screens that compute their own viewport (doc-view paging) must subtract this constant rather than hardcoding the number.

## Tokens, not literals

Every color flows through `src/render/theme.ts`. Tokens are keyed by `ResolvedDisplay` capability × theme:

- truecolor / 256: full RGB token palette per light/dark.
- 16-color: ANSI named colors, mostly leaning on `dim`/`bold` attributes.
- mono: no `fg`, only attributes.

Adding a new tone requires touching one switch statement (`chunkFor` in `status-bar.ts`); the TypeScript exhaustiveness check fails closed.

## Footer derivation

Commands declare `footer: { label: string; order?: number; scopes?: Scope[] }`. The action footer collects every `Command` whose `scope` (or `footer.scopes`) intersects the current screen. Disabled commands (those whose `enabled(ctx)` returns false) stay visible but render in the `dim` tone (no text suffix) so the binding stays discoverable while the footer stays within its single-row budget — e.g. `[gd] doc` appears in classification mode rendered dimmed rather than vanishing. The `dim`-vs-`accent` contrast carries the signal across capabilities: on truecolor/256 it's a foreground-color difference, on 16/mono it's dim-attribute vs bold-attribute on the key. Issue #42.

`Chrome` (and `ActionFooter`) also support a registry-less mode for screens that mount before `AppContext` is wired: omit `app`/`scope`, pass `footerHint` directly, and the footer renders the hint verbatim. Used by the reingest prompt. Issue #43.

Primary review actions get footer markers: accept, reject, relabel, skip, note, palette, help, stats, queues, doc (boundary-only). Secondary keys (`m`, `u`, `j`, `]`, `[`) stay reachable through `?` help and the command palette, so the footer stays scannable at 100-column widths.

## Overlay hint ownership

When an overlay is open (palette, picker, note, help, guidelines, assistant), the chrome footer is replaced with hints derived from that overlay's own definition in `src/overlay/hints.ts`. Host screens never embed hint text. Adding a new overlay = one switch case in `hints.ts`; the chrome composition is unchanged.

Flash messages take temporary precedence over both derived hints and overlay hints — for the flash TTL, the footer renders `! <message>` instead.

## Narrow terminal degradation

Below 80 columns the StatusBar drops its right cluster (progress counters) and truncates the left cluster with an ellipsis. The action footer wraps to two lines via OpenTUI's `wrapMode: "word"`. We don't fight wrap — the primary actions stay legible even if the line breaks mid-set.

## Scope ownership

`app.activeScope` is set at the top of each screen's `renderState` rather than at mount time. A mid-mount exception can't leave a stale value behind — the next screen's first render overwrites it.

## Consequences

- The bottom 1 row is reserved on every screen. Screens with their own viewport math (doc-view) subtract `CHROME_ROW_OVERHEAD` from `terminalHeight` to compute body height.
- Adding a primary action means adding `footer:` to its Command definition. No host screen change.
- Adding an overlay means a switch case in `overlay/hints.ts`. No host screen change.
- Adding a tone means a switch case in `status-bar.ts`'s `chunkFor`. TypeScript enforces.
- A command's `disabledMessage` is flashed by `dispatch` only when the user attempts to invoke the disabled key; the footer itself surfaces just the tone (`dim`), not the reason.
- The reingest prompt mounts before the command registry exists and routes through `Chrome` in registry-less mode (issue #43). No separate inline layout to keep in sync.
- Future capability work (mouse, live theme switching mid-session, ambient sparklines, motion) hangs off the token + chrome system without touching screens.
