# Test patterns

## Layout

```
test/
├── unit/        — pure-TS modules + storage tests against a real bun:sqlite
├── e2e/         — screens driven via @opentui/core/testing's createTestRenderer
├── perf/        — envelope assertions on shared fixtures (issue #15)
├── fixtures/    — committed JSONL datasets (tiny.jsonl now; #14 adds the rest)
└── util/        — shared helpers (tmp-store, future fakes)
```

## tmp store with `using` disposal

Use `openTmpStore` for any test that needs a `bun:sqlite` database. The temp directory and the connection are cleaned up automatically when the `using` scope exits — no explicit teardown.

```ts
import { openTmpStore } from "../util/tmp.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/builtin-queues.ts";

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

`test/perf/` runs the envelope from PRD §16.1 (queue switch <200ms at 50K, ingest <30s at 10K, etc.). Shared fixtures live in `test/fixtures/` and are deterministic (issue #14). Baselines committed at `test/perf/baselines.json`; CI fails on >20% regression.

## SSH path

The test renderer doesn't simulate transport loss. Manually verify any rendering changes over a real SSH session before declaring a slice done. See PRD §14.5 test matrix and `docs/releases/TEMPLATE.md` for the per-release smoke checklist.

## Don't

- Don't mock `bun:sqlite`. Use the real one via `openTmpStore`. ADR 0001 + the rest of the data model rely on real SQL semantics.
- Don't share DB state across tests. Each test gets its own `using store = …`.
- Don't hardcode `/tmp/...` paths. Use `tmpdir()` so cleanup is automatic.
