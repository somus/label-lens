import { test } from "bun:test";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { DEFAULT_FIELDS, fixturePath, openTmpStore } from "../util/tmp.ts";
import { assertPerf, measureMedian } from "./_util.ts";

test("ingest medium fixture within envelope", async () => {
  // Each sample requires a fresh empty store — ingest assumes the schema is
  // unpopulated. Opening a tmp store per iteration is the work being timed,
  // so the warmup + 3 samples take ~6s total against the 60s timeout.
  const elapsed = await measureMedian(async () => {
    using store = await openTmpStore({ prefix: "perf-ingest-" });
    const t0 = performance.now();
    await ingestFile(store.db, fixturePath("medium.jsonl"), DEFAULT_FIELDS);
    return performance.now() - t0;
  });
  assertPerf("ingest_medium_ms", elapsed);
}, 60_000);
