# Overlay key propagation

- **Status:** Accepted
- **Date:** 2026-05-19

Overlay reducers may opt in to propagating unclaimed keys back to the active screen's command path. This keeps global commands reachable while a read-only Overlay is open: `:` can still open the command palette, `?` can still open contextual help, and `q` can still quit when the current Overlay has not claimed that key.

## Context

Before this ADR, every Overlay swallowed every key it did not handle. That was correct for text-input Overlays, but wrong for read-only surfaces. Stats, Help, Guidelines, Picker, and Queue could trap the reviewer away from the same global commands that are otherwise available from Review.

Stats also had two implementations: a drillable full screen and a scroll-only Overlay fallback. The split duplicated row formatting and put drill behavior outside the Overlay reducer model used by other modal sub-surfaces.

## Decision

`ReduceResult` gains `propagated?: boolean`, defaulting to false. Reducers set it only on branches where the Overlay did not consume the key. The Review screen applies any reducer effects, then routes propagated keys through the same chord and command dispatch path it uses when no Overlay is open.

Stats is now a single Overlay implementation. Its reducer owns drillable rows, highlight movement, and drill effects. Pressing `Enter` on a drillable stat row closes the Overlay and switches to the queue represented by that aggregation.

Initial propagation policy:

- Stats, Help, Guidelines: propagate every unclaimed key.
- Picker and Queue: propagate keys that are not navigation, close, commit, filter/input, or accelerator keys.
- Note, Configure-assistant, Filter-builder, Palette, Assistant: capture all keys.

## Consequences

- A propagated command that opens a new Overlay replaces the current Overlay in the single `app.overlay` slot. Overlay stacking remains out of scope.
- Text-entry Overlays do not leak printable input into global commands.
- Stats no longer has a separate screen mount path; `t` and `:stats` both open the stats Overlay over Review.
