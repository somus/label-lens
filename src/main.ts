#!/usr/bin/env bun
import { runInit } from "./cli/init.ts";
import { runReview } from "./cli/run.ts";

const VERSION = "0.0.0";

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

  if (cmd === undefined) {
    await runReview();
    return;
  }

  console.error(`labellens: unknown command '${cmd}'`);
  console.error("usage: labellens [init <file.jsonl>]");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
