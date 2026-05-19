# Keybinding presets

- **Status:** Accepted
- **Date:** 2026-05-20

LabelLens ships two built-in keymap presets (`simple` and `vim`), defaults to `simple`, and lets projects define custom presets via the config file. Resolution happens once at startup; resolvers everywhere — registry, footer, help, hints — read the post-resolve `Command.binding`.

## Context

Before this ADR, LabelLens shipped one vim-flavoured keymap (`j` / `k`, `g d`, `]` / `[`, `:`). The `keys` config was a flat per-command override map limited to single-character keys. New reviewers had no friendlier default; chord and modifier overrides were intentionally out of scope.

Issue #117 adds preset selection so new reviewers see arrow-key bindings without losing the option to keep the vim keymap. The config schema also needs richer override values (arrays, chords, modifiers) so custom presets can express today's defaults.

## Decision

Each command declares its bindings per preset as a `bindings: { vim, simple? }` field on the `Command` object. `simple` falls back to `vim` when omitted — a command with identical bindings in both presets writes only the `vim` entry.

`src/keymap/preset.ts` exposes `resolvePreset(commands, config.keys)`:

1. Pick the named preset (default `simple`).
2. Apply the preset's per-command bindings (built-in or custom).
3. Apply `config.keys.overrides` on top (last-write-wins).
4. Validate per-scope: collisions, malformed binding strings, unknown commands.

The result is a fresh `Command[]` with the post-resolve `binding` populated. Consumers (action footer, help overlay, dispatch, `reservedReviewKeys`) stay unchanged — they already read `Command.binding`.

The config schema replaces the flat `keys: { "<command>": "<key>" }` map with a typed object:

```ts
keys: { preset?, overrides?, presets? }
```

`additionalProperties: false` rejects legacy flat configs. The loader detects this shape and emits a targeted migration hint instead of a generic TypeBox error.

Overlay-local navigation (j/k vs arrow keys) is gated by a single `OverlayKeyPreset` value (`vim` | `simple`) carried on `AppContext.keyPreset` and threaded onto every `OverlayEvent` of kind `key`. Reducers call `isOverlayNext`/`isOverlayPrev` instead of pattern-matching key names directly.

## Consequences

- New configs (`labellens init`) write `keys: { preset: "simple" }`. Existing flat configs fail startup with a `Move under keys.overrides` hint.
- `keys.overrides` accepts the same string syntax as built-in bindings: plain chars, modifiers (`ctrl+x`), chords (`g d`), arrays.
- Custom presets inherit from the `vim` baseline for unspecified commands. Merge order is preset → overrides.
- `reservedReviewKeys` reads post-resolve `binding`, so switching presets or adding overrides re-derives the label-key reserved set without manual tracking.
- The committed `schema/labellens.config.schema.json` regenerates from the new TypeBox shape; a drift test guards against forgotten regeneration.
- Overlay-local keys are NOT individually configurable via `keys.overrides` in this iteration — the preset choice controls them collectively (vim keeps `j/k`/`ctrl+j` aliases; simple drops them). Per-command overlay bindings can be a follow-up if needed.
