# Assistant renders as an inline footer overlay, not a right-side panel

- **Status:** Accepted
- **Date:** 2026-05-18

PRD v2.9 §14.4 specified that the LLM assistant slides in from the right of the review screen, streams reasoning into a `MarkdownRenderable` mounted inside a `ScrollbackSurface`, and exposes `_stableBlockCount` per OpenTUI's streaming-markdown pattern. Slice 11 reverses that decision. The assistant renders as a short overlay strip pinned to the bottom of the review screen; one line in collapsed form (`LLM: <action> → <label> (<conf>)`) and an inline markdown expansion above the summary when the reviewer presses `Tab`.

The original design carried real cost. A 20-30% right panel collapses the candidate column on the 80-120 column terminals our wedge users have. `ScrollbackSurface` needs renderer-level mode changes (`screenMode: 'split-footer'`, `externalOutputMode: 'capture-stdout'`) and depends on the OpenTUI tree-sitter parser worker shipping alongside the binary at runtime. The footer surface uses the existing non-streaming `MarkdownRenderable` (already wired for guidelines) and reuses the same `modalBox` chrome as every other overlay — no special renderer plumbing.

The Tab-expand affordance keeps reasoning available without forcing it on screen. Reviewers who already know what they want commit (`Enter`) without ever expanding. Reviewers who need the why open it on demand. This matches the pattern of `g d` (doc view), `g g` (guidelines), `?` (help): one keystroke gates the heavyweight surface.

## Consequences

- PRD §14.4 ("Assistant panel" + streaming `MarkdownRenderable` + `ScrollbackSurface`) is superseded; that section is rewritten alongside this ADR.
- Slice 11 ships without `ScrollbackSurface` plumbing. If a future surface (e.g. a true scrollback-backed long-running conversation) needs it, that's its own slice.
- `Tab` reserved as the reasoning-expand toggle in the assistant overlay. Other overlays don't use `Tab`; revisit if that changes.
- Streaming tokens still flow through `streamToken` overlay events into the assistant state's `buffer`. The reducer flips `status: "streaming"` and the summary line shows a truncated preview of the live buffer. On `streamEnd` (carrying the parsed `AssistantResponse`), the reducer commits the structured fields and the summary settles.
- Side-panel rendering is **not** deferred to V1; it's discarded. If reviewers report needing simultaneous candidate + reasoning visibility, revisit with a fresh ADR.

## Test Coverage

The inline-footer design is backed by the following test files. Together they exercise the reducer, the streaming/cache provider envelope, the dispatch surface, and the configure flow:

- `test/e2e/assistant-flow.test.ts` — full configure → query → commit flow against the mounted review screen (e2e via `createTestRenderer`).
- `test/unit/overlay-assistant.test.ts` — pure-reducer tests for streaming events, key handling (Tab / Enter / Esc), and ADR 0004 viewed-tagging.
- `test/unit/overlay-configure-assistant.test.ts` — provider / auth / privacy step machine, paste filtering, env-var-per-provider matrix.
- `test/unit/open-assistant-command.test.ts` — dispatch-level tests covering enabled / disabled, error paths, and stale-token guards.
- `test/unit/assistant-provider.test.ts` — `queryAssistant` envelope: cache hit/miss, schema validation, `--local-only` + privacy gates, env-var fallback.
