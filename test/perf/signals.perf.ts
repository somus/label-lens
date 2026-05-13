import { test } from "bun:test";
import { runSignals } from "../../src/signals/run.ts";
import { openTmpStore } from "../util/tmp.ts";
import { assertPerf } from "./_util.ts";

test("signals pass on medium fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-signals-", ingest: "medium.jsonl" });
  const t0 = performance.now();
  runSignals(store.db);
  const elapsed = performance.now() - t0;
  assertPerf("signals_medium_ms", elapsed);
}, 60_000);
