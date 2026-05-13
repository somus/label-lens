#!/usr/bin/env bun

/**
 * Deterministic fixture generator for test/fixtures/.
 *
 * Usage:
 *   bun scripts/gen-fixtures.ts <name>          # one fixture
 *   bun scripts/gen-fixtures.ts --all           # all five
 *   bun scripts/gen-fixtures.ts <name> --out P  # write elsewhere (used by tests)
 *
 * Targets and seeds:
 *   small    — classification, seed 1, count 1000
 *   medium   — classification, seed 2, count 10000
 *   large    — classification, seed 3, count 50000
 *   boundary — large boundary docs (3 × 150), seed 1
 *
 * tiny.jsonl is hand-written (with whitespace) and not regenerated.
 *
 * Output is byte-stable: same name → same bytes. Verified by
 * test/unit/fixtures.test.ts against the committed files.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { generateBoundary, generateClassification, serializeJsonl } from "./fixtures/generator.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const FIXTURES_DIR = join(REPO_ROOT, "test", "fixtures");

type Target = "small" | "medium" | "large" | "boundary";
const TARGETS: Target[] = ["small", "medium", "large", "boundary"];

function build(target: Target): string {
  switch (target) {
    case "small":
      return serializeJsonl(generateClassification({ seed: 1, count: 1000 }).records);
    case "medium":
      return serializeJsonl(generateClassification({ seed: 2, count: 10000 }).records);
    case "large":
      return serializeJsonl(generateClassification({ seed: 3, count: 50000 }).records);
    case "boundary":
      return serializeJsonl(generateBoundary({ size: "large", seed: 1 }).records);
  }
}

function parseArgs(argv: string[]): { targets: Target[]; out?: string } {
  const targets: Target[] = [];
  let out: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--all") {
      targets.push(...TARGETS);
    } else if (arg === "--out") {
      out = argv[++i];
    } else if ((TARGETS as string[]).includes(arg)) {
      targets.push(arg as Target);
    } else {
      throw new Error(`unknown target: ${arg}`);
    }
  }
  if (targets.length === 0) {
    throw new Error(`usage: bun scripts/gen-fixtures.ts <name|--all> [--out path]
  names: ${TARGETS.join(", ")}`);
  }
  if (out && targets.length > 1) {
    throw new Error("--out only valid with a single target");
  }
  return { targets, out };
}

async function main(): Promise<void> {
  const { targets, out } = parseArgs(process.argv);
  for (const target of targets) {
    const bytes = build(target);
    const dest = out ?? join(FIXTURES_DIR, `${target}.jsonl`);
    await mkdir(dirname(dest), { recursive: true });
    await Bun.write(dest, bytes);
    const lines = bytes.length === 0 ? 0 : bytes.split("\n").length - 1;
    const byteLen = Buffer.byteLength(bytes, "utf8");
    console.log(`wrote ${dest} (${lines} records, ${byteLen} bytes)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
