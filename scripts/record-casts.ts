#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/**
 * Drive vhs across every tape under docs/casts/tapes/. Copies the resulting
 * gif/webm into docs/media/ (the committed home; docs/casts/out/ is scratch).
 *
 * Usage:
 *   bun run scripts/record-casts.ts                # all tapes
 *   bun run scripts/record-casts.ts hero assistant # named tapes
 *
 * Requires `vhs` on PATH (brew install vhs).
 */

const ROOT = resolve(import.meta.dir, "..");
const TAPES_DIR = join(ROOT, "docs/casts/tapes");
const OUT_DIR = join(ROOT, "docs/casts/out");
const MEDIA_DIR = join(ROOT, "docs/media");

function listTapes(filter: string[]): string[] {
  const all = readdirSync(TAPES_DIR).filter((f) => f.endsWith(".tape"));
  if (filter.length === 0) return all;
  return all.filter((f) => filter.includes(basename(f, ".tape")));
}

function recordOne(tape: string): void {
  const tapePath = join(TAPES_DIR, tape);
  console.log(`→ vhs ${tape}`);
  const result = spawnSync("vhs", [tapePath], { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    throw new Error(`vhs failed for ${tape} (exit ${result.status})`);
  }
}

function publish(tape: string): void {
  const name = basename(tape, ".tape");
  for (const ext of ["gif", "webm"]) {
    const src = join(OUT_DIR, `${name}.${ext}`);
    if (!existsSync(src)) {
      console.warn(`  (skip) ${src} not produced`);
      continue;
    }
    const dest = join(MEDIA_DIR, `${name}.${ext}`);
    copyFileSync(src, dest);
    console.log(`  ${dest}`);
  }
}

function main(): void {
  if (!existsSync(TAPES_DIR)) {
    console.error(`No tapes directory at ${TAPES_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });

  const tapes = listTapes(process.argv.slice(2));
  if (tapes.length === 0) {
    console.error("No matching tapes.");
    process.exit(1);
  }
  for (const tape of tapes) {
    recordOne(tape);
    publish(tape);
  }
  console.log(`\nDone. ${tapes.length} tape(s) regenerated.`);
}

main();
