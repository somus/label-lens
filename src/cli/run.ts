import { existsSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import { switchQueue } from "../actions/queue/switch.ts";
import { createAppContext } from "../app/context.ts";
import type { LabellensConfig } from "../config/config.ts";
import { computeFingerprint, readFingerprint, writeFingerprint } from "../ingest/fingerprint.ts";
import { ingestFile } from "../ingest/ingest.ts";
import { applyDiff, type DiffResult, diffIngest } from "../ingest/reingest.ts";
import { bootstrapDisplay } from "../render/capability.ts";
import { mountQueueScreen } from "../screens/queue.ts";
import { mountReingestPrompt, type ReingestChoice } from "../screens/reingest-prompt.ts";
import { mountReviewScreen, type ReviewScreenHandle } from "../screens/review.ts";
import { mountStatsScreen } from "../screens/stats.ts";
import { runSignals } from "../signals/run.ts";
import { type Db, openDb } from "../store/db.ts";
import { findUnknownLabels } from "../store/labels.ts";

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
  const stateDir = join(dirname(configPath), ".labellens");
  const stateDbPath = join(stateDir, "state.db");

  let db = openDb(stateDbPath);

  const recordCount = (handle: Db) =>
    handle.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;

  const isEmpty = recordCount(db) === 0;
  const stored = readFingerprint(db, inputPath);
  const current = await computeFingerprint(inputPath);

  // Renderer is created lazily so terminal probes (palette + theme OSC
  // queries) don't fire during the non-interactive fingerprint / ingest
  // window. If the process exits before mounting any screen, the terminal
  // never gets primed and no probe responses leak into the parent shell.
  let renderer: CliRenderer | null = null;
  const ensureRenderer = async (): Promise<CliRenderer> => {
    if (!renderer) renderer = await createCliRenderer({ exitOnCtrlC: true });
    return renderer;
  };

  if (isEmpty) {
    console.error(`Ingesting ${inputPath}...`);
    const result = await ingestFile(db, inputPath, config.input.fields);
    console.error(`  ingested ${result.ingested}, skipped ${result.skipped}`);
    console.error("Computing prioritization signals...");
    const signals = runSignals(db);
    console.error(`  wrote ${signals.written} issue rows`);
    writeFingerprint(db, inputPath, current);
  } else if (!stored) {
    // Legacy DB from before slice 9 (no fingerprint row). Trust existing data;
    // record the current source fingerprint so future runs can diff.
    writeFingerprint(db, inputPath, current);
  } else if (stored.mtime !== current.mtime || stored.contentSha256 !== current.contentSha256) {
    const diff = await diffIngest(db, inputPath, config.input.fields);
    if (
      diff.predictionsOnly.length === 0 &&
      diff.orphans.length === 0 &&
      diff.newRecords.length === 0
    ) {
      // mtime touched but content identical (e.g. `touch` on the file).
      writeFingerprint(db, inputPath, current);
    } else {
      const r = await ensureRenderer();
      const choice = await promptForChoice(r, diff);
      if (choice === "cancel") {
        r.destroy();
        process.exit(0);
      }
      if (choice === "fresh") {
        db = await freshReingest(db, stateDir, stateDbPath, inputPath, config);
        writeFingerprint(db, inputPath, current);
      } else {
        applyDiff(db, diff);
        runSignals(db);
        writeFingerprint(db, inputPath, current);
      }
    }
  }

  const unknown = findUnknownLabels(db, config.labels);
  if (unknown.length > 0) {
    console.error("labellens: configured label set is missing values referenced by stored data.");
    for (const u of unknown) {
      console.error(`  '${u.label}' — ${u.count} record${u.count === 1 ? "" : "s"}`);
    }
    console.error("");
    console.error("Either re-add the missing label(s) to labellens.config.json, or remap them");
    console.error("to a label that is already configured:");
    for (const u of unknown) {
      console.error(`  labellens migrate --rename ${u.label}:<configured-replacement>`);
    }
    db.$client.close();
    process.exit(2);
  }

  const r = await ensureRenderer();
  const display = await bootstrapDisplay({
    env: {
      COLORTERM: process.env.COLORTERM,
      TERM: process.env.TERM,
      NO_COLOR: process.env.NO_COLOR,
    },
    themeProbe: { waitForThemeMode: (ms) => r.waitForThemeMode(ms) },
    config: config.display,
  });
  const app = createAppContext({
    db,
    config,
    display,
    requestRender: () => {},
    onQuit: () => {
      r.destroy();
      // Give the terminal time to drain in-flight OSC probe responses
      // (palette + theme queries OpenTUI fires on init) before we exit —
      // otherwise those bytes leak past process.exit into the parent shell
      // and render as garbage in the prompt. SSH or slow terminals can tune
      // via LABELLENS_EXIT_DELAY_MS.
      const delay = Number.parseInt(process.env.LABELLENS_EXIT_DELAY_MS ?? "", 10);
      setTimeout(() => process.exit(0), Number.isFinite(delay) && delay >= 0 ? delay : 30);
    },
  });
  let reviewHandle: ReviewScreenHandle | null = null;

  const mountReview = (queueId: string) => {
    reviewHandle = mountReviewScreen({ renderer: r, app, initialQueueId: queueId });
  };

  app.openQueueScreen = () => {
    reviewHandle?.destroy();
    reviewHandle = null;
    const queueHandle = mountQueueScreen({
      renderer: r,
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
      renderer: r,
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

function promptForChoice(renderer: CliRenderer, diff: DiffResult): Promise<ReingestChoice> {
  return new Promise((resolveChoice) => {
    const handle = mountReingestPrompt({
      renderer,
      counts: {
        predictionsOnly: diff.predictionsOnly.length,
        orphans: diff.orphans.length,
        newRecords: diff.newRecords.length,
      },
      onChoice: (choice) => {
        handle.destroy();
        for (const child of renderer.root.getChildren()) child.destroyRecursively();
        resolveChoice(choice);
      },
    });
  });
}

/**
 * `[f]` legacy escape hatch (PRD §13): back up `.labellens/` to
 * `.labellens.bak/` and start fresh. Closes the current sqlite handle so the
 * rename can complete on Windows-style filesystems, then reopens at the same
 * path.
 */
async function freshReingest(
  db: Db,
  stateDir: string,
  stateDbPath: string,
  inputPath: string,
  config: LabellensConfig,
): Promise<Db> {
  db.$client.close();
  let bakDir = `${stateDir}.bak`;
  if (existsSync(bakDir)) {
    bakDir = `${stateDir}.bak-${Date.now()}`;
  }
  renameSync(stateDir, bakDir);
  console.error(`Backed up state to ${bakDir}`);

  const fresh = openDb(stateDbPath);
  console.error(`Ingesting ${inputPath}...`);
  const result = await ingestFile(fresh, inputPath, config.input.fields);
  console.error(`  ingested ${result.ingested}, skipped ${result.skipped}`);
  console.error("Computing prioritization signals...");
  const signals = runSignals(fresh);
  console.error(`  wrote ${signals.written} issue rows`);
  return fresh;
}
