import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FieldMap } from "../../src/config/inference.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { type Db, openDb } from "../../src/store/db.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");

export const DEFAULT_FIELDS: FieldMap = {
  text: "text",
  prediction: "prediction",
  confidence: "confidence",
  source: "source",
  context_before: "context_before",
  context_after: "context_after",
};

export function fixturePath(name: string): string {
  return join(REPO_ROOT, "test", "fixtures", name);
}

export type TmpDir = {
  path: string;
  [Symbol.dispose](): void;
};

export function tmpdir(options: { prefix?: string } = {}): TmpDir {
  const path = mkdtempSync(join(osTmpdir(), options.prefix ?? "labellens-"));
  return {
    path,
    [Symbol.dispose]() {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export type TmpStore = {
  path: string;
  dbPath: string;
  db: Db;
  [Symbol.dispose](): void;
};

export type TmpStoreOptions = {
  prefix?: string;
  ingest?: string;
  fields?: FieldMap;
};

export async function openTmpStore(options: TmpStoreOptions = {}): Promise<TmpStore> {
  const dir = tmpdir({ prefix: options.prefix ?? "labellens-store-" });
  const dbPath = join(dir.path, "state.db");
  const db = openDb(dbPath);

  if (options.ingest) {
    await ingestFile(db, fixturePath(options.ingest), options.fields ?? DEFAULT_FIELDS);
  }

  return {
    path: dir.path,
    dbPath,
    db,
    [Symbol.dispose]() {
      db.$client.close();
      dir[Symbol.dispose]();
    },
  };
}
