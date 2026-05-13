/**
 * Capture perf measurements into test/perf/baselines.json.
 *
 * Runs `bun test test/perf/` with LABELLENS_PERF_CAPTURE=1; each perf test
 * appends a JSONL row to test/perf/.capture.json instead of asserting. We
 * read those rows, latest-wins per metric, and write a deterministic sorted
 * baselines.json. Capture file is deleted on success. The new baselines.json
 * must be committed manually — never automated.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const PERF_DIR = resolve(REPO_ROOT, "test/perf");
const CAPTURE_PATH = resolve(PERF_DIR, ".capture.json");
const BASELINES_PATH = resolve(PERF_DIR, "baselines.json");

if (existsSync(CAPTURE_PATH)) rmSync(CAPTURE_PATH);

// Perf tests use the .perf.ts suffix so `bun test` skips them by default —
// the cost would otherwise be paid on every pre-commit / pre-push run.
// Pass each file explicitly so bun runs them in path mode.
const perfFiles = readdirSync(PERF_DIR)
  .filter((f) => f.endsWith(".perf.ts"))
  .map((f) => `./test/perf/${f}`)
  .sort();
if (perfFiles.length === 0) {
  console.error("no *.perf.ts files under test/perf/");
  process.exit(1);
}

const result = spawnSync("bun", ["test", ...perfFiles], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: { ...process.env, LABELLENS_PERF_CAPTURE: "1" },
});
if (result.status !== 0) {
  console.error("perf capture run failed");
  process.exit(result.status ?? 1);
}

if (!existsSync(CAPTURE_PATH)) {
  console.error("no captures recorded — did any perf test call assertPerf()?");
  process.exit(1);
}

const lines = readFileSync(CAPTURE_PATH, "utf8").split("\n").filter(Boolean);
const merged: Record<string, number> = {};
for (const line of lines) {
  const row = JSON.parse(line) as { name: string; elapsed_ms: number };
  merged[row.name] = Math.round(row.elapsed_ms);
}

// Guard against partial-suite runs (test crashed mid-way, hang, etc.) writing
// truncated baselines that then get committed. The number of perf files is
// the source of truth — one assertPerf call per file by convention.
if (Object.keys(merged).length !== perfFiles.length) {
  console.error(
    `expected ${perfFiles.length} captured metrics (one per .perf.ts file), got ${Object.keys(merged).length}: ${Object.keys(merged).sort().join(", ")}`,
  );
  rmSync(CAPTURE_PATH);
  process.exit(1);
}

const sorted: Record<string, number> = {};
for (const key of Object.keys(merged).sort()) sorted[key] = merged[key]!;

writeFileSync(BASELINES_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
rmSync(CAPTURE_PATH);
console.log(`Wrote ${Object.keys(sorted).length} baselines to ${BASELINES_PATH}`);
console.log("Review with `git diff test/perf/baselines.json` and commit manually.");
