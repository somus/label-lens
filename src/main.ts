#!/usr/bin/env bun
import { ConfigCliError, runConfigCli } from "./cli/config.ts";
import { ExportCliError, runExportCli } from "./cli/export.ts";
import { printGuide } from "./cli/guide.ts";
import { printHelp } from "./cli/help.ts";
import { runInit } from "./cli/init.ts";
import { MigrateCliError, runMigrateCli } from "./cli/migrate.ts";
import { runReview } from "./cli/run.ts";

// Bun's `--define LABELLENS_VERSION=...` injects the release tag at compile
// time. Falls back to "dev" so source-mode `bun run` still prints something.
declare const LABELLENS_VERSION: string | undefined;
const VERSION = typeof LABELLENS_VERSION !== "undefined" ? LABELLENS_VERSION : "dev";

async function main(): Promise<void> {
  // Strip global flags before positional parsing so `labellens --local-only`
  // doesn't read `--local-only` as the subcommand.
  const argv = process.argv.slice(2).filter((a) => a !== "--local-only");
  const localOnly = process.argv.includes("--local-only");
  const [cmd, ...rest] = argv;

  if (cmd === "--version" || cmd === "-v") {
    console.log(`labellens ${VERSION}`);
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }

  if (cmd === "guide") {
    printGuide();
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

  if (cmd === "config") {
    try {
      await runConfigCli({ args: rest, cwd: process.cwd() });
    } catch (err) {
      if (err instanceof ConfigCliError) {
        console.error(`labellens config: ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
    return;
  }

  if (cmd === "migrate") {
    try {
      await runMigrateCli({ args: rest, cwd: process.cwd() });
    } catch (err) {
      if (err instanceof MigrateCliError) {
        console.error(`labellens migrate: ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
    return;
  }

  if (cmd === undefined) {
    if (process.env.LABELLENS_ASSISTANT_MOCK_FILE) {
      if (VERSION === "dev") {
        const { installAssistantMockIfRequested } = await import("./assistant/mock-bootstrap.ts");
        installAssistantMockIfRequested();
      } else {
        console.warn("LABELLENS_ASSISTANT_MOCK_FILE is ignored in release builds.");
      }
    }
    await runReview({ localOnly });
    return;
  }

  console.error(`labellens: unknown command '${cmd}'`);
  console.error("Run 'labellens --help' for usage.");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
