import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import * as schema from "./schema.ts";

export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

export type DbTransaction = SQLiteTransaction<
  "sync",
  void,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Anything you can pass to a query function — top-level db or an open transaction. */
export type TxOrDb = Db | DbTransaction;

export type MigrationEntry = { sql: string; timestamp: number; name: string };

/**
 * Bun's `--define` substitutes this global at compile time with the inline
 * journal. In dev (no --define) it stays undefined and we read migrations
 * from disk. Same pattern OpenCode uses for its compiled binary.
 */
declare const LABELLENS_MIGRATIONS: MigrationEntry[] | undefined;

function loadMigrationsFromDisk(dir: string): MigrationEntry[] {
  const journalPath = join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) return [];
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  return journal.entries
    .slice()
    .sort((a, b) => a.when - b.when)
    .map((e) => ({
      sql: readFileSync(join(dir, `${e.tag}.sql`), "utf-8"),
      timestamp: e.when,
      name: e.tag,
    }));
}

function resolveMigrations(): MigrationEntry[] {
  if (typeof LABELLENS_MIGRATIONS !== "undefined") return LABELLENS_MIGRATIONS;
  return loadMigrationsFromDisk(join(import.meta.dir, "../../migration"));
}

type DialectMigration = { sql: string[]; bps: boolean; folderMillis: number; hash: string };

function applyMigrations(db: Db, entries: MigrationEntry[]): void {
  if (entries.length === 0) return;
  const migrations: DialectMigration[] = entries.map((e) => ({
    sql: e.sql.split("--> statement-breakpoint"),
    bps: true,
    folderMillis: e.timestamp,
    hash: crypto.createHash("sha256").update(e.sql).digest("hex"),
  }));
  // Reach the internal worker drizzle's public migrate() wraps — lets us pass
  // pre-loaded migrations and skip folder reads.
  type Internal = {
    dialect: { migrate: (m: DialectMigration[], session: unknown, config: unknown) => void };
    session: unknown;
  };
  const internal = db as unknown as Internal;
  internal.dialect.migrate(migrations, internal.session, {
    migrationsTable: "__drizzle_migrations",
  });
}

function applyPragmas(sqlite: Database): void {
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA cache_size = -64000");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA wal_checkpoint(PASSIVE)");
}

export function openDb(path: string): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  applyPragmas(sqlite);
  const db = drizzle({ client: sqlite, schema, casing: "snake_case" });
  applyMigrations(db, resolveMigrations());
  return db;
}
