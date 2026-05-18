#!/usr/bin/env bun
/**
 * Fail the build if any file under `src/**` imports from `dev/**`.
 *
 * Dev-only tooling (seeding, fixture generation, perf baselines) lives in
 * `dev/`. It must never reach the production binary. `src/main.ts` is the
 * sole compile entry, so reachability via Bun's tree-shaking already keeps
 * `dev/` out of the shipped binary — this check is the belt + suspenders
 * that catches the day someone accidentally writes
 * `import { generateClassification } from "../dev/fixtures/generator.ts"`
 * inside `src/`.
 *
 * Runs in:
 *   - lefthook pre-commit
 *   - .github/workflows/ci.yml
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC_DIR = resolve(ROOT, "src");
// Matches any relative import that traverses into `dev/`. Examples caught:
//   from "../dev/seed-dev.ts"
//   from "../../dev/fixtures/generator.ts"
//   from '../../../dev/foo'
// Absolute `from "dev/..."` is not used in this repo (no path aliases), but
// caught defensively.
const FORBIDDEN_PATTERN = /from\s+["'](?:\.\.\/)+dev\/|from\s+["']dev\//;

function* walk(dir: string): Iterable<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield full;
    }
  }
}

function main(): void {
  if (!statSync(SRC_DIR).isDirectory()) {
    throw new Error(`src/ not found at ${SRC_DIR}`);
  }
  const violations: { file: string; line: number; text: string }[] = [];
  for (const file of walk(SRC_DIR)) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, idx) => {
      if (FORBIDDEN_PATTERN.test(line)) {
        violations.push({ file, line: idx + 1, text: line.trim() });
      }
    });
  }
  if (violations.length === 0) {
    console.log("src/ → dev/ import check: ok (0 violations)");
    return;
  }
  console.error("src/ → dev/ import check: FAILED");
  console.error(
    `Dev-only tooling cannot ship in the production binary. Move the shared helper into src/ if you need it at runtime.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  process.exit(1);
}

main();
