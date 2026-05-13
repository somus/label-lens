import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { TxOrDb } from "../store/db.ts";
import { type IngestFingerprint, ingestFingerprints } from "../store/schema.ts";

export type Fingerprint = {
  /**
   * Compound `<mtimeMs>:<sizeBytes>` token. mtimeMs is millisecond-precision
   * epoch (FAT32 / network mounts can round to 2 seconds, so we include file
   * size as a secondary discriminator). Only used as a fast-path: contentSha256
   * is the real authority on content equality.
   */
  mtime: string;
  contentSha256: string;
};

export function readFingerprint(db: TxOrDb, sourcePath: string): IngestFingerprint | null {
  const row = db
    .select()
    .from(ingestFingerprints)
    .where(eq(ingestFingerprints.sourcePath, sourcePath))
    .all()[0];
  return row ?? null;
}

export function writeFingerprint(db: TxOrDb, sourcePath: string, fp: Fingerprint): void {
  const ingestedAt = new Date().toISOString();
  db.insert(ingestFingerprints)
    .values({
      sourcePath,
      mtime: fp.mtime,
      contentSha256: fp.contentSha256,
      ingestedAt,
    })
    .onConflictDoUpdate({
      target: ingestFingerprints.sourcePath,
      set: { mtime: fp.mtime, contentSha256: fp.contentSha256, ingestedAt },
    })
    .run();
}

/**
 * Streams the file once to compute its sha256. mtime + size form a cheap
 * fast-path token; the sha256 is the source of truth for content equality.
 */
export async function computeFingerprint(filePath: string): Promise<Fingerprint> {
  const hash = createHash("sha256");
  const stream = Bun.file(filePath).stream();
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
  }
  const stat = statSync(filePath);
  return {
    mtime: `${stat.mtimeMs}:${stat.size}`,
    contentSha256: hash.digest("hex"),
  };
}
