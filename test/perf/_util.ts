import { expect } from "bun:test";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const BASELINES_PATH = resolve(REPO_ROOT, "test/perf/baselines.json");
const CAPTURE_PATH = resolve(REPO_ROOT, "test/perf/.capture.json");
const REGRESSION_HEADROOM = 1.2;
const CAPTURE_MODE = process.env.LABELLENS_PERF_CAPTURE === "1";

type Baselines = Record<string, number>;

let cached: Baselines | null = null;
function loadBaselines(): Baselines {
  if (cached) return cached;
  if (!existsSync(BASELINES_PATH)) {
    cached = {};
    return cached;
  }
  cached = JSON.parse(readFileSync(BASELINES_PATH, "utf8")) as Baselines;
  return cached;
}

export function assertPerf(name: string, elapsedMs: number): void {
  if (CAPTURE_MODE) {
    appendFileSync(CAPTURE_PATH, `${JSON.stringify({ name, elapsed_ms: elapsedMs })}\n`);
    console.log(`[perf:capture] ${name} = ${elapsedMs.toFixed(1)}ms`);
    return;
  }
  const baselines = loadBaselines();
  const baseline = baselines[name];
  if (baseline === undefined) {
    throw new Error(`Missing baseline for "${name}". Run: bun scripts/update-perf-baselines.ts`);
  }
  const limit = baseline * REGRESSION_HEADROOM;
  console.log(
    `[perf] ${name} = ${elapsedMs.toFixed(1)}ms (baseline ${baseline}ms, limit ${limit.toFixed(1)}ms)`,
  );
  expect(elapsedMs).toBeLessThan(limit);
}
