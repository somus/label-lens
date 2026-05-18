# How-to: rename a label across a reviewed dataset

You decided `shopping` should be `utility` (or `policy:spam` should be `ham`). Your reviewed records reference the old name; ingest will refuse to load until they match `config.labels`.

`labellens migrate --rename` rewrites the DB in place. Source JSONL untouched.

<a href="../media/migrate.webm">
  <img src="../media/migrate.gif" alt="Renaming a label with migrate and checking the stats report" width="800">
</a>

## One command

```sh
labellens migrate --rename shopping:utility
```

Output:

```
migrate: renamed 'shopping' -> 'utility' (rewrote 14 rows); backup at /tmp/labellens-migrate-…/.labellens.bak
```

Then remove `shopping` from `config.labels` and relaunch:

```sh
labellens
```

If you forget to update `config.labels`, LabelLens won't refuse the new name — but the orphan label still in the config will sit unused.

## Multiple renames

Run the command repeatedly:

```sh
labellens migrate --rename shopping:utility
labellens migrate --rename food:meal
```

Each invocation creates its own backup.

## Colon-namespaced labels

Split on the **last** colon:

```sh
labellens migrate --rename policy:spam:ham
# → renames 'policy:spam' to 'ham'

labellens migrate --rename policy:spam:policy:ham
# → renames 'policy:spam' to 'policy:ham'
```

The to-label cannot itself contain a colon (would be ambiguous to parse).

## Self-rename (rebuild the rows)

You can rename a label to itself. Rewrites the rows without changing the value:

```sh
labellens migrate --rename food:food
```

Useful if you want a fresh backup before doing something risky.

## Recovery

Backups land at `<config-dir>/.labellens/.bak` (the directory varies — the migrate output prints the absolute path). To restore:

```sh
cp /path/to/.labellens.bak .labellens/state.db
```

The file is a single SQLite DB. Atomic copy is safe between sessions.

## What migrate does not do

- **Doesn't touch source JSONL.** Parsed prediction and review label columns in `.labellens/state.db` are remapped together; raw input rows and prediction source metadata are preserved.
- **Doesn't merge two labels.** If both `shopping` and `clothing` should become `apparel`, run two migrations:

  ```sh
  labellens migrate --rename shopping:apparel
  labellens migrate --rename clothing:apparel
  ```

- **Doesn't refresh signals.** If a label rename affects which records flag as `source_disagreement`, re-launch and the signals pass on next ingest will recompute.

## Verifying

After migrate:

```
labellens
t                           # stats
↓ to By label
Enter on the new label      # drill into by-label:utility queue
```

Confirms migrated records landed under the new name.
