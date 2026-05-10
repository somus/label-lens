#!/usr/bin/env bun
/**
 * One-command dev playground. Subcommands:
 *
 *   bun run scripts/dev.ts up     # init if needed, then launch TUI
 *   bun run scripts/dev.ts down   # remove the dev dir entirely
 *   bun run scripts/dev.ts status # show what's in $LL_DEV_DIR
 *
 * Knobs (env or flags):
 *   LL_DEV_DIR=/tmp/foo            # override target dir (default /tmp/llens-dev)
 *   --reset                        # force re-seed even if data.jsonl exists
 *   --count <n>                    # records to generate (default 150)
 *   --seed <n>                     # PRNG seed (default 1)
 *   --task <classification|boundary>  # dataset flavor (default classification)
 *
 * Same flags pass through to scripts/seed-dev.ts.
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SEED_SCRIPT = join(REPO_ROOT, "scripts", "seed-dev.ts");
const MAIN = join(REPO_ROOT, "src", "main.ts");
const DEFAULT_DIR = "/tmp/llens-dev";

function devDir(): string {
  return process.env.LL_DEV_DIR || DEFAULT_DIR;
}

function isInitialized(dir: string): boolean {
  return existsSync(join(dir, "data.jsonl")) && existsSync(join(dir, "labellens.config.json"));
}

function passthroughSeedArgs(): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(3);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset") continue;
    if (arg === "--no-prefill") {
      out.push(arg);
      continue;
    }
    if (
      arg === "--count" ||
      arg === "--seed" ||
      arg === "--task" ||
      arg === "--with-marks" ||
      arg === "--with-reviews"
    ) {
      out.push(arg, argv[++i] ?? "");
    }
  }
  return out;
}

function up(): void {
  const dir = devDir();
  const reset = process.argv.includes("--reset");

  if (reset || !isInitialized(dir)) {
    console.log(`Seeding ${dir}...`);
    const seedArgs = passthroughSeedArgs();
    const result = spawnSync("bun", ["run", SEED_SCRIPT, ...seedArgs], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, LL_DEV_DIR: dir },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else {
    console.log(`${dir} already seeded. Use --reset to regenerate.`);
  }

  console.log(`Launching TUI in ${dir}...\n`);
  const tui = spawnSync("bun", ["run", MAIN], { cwd: dir, stdio: "inherit" });
  process.exit(tui.status ?? 0);
}

function down(): void {
  const dir = devDir();
  if (!existsSync(dir)) {
    console.log(`${dir} does not exist; nothing to do.`);
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${dir}.`);
}

function status(): void {
  const dir = devDir();
  if (!existsSync(dir)) {
    console.log(`${dir}: not initialized.`);
    return;
  }
  const stat = statSync(dir);
  const initd = isInitialized(dir);
  const dbPath = join(dir, ".labellens", "state.db");
  const hasDb = existsSync(dbPath);
  console.log(`${dir}:`);
  console.log(`  initialized: ${initd}`);
  console.log(`  state.db:    ${hasDb ? "yes" : "no"}`);
  console.log(`  modified:    ${stat.mtime.toISOString()}`);
}

function usage(): never {
  console.error(
    "usage: bun run scripts/dev.ts <up | down | status> [--reset] [--count N] [--seed N] [--task classification|boundary] [--with-marks N] [--with-reviews N] [--no-prefill]",
  );
  process.exit(2);
}

const cmd = process.argv[2];
switch (cmd) {
  case "up":
    up();
    break;
  case "down":
    down();
    break;
  case "status":
    status();
    break;
  default:
    usage();
}
