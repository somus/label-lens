# Test patterns

## Layout

```
test/
├── unit/        — pure-TS modules + storage tests against a real bun:sqlite
├── e2e/         — screens driven via @opentui/core/testing's createTestRenderer
├── perf/        — envelope assertions on shared fixtures (*.perf.ts; see #15)
├── fixtures/    — committed JSONL datasets (tiny + small/medium/large + boundary; see test/fixtures/README.md)
└── util/        — shared helpers (tmp-store, future fakes)
```

Perf tests use the `*.perf.ts` suffix so `bun test` (pre-commit / pre-push) skips them. Run them explicitly with `bun run test:perf`, and refresh baselines with `bun run perf:update-baselines`.

## tmp store with `using` disposal

Use `openTmpStore` for any test that needs a `bun:sqlite` database. The temp directory and the connection are cleaned up automatically when the `using` scope exits — no explicit teardown.

```ts
import { openTmpStore } from "../util/tmp.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";

test("scenario", async () => {
  using store = await openTmpStore({ ingest: "tiny.jsonl" });
  const pending = queueRecords(store.db, resolveQueue("pending").query);
  expect(pending.length).toBe(10);
});
```

Options:

- `ingest?: string` — fixture filename under `test/fixtures/` to ingest after `applySchema`.
- `fields?: FieldMap` — override the default field map (text/prediction/confidence/source/context_*).
- `prefix?: string` — temp-dir prefix (default `labellens-store-`).

For tests that don't need a db, `tmpdir({ prefix })` returns just `{ path }` with the same disposal semantics.

## Custom-size fixtures via the shared generator

Need an in-memory dataset of N records without writing a new fixture file? Import the deterministic generator directly:

```ts
import { generateClassification, generateBoundary } from "../../scripts/fixtures/generator.ts";

const { records, truth } = generateClassification({ seed: 7, count: 250 });
const boundary = generateBoundary({ size: "large", seed: 1 });
```

Same mulberry32 PRNG that produces the committed fixtures. `truth` is an index-aligned label array (vendor truth for classification; hand-crafted line truth for boundary) — handy for source-accuracy assertions. Only use the committed JSONL fixtures when a test needs to round-trip through `ingestFile`.

## Keymap engine — pure unit tests

The keymap engine is zero-dep TypeScript. Test it as a string-in / value-out function — no renderer, no db, no fixtures.

```ts
import { resolve } from "../../src/keymap/engine.ts";
expect(resolve(bindings, "review", { name: "a" })).toBe("record.accept");
```

## Dispatch — Command + AppContext

Build a registry from `Command` objects, dispatch against an `AppContext` (built via `createAppContext`). Dispatcher catches throws and writes to `ctx.flash` — assert against that, not via try/catch in the test.

```ts
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";

const registry = buildRegistry([myCmd]);
const result = await dispatch(registry, "review", ctx, "my.action");
expect(result.kind).toBe("ok");
```

## Overlays — pure reducer + effects interpreter

Each Overlay (`src/overlay/{picker,note,assistant}.ts`) exposes a pure reducer `(state, OverlayEvent) → { overlay, effects[] }`. Test the reducer string-in / value-out — no db, no renderer. Test the effects interpreter (`src/overlay/effects.ts`) against a real `bun:sqlite` AppContext. Don't drive overlays through the screen for unit coverage; the screen e2e harness exercises the wiring separately.

```ts
import { reducePicker, openPicker } from "../../src/overlay/picker.ts";

const s0 = openPicker({ recordId: "rec-1", allLabels: ["food", "travel"], predicted: "food" });
const r = reducePicker(s0, { kind: "commit" });
expect(r.effects).toContainEqual({
  kind: "commitDecision",
  recordId: "rec-1",
  status: "accepted",
  finalLabel: "food",
  prevLabel: null,
  sourceOfTruth: "human",
});
```

```ts
import { applyEffects } from "../../src/overlay/effects.ts";

applyEffects(app, "pending", [{ kind: "updateNote", recordId, value: "todo" }]);
expect(currentReview(store.db, recordId)).toBeNull(); // unchanged
```

Per ADR 0007, never re-derive the "non-undone, non-compensated" predicate inline in tests — query `effective_reviews` (via `currentReview` / `latestReview`) or assert through it.

## Screens (e2e) — `createTestRenderer` + `mockInput` + `captureCharFrame`

OpenTUI ships `@opentui/core/testing`. `createTestRenderer({ width, height })` returns a renderer + `mockInput.pressKey('a')` + `await renderOnce()` + `captureCharFrame()` (rendered text, ANSI stripped). Mount the screen on the test renderer, drive keys, snapshot the frame, assert against the db directly.

```ts
const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
  width: 100,
  height: 24,
});

const app = createAppContext({ db, config, requestRender: () => {}, onQuit: () => {} });
mountReviewScreen({ renderer, app });
await renderOnce();

mockInput.pressKey("a");
await renderOnce();

expect(captureCharFrame()).toMatchSnapshot();
```

**Quit injection.** Screens that exit the process accept an `onQuit` callback. Tests pass a flag-setting closure so the test process doesn't die.

## Snapshots

Char-frame snapshots live alongside the test as `__snapshots__/<file>.snap`. Use `toMatchSnapshot()` for full-layout regression detection; pair with explicit `toContain(...)` checks for the invariants you care about most (so a layout shift updates the snapshot but the meaningful assertion still tells you what changed).

Update snapshots intentionally:

```sh
bun test --update-snapshots
```

Review the diff before committing — a snapshot churn that wasn't intended is a real regression.

## Performance

`test/perf/*.perf.ts` runs the envelope from PRD §16.1 (queue switch <200ms at 50K, ingest <30s at 10K, etc.). Shared fixtures live in `test/fixtures/` and are deterministic (issue #14). Baselines committed at `test/perf/baselines.json`; CI fails on >20% regression. Refresh with `bun run perf:update-baselines` and commit the diff manually. The `perf` job in `.github/workflows/ci.yml` enforces this on every PR.

## SSH path

The test renderer doesn't simulate transport loss. Manually verify any rendering changes over a real SSH session before declaring a slice done. See PRD §14.5 test matrix and `docs/releases/TEMPLATE.md` for the per-release smoke checklist.

## Don't

- Don't mock `bun:sqlite` or drizzle. Use the real db via `openTmpStore` — `applySchema`-equivalent migrations run automatically on `openDb()`. ADR 0001 + the rest of the data model rely on real SQL semantics; ADR 0005 keeps the runtime path identical between tests and prod.
- Don't share DB state across tests. Each test gets its own `using store = …`.
- Don't hardcode `/tmp/...` paths. Use `tmpdir()` so cleanup is automatic.
- Don't import from `bun:sqlite` directly in app code or tests — go through `Db` / `TxOrDb` from `src/store/db.ts` so types stay aligned with the schema.
