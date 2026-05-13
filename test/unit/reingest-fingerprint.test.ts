import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeFingerprint,
  readFingerprint,
  writeFingerprint,
} from "../../src/ingest/fingerprint.ts";
import { openTmpStore, tmpdir } from "../util/tmp.ts";

describe("fingerprint", () => {
  test("round-trip: write + read returns the same fields", async () => {
    using store = await openTmpStore();
    writeFingerprint(store.db, "/abs/path/data.jsonl", {
      mtime: "1716480000000:1234",
      contentSha256: "abc",
    });
    const got = readFingerprint(store.db, "/abs/path/data.jsonl");
    expect(got?.mtime).toBe("1716480000000:1234");
    expect(got?.contentSha256).toBe("abc");
    expect(got?.ingestedAt.length).toBeGreaterThan(0);
  });

  test("readFingerprint returns null for unknown path", async () => {
    using store = await openTmpStore();
    expect(readFingerprint(store.db, "/nope")).toBeNull();
  });

  test("writeFingerprint upserts on existing source_path", async () => {
    using store = await openTmpStore();
    writeFingerprint(store.db, "/p", { mtime: "t1", contentSha256: "h1" });
    writeFingerprint(store.db, "/p", { mtime: "t2", contentSha256: "h2" });
    const got = readFingerprint(store.db, "/p");
    expect(got?.mtime).toBe("t2");
    expect(got?.contentSha256).toBe("h2");
  });

  test("computeFingerprint hashes file content and reads mtime + size", async () => {
    using dir = tmpdir({ prefix: "labellens-fp-" });
    const path = join(dir.path, "a.jsonl");
    writeFileSync(path, "hello\n");
    const fp = await computeFingerprint(path);
    expect(fp.contentSha256).toBe(
      "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
    );
    // Compound token: <mtimeMs>:<sizeBytes>. "hello\n" is 6 bytes.
    expect(fp.mtime).toMatch(/^\d+(?:\.\d+)?:6$/);
  });
});
