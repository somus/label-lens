#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT = resolve(ROOT, "dist", `label-lens-${target()}`);
const WORKER_SRC = resolve(ROOT, "node_modules/@opentui/core/parser.worker.js");
const SHIM_SRC = resolve(ROOT, "scripts/labellens-shim.sh");
const MIGRATION_DIR = resolve(ROOT, "migration");

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

function loadMigrations(): { sql: string; timestamp: number; name: string }[] {
  if (!existsSync(MIGRATION_DIR)) return [];
  const files = readdirSync(MIGRATION_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
  return files.map((name) => ({
    sql: readFileSync(join(MIGRATION_DIR, name), "utf-8"),
    timestamp: parseInt(name.slice(0, 4), 10),
    name: name.replace(/\.sql$/, ""),
  }));
}

function main(): void {
  if (!existsSync(WORKER_SRC)) {
    throw new Error(`parser.worker.js not found at ${WORKER_SRC}. Run 'bun install' first.`);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const targetName = target();
  const migrations = loadMigrations();
  // Resolve version from LL_RELEASE_VERSION (set by release.yml from the tag)
  // or fall back to "dev" so local builds aren't pretending to be a release.
  const version = process.env.LL_RELEASE_VERSION?.replace(/^v/, "") ?? "dev";
  console.log(
    `Building label-lens ${version} for ${targetName} (${migrations.length} migrations)...`,
  );

  const result = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      `--target=${bunTarget(targetName)}`,
      `--outfile=${join(OUT, "labellens.bin")}`,
      `--define=LABELLENS_MIGRATIONS=${JSON.stringify(migrations)}`,
      `--define=LABELLENS_VERSION=${JSON.stringify(version)}`,
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

  // Man page — generated from src/cli/help.ts so it always tracks the
  // canonical --help text. install.sh symlinks this into the user's
  // ~/.local/share/man/man1 (or /usr/local/share/man/man1 for root installs).
  const manResult = spawnSync("bun", ["run", "scripts/build-man.ts", targetName], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (manResult.status !== 0) {
    throw new Error("scripts/build-man.ts failed");
  }

  console.log(`Built ${OUT}`);
  console.log(`  labellens          (shim)`);
  console.log(`  labellens.bin      (compiled binary)`);
  console.log(`  parser.worker.js   (OpenTUI tree-sitter worker)`);
  console.log(`  labellens.1        (man page)`);
}

main();
