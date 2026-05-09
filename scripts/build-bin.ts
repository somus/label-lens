#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT = resolve(ROOT, "dist", `label-lens-${target()}`);
const WORKER_SRC = resolve(ROOT, "node_modules/@opentui/core/parser.worker.js");
const SHIM_SRC = resolve(ROOT, "scripts/labellens-shim.sh");

function target(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${platform}-${arch}`;
}

function bunTarget(name: string): string {
  switch (name) {
    case "darwin-arm64":
      return "bun-darwin-arm64";
    case "darwin-x64":
      return "bun-darwin-x64";
    case "linux-arm64":
      return "bun-linux-arm64";
    case "linux-x64":
      return "bun-linux-x64";
    default:
      throw new Error(`unknown target: ${name}`);
  }
}

function main(): void {
  if (!existsSync(WORKER_SRC)) {
    throw new Error(`parser.worker.js not found at ${WORKER_SRC}. Run 'bun install' first.`);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const targetName = target();
  console.log(`Building label-lens for ${targetName}...`);

  const result = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      `--target=${bunTarget(targetName)}`,
      `--outfile=${join(OUT, "labellens.bin")}`,
      "src/main.ts",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("bun build --compile failed");
  }

  copyFileSync(WORKER_SRC, join(OUT, "parser.worker.js"));
  copyFileSync(SHIM_SRC, join(OUT, "labellens"));
  chmodSync(join(OUT, "labellens"), 0o755);
  chmodSync(join(OUT, "labellens.bin"), 0o755);

  console.log(`Built ${OUT}`);
  console.log(`  labellens          (shim)`);
  console.log(`  labellens.bin      (compiled binary)`);
  console.log(`  parser.worker.js   (OpenTUI tree-sitter worker)`);
}

main();
