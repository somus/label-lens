import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createAppContext } from "../app/context.ts";
import type { LabellensConfig } from "../config/config.ts";
import { ingestFile } from "../ingest/ingest.ts";
import { bootstrapDisplay } from "../render/capability.ts";
import { mountReviewScreen } from "../screens/review.ts";
import { openDb } from "../store/db.ts";

export async function runReview(): Promise<void> {
  const configPath = resolve("./labellens.config.json");
  if (!existsSync(configPath)) {
    console.error(
      "labellens: no labellens.config.json found in this directory. Run 'labellens init <file.jsonl>' first.",
    );
    process.exit(2);
  }

  const config = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  const inputPath = resolve(config.input.path);
  const stateDbPath = join(dirname(configPath), ".labellens", "state.db");

  const isFreshDb = !existsSync(stateDbPath);
  const db = openDb(stateDbPath);

  if (isFreshDb) {
    console.error(`Ingesting ${inputPath}...`);
    const result = await ingestFile(db, inputPath, config.input.fields);
    console.error(`  ingested ${result.ingested}, skipped ${result.skipped}`);
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const display = await bootstrapDisplay({
    env: {
      COLORTERM: process.env.COLORTERM,
      TERM: process.env.TERM,
      NO_COLOR: process.env.NO_COLOR,
    },
    themeProbe: { waitForThemeMode: (ms) => renderer.waitForThemeMode(ms) },
    config: config.display,
  });
  const app = createAppContext({
    db,
    config,
    display,
    requestRender: () => {},
    onQuit: () => {
      renderer.destroy();
      process.exit(0);
    },
  });
  mountReviewScreen({ renderer, app });
}
