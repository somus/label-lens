import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { switchQueue } from "../actions/queue/switch.ts";
import { createAppContext } from "../app/context.ts";
import type { LabellensConfig } from "../config/config.ts";
import { ingestFile } from "../ingest/ingest.ts";
import { bootstrapDisplay } from "../render/capability.ts";
import { mountQueueScreen } from "../screens/queue.ts";
import { mountReviewScreen, type ReviewScreenHandle } from "../screens/review.ts";
import { mountStatsScreen } from "../screens/stats.ts";
import { runSignals } from "../signals/run.ts";
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

    console.error("Computing prioritization signals...");
    const signals = runSignals(db);
    console.error(`  wrote ${signals.written} issue rows`);
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
  let reviewHandle: ReviewScreenHandle | null = null;

  const mountReview = (queueId: string) => {
    reviewHandle = mountReviewScreen({ renderer, app, initialQueueId: queueId });
  };

  app.openQueueScreen = () => {
    reviewHandle?.destroy();
    reviewHandle = null;
    const queueHandle = mountQueueScreen({
      renderer,
      app,
      onSelect: (id) => {
        queueHandle.destroy();
        switchQueue(app, id);
        mountReview(id);
      },
      onCancel: () => {
        queueHandle.destroy();
        mountReview(app.queueId ?? "pending");
      },
    });
  };

  app.openStatsScreen = () => {
    reviewHandle?.destroy();
    reviewHandle = null;
    const statsHandle = mountStatsScreen({
      renderer,
      app,
      onDrill: (id) => {
        statsHandle.destroy();
        switchQueue(app, id);
        mountReview(id);
      },
      onCancel: () => {
        statsHandle.destroy();
        mountReview(app.queueId ?? "pending");
      },
    });
  };

  mountReview("pending");
}
