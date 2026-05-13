#!/usr/bin/env bun
import { ExportCliError, runExportCli } from "./cli/export.ts";
import { runInit } from "./cli/init.ts";
import { runReview } from "./cli/run.ts";

// Bun's `--define LABELLENS_VERSION=...` injects the release tag at compile
// time. Falls back to "dev" so source-mode `bun run` still prints something.
declare const LABELLENS_VERSION: string | undefined;
const VERSION = typeof LABELLENS_VERSION !== "undefined" ? LABELLENS_VERSION : "dev";

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  if (cmd === "--version" || cmd === "-v") {
    console.log(`labellens ${VERSION}`);
    return;
  }

  if (cmd === "init") {
    const input = rest[0];
    if (!input) {
      console.error("usage: labellens init <file.jsonl>");
      process.exit(2);
    }
    await runInit({ input });
    return;
  }

  if (cmd === "export") {
    try {
      await runExportCli({ args: rest, cwd: process.cwd() });
    } catch (err) {
      if (err instanceof ExportCliError) {
        console.error(`labellens export: ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
    return;
  }

  if (cmd === undefined) {
    await runReview();
    return;
  }

  console.error(`labellens: unknown command '${cmd}'`);
  console.error("usage: labellens [init <file.jsonl> | export [format]]");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
