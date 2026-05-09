# Drizzle ORM + bun:sqlite, with migrations bundled into the compiled binary

The storage layer uses `drizzle-orm/bun-sqlite` for schema definitions, query building, and a generated migration system (drizzle-kit). The schema in `src/store/schema.ts` is the source of truth; `drizzle-kit generate` emits SQL files under `migration/`. At runtime, `openDb()` runs the migration journal automatically — reading from disk in dev, from the `LABELLENS_MIGRATIONS` global injected via Bun's `--define` in the compiled binary.

The window-function view `records_with_primary` (PRD §11.4 primary-prediction selection) lives in a hand-authored `--custom` migration because drizzle-kit doesn't emit window functions; the schema declares it via `sqliteView(...).existing()` so query builder calls remain type-safe. Pragmas applied at every db open match OpenCode's full set: `WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `cache_size=-64000`, `foreign_keys=ON`, `wal_checkpoint(PASSIVE)`.

drizzle-kit studio + bun:sqlite is unsupported upstream as of 2026-01 (drizzle-team/drizzle-orm#1520, #4350). better-sqlite3 fails to load in Bun (oven-sh/bun#4290). `@libsql/client` is the dev-only escape hatch — it speaks the same on-disk SQLite format, so studio reads the same db file the runtime writes. PRD §16's "no native modules besides bun:sqlite" rule is preserved because @libsql/client is a `devDependency` and never bundled into the compiled binary.

## Considered alternatives

- **Stay with raw `bun:sqlite` + hand-written DDL** — rejected: weak type safety on row mirroring, and schema evolution post-MVP would be hand-rolled migrations. The deepening from PR #16 was a good last step before this.
- **Drizzle with `drizzle-orm/libsql` driver at runtime** — rejected: async-only API would force every store call site to `await`, including the synchronous Cursor + dispatch paths.
- **`nounder/bun-better-sqlite3` shim** — rejected: community shim, single-author, unconfirmed for studio. Adds an indirection layer. `@libsql/client` is the better-supported alternative.
- **No drizzle-studio, use sqlite3 / litecli** — rejected as the default but kept as a fallback. Studio is genuinely useful for dev DB browsing; the `@libsql/client` cost is small.

## Consequences

- Schema changes go through `bun run db:generate -- --name <slug>`. Custom migrations (views, triggers, raw DDL) need `--custom`.
- The compiled binary embeds migrations at build time via `--define`. New migration files require a fresh `bun run build:bin`.
- `openDb()` always runs `applyMigrations()` synchronously — adds a few ms to startup but keeps the "open the db, get a usable connection" contract.
- `db:studio` runs as `LL_DEV_DIR=<dir> bun run db:studio`; UI hosted at https://local.drizzle.studio (proxies to localhost:4983).
- Queue definitions live as `QueueDefinition.where: SQL` (drizzle `sql\`...\`` template chunks) instead of raw strings. Slice 5's `where:<expr>` parser will produce these chunks rather than string concat.
