# How-to: bulk-relabel a class of records

You realised that everything tagged `shopping` should actually be `utility`. Three paths depending on scale.

<a href="../media/bulk-relabel.webm">
  <img src="../media/bulk-relabel.gif" alt="Filtering to a label queue and relabeling each matching record" width="800">
</a>

## Path A — visual sweep via queue

Best when the rename is judgment-dependent (some `shopping` records really are shopping).

```
[       # cycle to by-label:shopping  (or :by-label shopping via palette)
1       # commit `food` (your first label) for the first record
j       # next
1
…
```

Faster: configure per-label keys (`config.labels[].key = "u"` for `utility`) — then a single `u` press relabels.

## Path B — mark + skim

Best when you want to inspect a subset then act in one pass.

```
:by-label shopping       # narrow to shopping
j m j m j m              # mark candidates
[                        # cycle to marked queue
1 j 1 j 1                # commit replacement on each
```

V1 will add `:bulk relabel <label>` against marked. In MVP the manual loop is the workflow.

## Path C — `labellens migrate --rename`

Best when **every** record tagged `shopping` should become `utility`, no exceptions, and the rename is a configuration change (you removed `shopping` from `config.labels`).

```sh
labellens migrate --rename shopping:utility
```

This:

1. Backs up `.labellens/state.db` to `.labellens/.bak`.
2. Rewrites stored parsed label columns from `shopping` to `utility` across predictions and reviews.
3. Prints the row count it rewrote.

The source JSONL is never touched. Parsed prediction and review label columns in `.labellens/state.db` are remapped together so queues, stats, and validation agree after the rename.

Use migrate when the label is being **renamed**, not when individual records need a different decision. Once you've migrated, remove `shopping` from `config.labels` and re-launch — LabelLens validates that every label referenced in stored reviews is still configured (exits 2 otherwise).

## Edge case: colon-namespaced labels

`labellens migrate --rename` splits on the **last** colon. So:

```sh
labellens migrate --rename policy:spam:ham
```

renames `policy:spam` → `ham`, not `policy` → `spam:ham`. Useful when your label set uses prefix-namespaced strings like `policy:spam`, `policy:phishing`, etc.

## Undoing

Each `migrate` invocation writes a fresh backup. Restore by:

```sh
cp .labellens/.bak .labellens/state.db
```

(`.labellens/state.db` is a single SQLite file; there's no journal to worry about between sessions.)

## Verifying

After migration:

```
labellens
t                  # stats overlay
```

The "By label" rows should show the new distribution. Drill into `by-label:utility` to confirm the migrated records landed.
