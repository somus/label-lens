# Smart-pending learns from this session

When `navigation.smartNext` is on, `j` / `k` walk the `smart-pending` Queue instead of `pending`. That Queue ranks Records by **Issue score magnitude × per-type weight**. The weights are not static — they are learned from the `relabeled` decisions the reviewer commits **in the current launch** and reset when the app exits.

Issue #93 introduced this. The goal: when one built-in Issue type is producing most of the relabels for *this dataset, this session*, surface its Records earlier. When another type is mostly producing accepts, push it down so the reviewer's time stays on the productive signal.

## The shape

Three built-in Issue types are eligible for learning:

- `low_confidence`
- `source_disagreement`
- `exact_duplicate`

Imported Issues (anything whose `source` is not the `labellens:computed` sentinel) are **never learned**. They contribute at a fixed weight of 1.0. The reviewer's upstream tooling already encoded its own opinion in the imported `score`; LabelLens does not second-guess it.

The smart-pending score is:

```
score(R) = Σ_built-in  w(type) × max(score, 0)
        + Σ_imported  1.0     × max(score, 0)
```

Ties fall back to confidence ASC (NULL last) then row-index ASC, matching the legacy ordering so reviewers don't see jittery reorderings within an unscored tier.

## When weights change

Weights stay at `1.0` for every type until **both** conditions hold:

1. **Cold-start cleared.** `totalDecisions ≥ navigation.rerankColdStart` (default 50).
2. **Interval boundary.** `totalDecisions % navigation.rerankInterval === 0` (default 25).

The first refresh after both conditions hold installs the learned weights. Subsequent refreshes happen every `rerankInterval` decisions thereafter. Between refreshes the cached weight map is returned verbatim — the smart-pending Cursor's `refresh()` re-invokes the query factory but the weight numbers don't move every commit. This keeps the order stable enough for the reviewer to predict but responsive enough that the signal flows through.

The refresh applies on the **next decision-driven cursor refresh**. The Cursor's focus-preservation logic (`Cursor.refresh` snaps back to the previously focused Record id) means a rerank cannot move the reviewer's current row, only what comes before and after.

## The lift formula

For each built-in type T with `relabelsForT` relabels out of `totalForT` decisions that carried T, against the session-wide `totalRelabels / totalDecisions` baseline:

```
α          = smoothing (Laplace), default 1
baseline   = (totalRelabels + α) / (totalDecisions + α)
rateForT   = (relabelsForT  + α) / (totalForT      + α)
weightForT = clamp(rateForT / baseline, 0.25, 3.0)
```

The clamp is non-negotiable: a noisy first 50 decisions could push a type's lift to `0` (relabels never happened to coincide with it) or `∞` (every relabel did). Both produce a smart-pending order that's actively worse than the cold-start ordering. The `[0.25, 3.0]` band lets learning steer the ranking without letting any one type vanish or dominate.

Types with `totalForT === 0` (the reviewer hasn't seen this type at all yet) stay at `1.0` regardless of the lift on others.

## What feeds the sampler

Only **`accepted | relabeled | rejected`** decisions feed the sampler. The denominator counts every committed annotation; the numerator counts only relabels. So the per-type weight tracks the *relabel rate* of Records carrying that type, lifted against the session-wide baseline relabel rate.

`skipped` is excluded by design. ADR 0003 makes skipped a distinct review state — a deferred Record, not a reviewed one. A skip reveals nothing about whether the Issue type is a good filter; counting it would dilute the baseline without informing it.

`pending` and `undone` are also out of scope. Pending Records have no review row; `undone` rows are compensating entries that the audit log keeps (PRD §11.4) but the sampler never re-samples.

## Undo

`record.undo` walks the same path the original commit took, in reverse. It reads the latest effective review (ADR 0007), looks up the built-in Issue types on the Record at undo time, and calls `smartLearning.reverseDecision` on the **in-memory counters** — never re-querying the database for past counts. The compensating `undone` review row is then written normally.

This works because:

- The `issues` table is immutable post-ingest under normal use (`purgeComputedIssues` only runs on signal re-runs, which the user triggers explicitly).
- Counters are integer-precise. `reverseDecision` is the strict inverse of `recordDecision` for the same status + types.
- The cache may not reflect the reversal until the next rerank-interval boundary — by design. Treating each undo as a rerank tick would let a reviewer's tap-undo-tap-undo cadence churn the score expression on every keypress.

## Why session-local

Persisting learned weights to `state.db` was rejected. Each launch is a different reviewer mindset / dataset slice / time of day. A weight that lifted `low_confidence` to `2.7` yesterday because the model was producing bad confidence-clamped predictions may be the exact wrong weight today after a model rev. Session-local resets pin the learning to its actual evidence.

Reviewers who want deterministic ordering have escape hatches: `shift+j` / `shift+k` walk document order, and every queue except `smart-pending` is unaffected.

## Configuration

Two public knobs in `navigation`:

- `rerankInterval` (default 25) — decisions between weight refreshes.
- `rerankColdStart` (default 50) — minimum decisions before weights leave 1.0.

Both are read once at app launch and immutable for the session. See [docs/reference/config.md](../reference/config.md#navigation) for the schema entry.

## Code seams

- `src/learning/smart-learning.ts` — pure session-local sampler. No `bun:sqlite`, no AppContext dependency.
- `src/store/queues/smart-pending.ts` — `buildSmartPendingQuery({ weights, importedWeight? })`. Default export wraps the all-1.0 cold-start variant.
- `src/cursor/cursor.ts` — `openCursor(db, queueId, factory?)` lets the smart-pending cursor re-invoke a `QueueDefinition` factory on every refresh, picking up new weights.
- `src/app/context.ts` — `createAppContext` instantiates `smartLearning` and registers the factory that closes over its `weights()` call.
- `src/overlay/effects.ts` `commitDecision` — samples before `insertReview`.
- `src/actions/record/undo.ts` — samples before `insertUndoEntry`.

## Related

- [ADR 0003](../adr/0003-skipped-distinct-state.md) — why `skipped` never feeds the sampler.
- [ADR 0007](../adr/0007-effective-review-entry.md) — effective-review semantics that `latestReview` uses.
- [Effective Review](./effective-review.md) — how undo + audit log interact at the SQL layer.
