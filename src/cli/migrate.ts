import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { openDb } from "../store/db.ts";
import { predictions, reviews } from "../store/schema.ts";

function countReferences(db: ReturnType<typeof openDb>, label: string): number {
  const rows = db.all<{ n: number }>(sql`
    SELECT
      (SELECT COUNT(*) FROM ${predictions} WHERE ${predictions.label} = ${label}) +
      (SELECT COUNT(*) FROM ${reviews} WHERE ${reviews.finalLabel} = ${label}) +
      (SELECT COUNT(*) FROM ${reviews} WHERE ${reviews.prevLabel} = ${label}) AS n
  `);
  return rows[0]?.n ?? 0;
}

export type RunMigrateCliArgs = {
  args: string[];
  cwd: string;
};

export class MigrateCliError extends Error {
  readonly code: number;
  constructor(message: string, code = 2) {
    super(message);
    this.code = code;
    this.name = "MigrateCliError";
  }
}

export async function runMigrateCli({ args, cwd }: RunMigrateCliArgs): Promise<void> {
  const renameIdx = args.indexOf("--rename");
  if (renameIdx === -1) {
    throw new MigrateCliError(`--rename <old>:<new> is required\n\n${usageText()}`);
  }
  const spec = args[renameIdx + 1];
  if (!spec) {
    throw new MigrateCliError(`--rename requires <old>:<new>\n\n${usageText()}`);
  }
  const colon = spec.indexOf(":");
  if (colon === -1) {
    throw new MigrateCliError(`--rename expected <old>:<new>, got '${spec}'`);
  }
  const oldLabel = spec.slice(0, colon);
  const newLabel = spec.slice(colon + 1);

  const configPath = resolve(cwd, "labellens.config.json");
  if (!existsSync(configPath)) {
    throw new MigrateCliError(
      `no labellens.config.json found in ${cwd}. Run 'labellens init <file.jsonl>' first.`,
    );
  }
  const stateDir = join(dirname(configPath), ".labellens");
  const stateDbPath = join(stateDir, "state.db");
  if (!existsSync(stateDbPath)) {
    throw new MigrateCliError(
      `no review state found at ${stateDbPath}. Run 'labellens' first to ingest.`,
    );
  }

  const db = openDb(stateDbPath);
  try {
    const refs = countReferences(db, oldLabel);
    if (refs === 0) {
      console.log(`migrate: no records reference '${oldLabel}'; nothing to do`);
      return;
    }

    let bakDir = `${stateDir}.bak`;
    if (existsSync(bakDir)) bakDir = `${stateDir}.bak-${Date.now()}`;
    cpSync(stateDir, bakDir, { recursive: true });

    db.transaction((tx) => {
      tx.update(predictions).set({ label: newLabel }).where(eq(predictions.label, oldLabel)).run();
      tx.update(reviews)
        .set({ finalLabel: newLabel })
        .where(eq(reviews.finalLabel, oldLabel))
        .run();
      tx.update(reviews).set({ prevLabel: newLabel }).where(eq(reviews.prevLabel, oldLabel)).run();
    });
    console.log(
      `migrate: renamed '${oldLabel}' -> '${newLabel}' (${refs} reference${refs === 1 ? "" : "s"}); backup at ${bakDir}`,
    );
  } finally {
    db.$client.close();
  }
}

export function usageText(): string {
  return `usage: labellens migrate --rename <old>:<new>

Atomically rewrites every reference to <old> as <new> across:
  - predictions.label
  - reviews.final_label
  - reviews.prev_label

The raw JSON payloads (records.raw, predictions.raw) are preserved
as-is — only the parsed-out label columns change.

Before any write, .labellens/ is copied to .labellens.bak/ (or
.labellens.bak-<ts>/ if the first slot is taken). To roll back:

    rm -rf .labellens && mv .labellens.bak .labellens

Idempotent: re-running with the same arguments exits 0 with no
backup once <old> no longer appears.

MVP scope: scalar label columns only. Multi-label arrays (PRD §10.7)
will be supported in V1.`;
}
