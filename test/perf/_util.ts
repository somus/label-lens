import { expect } from "bun:test";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const BASELINES_PATH = resolve(REPO_ROOT, "test/perf/baselines.json");
const CAPTURE_PATH = resolve(REPO_ROOT, "test/perf/.capture.json");

export const REGRESSION_HEADROOM = 1.2;

export type PerfBaselines = Record<string, number>;

export type PerfCheck =
  | { kind: "missing"; name: string }
  | { kind: "pass"; name: string; baseline: number; limit: number; elapsedMs: number }
  | { kind: "fail"; name: string; baseline: number; limit: number; elapsedMs: number };

/**
 * Pure: compare an elapsed measurement against a baseline map. Exported so
 * unit tests can exercise the regression-detection logic without touching
 * the on-disk baselines file.
 */
export function checkPerf(name: string, elapsedMs: number, baselines: PerfBaselines): PerfCheck {
  const baseline = baselines[name];
  if (baseline === undefined) return { kind: "missing", name };
  const limit = baseline * REGRESSION_HEADROOM;
  return {
    kind: elapsedMs < limit ? "pass" : "fail",
    name,
    baseline,
    limit,
    elapsedMs,
  };
}

let cached: PerfBaselines | null = null;
function loadBaselines(): PerfBaselines {
  if (cached) return cached;
  if (!existsSync(BASELINES_PATH)) {
    cached = {};
    return cached;
  }
  cached = JSON.parse(readFileSync(BASELINES_PATH, "utf8")) as PerfBaselines;
  return cached;
}

export function assertPerf(name: string, elapsedMs: number): void {
  // Read env at call time, not module-import time — capture-mode runs share
  // a bun process with non-capture runs in some Bun versions, and an early
  // import would freeze the wrong value.
  if (process.env.LABELLENS_PERF_CAPTURE === "1") {
    appendFileSync(CAPTURE_PATH, `${JSON.stringify({ name, elapsed_ms: elapsedMs })}\n`);
    console.log(`[perf:capture] ${name} = ${elapsedMs.toFixed(1)}ms`);
    return;
  }

  const result = checkPerf(name, elapsedMs, loadBaselines());
  if (result.kind === "missing") {
    // Surface as a regular expect() failure so bun:test reports it as a
    // failed assertion rather than an uncaught throw.
    expect(`MISSING_BASELINE name=${name} — run: bun run perf:update-baselines`).toBe(
      "BASELINE_PRESENT",
    );
    return;
  }

  console.log(
    `[perf] ${name} = ${elapsedMs.toFixed(1)}ms (baseline ${result.baseline}ms, limit ${result.limit.toFixed(1)}ms)`,
  );
  expect(elapsedMs).toBeLessThan(result.limit);
}
