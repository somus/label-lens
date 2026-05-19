import { test } from "bun:test";
import { runSignals } from "../../src/signals/run.ts";
import { purgeComputedIssues } from "../../src/store/issues.ts";
import { openTmpStore } from "../util/tmp.ts";
import { assertPerf, measureMedian } from "./_util.ts";

test("signals pass on medium fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-signals-", ingest: "medium.jsonl" });
  // `runSignals` already purges computed issues internally, but the explicit
  // purge per iteration makes it cheap to keep the measurement window tight
  // and confirms each sample starts from the same state.
  const elapsed = await measureMedian(async () => {
    purgeComputedIssues(store.db);
    const t0 = performance.now();
    runSignals(store.db);
    return performance.now() - t0;
  });
  assertPerf("signals_medium_ms", elapsed);
}, 60_000);
