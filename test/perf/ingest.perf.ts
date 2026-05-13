import { test } from "bun:test";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { DEFAULT_FIELDS, fixturePath, openTmpStore } from "../util/tmp.ts";
import { assertPerf } from "./_util.ts";

test("ingest medium fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-ingest-" });
  const t0 = performance.now();
  await ingestFile(store.db, fixturePath("medium.jsonl"), DEFAULT_FIELDS);
  const elapsed = performance.now() - t0;
  assertPerf("ingest_medium_ms", elapsed);
}, 60_000);
