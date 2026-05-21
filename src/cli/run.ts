import { accessSync, existsSync, constants as fsConstants, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import { buildRegistry, type Command } from "../actions/command.ts";
import { relabelByKeyCommand } from "../actions/record/decisions.ts";
import { ALL_COMMANDS, reservedReviewKeys } from "../actions/registry.ts";
import { createAppContext } from "../app/context.ts";
import {
  type LabellensConfig,
  validateFieldOverrides,
  validateLabelKeys,
  validateLocalOnly,
} from "../config/config.ts";
import { ConfigLoadError, loadConfig } from "../config/load.ts";
import { computeFingerprint, readFingerprint, writeFingerprint } from "../ingest/fingerprint.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../ingest/ingest.ts";
import { applyDiff, type DiffResult, diffIngest } from "../ingest/reingest.ts";
import { resolvePreset } from "../keymap/preset.ts";
import { openQueue } from "../overlay/queue.ts";
import { bootstrapDisplay } from "../render/capability.ts";
import { mountReingestPrompt, type ReingestChoice } from "../screens/reingest-prompt.ts";
import { mountReviewScreen, type ReviewScreenHandle } from "../screens/review.ts";
import { mountSplash } from "../screens/splash.ts";
import { runSignals } from "../signals/run.ts";
import { applyThresholdsOnStartup, recordAppliedThresholds } from "../signals/startup.ts";
import { type LowConfidenceThresholds, thresholdsFromConfig } from "../signals/threshold.ts";
import { type Db, openDb } from "../store/db.ts";
import { findUnknownLabels } from "../store/labels.ts";
import { chooseInitialScreen } from "./initial-screen.ts";

export const MISSING_CONFIG_MESSAGE =
  "labellens: no labellens.config.json found in this directory. Run 'labellens init <file.jsonl>' first.";

export class ReviewSetupError extends Error {
  constructor(
    message: string,
    readonly lines: string[] = [],
    readonly code = 2,
  ) {
    super(message);
    this.name = "ReviewSetupError";
  }
}

export type ReviewSetupStderr = {
  error(message: string): void;
};

export type PreparedReviewState = {
  db: Db;
  config: LabellensConfig;
  configPath: string;
  inputPath: string;
  allCommands: Command[];
  initialScreen: "queue" | "review";
  localOnly: boolean;
  cancelled: boolean;
};

export type PrepareReviewStateArgs = {
  cwd?: string;
  localOnly?: boolean;
  stderr?: ReviewSetupStderr;
  chooseReingest?: (args: {
    diff: DiffResult;
    inputPath: string;
    config: LabellensConfig;
  }) => Promise<ReingestChoice>;
};

export function shouldShowMissingConfigSplash(args: {
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
}): boolean {
  return args.stdinIsTTY === true && args.stdoutIsTTY === true;
}

export async function runReview(args: { localOnly?: boolean } = {}): Promise<void> {
  const localOnly = args.localOnly ?? false;
  const configPath = resolve("./labellens.config.json");
  if (!existsSync(configPath)) {
    if (
      !shouldShowMissingConfigSplash({
        stdinIsTTY: process.stdin.isTTY,
        stdoutIsTTY: process.stdout.isTTY,
      })
    ) {
      console.error(MISSING_CONFIG_MESSAGE);
      process.exit(2);
    }
    await runSplash();
    return;
  }

  let renderer: CliRenderer | null = null;
  let resolvedDisplay: import("../render/capability.ts").ResolvedDisplay | null = null;
  const ensureRenderer = async (): Promise<CliRenderer> => {
    if (!renderer) renderer = await createCliRenderer({ exitOnCtrlC: true });
    return renderer;
  };
  const ensureDisplay = async (
    config: LabellensConfig,
  ): Promise<import("../render/capability.ts").ResolvedDisplay> => {
    if (resolvedDisplay) return resolvedDisplay;
    const r = await ensureRenderer();
    resolvedDisplay = await bootstrapDisplay({
      env: {
        COLORTERM: process.env.COLORTERM,
        TERM: process.env.TERM,
        // Used by `detectRichGradient` to allowlist terminals with clean
        // per-cell gradient rendering (iTerm2, WezTerm, Ghostty, …).
        TERM_PROGRAM: process.env.TERM_PROGRAM,
        NO_COLOR: process.env.NO_COLOR,
      },
      themeProbe: { waitForThemeMode: (ms) => r.waitForThemeMode(ms) },
      config: config.display,
    });
    return resolvedDisplay;
  };

  let prepared: PreparedReviewState;
  try {
    prepared = await prepareReviewState({
      localOnly,
      chooseReingest: async ({ diff, inputPath, config }) => {
        const r = await ensureRenderer();
        const display = await ensureDisplay(config);
        return promptForChoice(r, diff, display, inputPath);
      },
      stderr: console,
    });
  } catch (err) {
    if (err instanceof ReviewSetupError) {
      console.error(err.message);
      for (const line of err.lines) console.error(line === "" ? "" : `  ${line}`);
      process.exit(err.code);
    }
    throw err;
  }

  if (prepared.cancelled) {
    if (renderer) (renderer as CliRenderer).destroy();
    process.exit(0);
  }

  const { db, config, allCommands, configPath: preparedConfigPath, initialScreen } = prepared;
  const display = await ensureDisplay(config);

  // The `updateAssistantConfig` effect persists assistant settings back to the
  // config file when the reviewer finishes the configure-assistant flow. If
  // the file isn't writable (read-only volume, locked, wrong perms) the write
  // would fail at the worst moment — mid-flow, after the reviewer typed their
  // API key. Warn early so they can fix perms before that point. We don't
  // crash: the in-memory session still works without persistence.
  try {
    accessSync(preparedConfigPath, fsConstants.W_OK);
  } catch {
    console.error(
      `labellens: warning — ${preparedConfigPath} is not writable; assistant settings won't persist across launches.`,
    );
  }
  const r = await ensureRenderer();
  const app = createAppContext({
    db,
    config,
    display,
    localOnly,
    configPath: preparedConfigPath,
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

  const perLabelKeyCommands = config.labels
    .map(relabelByKeyCommand)
    .filter((cmd): cmd is Command => cmd !== null);
  const registry = buildRegistry([...allCommands, ...perLabelKeyCommands]);

  const mountReview = (queueId: string) => {
    reviewHandle = mountReviewScreen({ renderer: r, app, registry, initialQueueId: queueId });
  };

  // Queue picker is now an overlay on top of Review (no separate screen).
  // The thin shim keeps the old `app.openQueueScreen()` callsite working —
  // mount Review first if it isn't already, then open the overlay.
  app.openQueueScreen = () => {
    if (!reviewHandle) mountReview(app.queueId ?? "pending");
    app.openOverlay({ kind: "queue", state: openQueue(app) });
  };

  if (initialScreen === "queue") {
    app.openQueueScreen?.();
  } else {
    mountReview("pending");
  }
}

export async function prepareReviewState(
  args: PrepareReviewStateArgs = {},
): Promise<PreparedReviewState> {
  const cwd = args.cwd ? resolve(args.cwd) : process.cwd();
  const localOnly = args.localOnly ?? false;
  const configPath = resolve(cwd, "labellens.config.json");
  const stderr = args.stderr ?? console;

  if (!existsSync(configPath)) {
    throw new ReviewSetupError(MISSING_CONFIG_MESSAGE);
  }

  let config: LabellensConfig;
  try {
    config = await loadConfig(configPath);
  } catch (err) {
    if (err instanceof ConfigLoadError) {
      throw new ReviewSetupError(err.message, err.errors);
    }
    throw err;
  }

  const presetResult = resolvePreset(ALL_COMMANDS, config.keys);
  if (presetResult.errors.length > 0) {
    throw new ReviewSetupError("labellens: invalid config.keys", presetResult.errors);
  }
  const allCommands = presetResult.commands;

  const reservedForLabels = reservedReviewKeys(allCommands);
  const keyError = validateLabelKeys(config, reservedForLabels);
  if (keyError) {
    throw new ReviewSetupError("labellens: invalid config.labels[].key", keyError.split("\n"));
  }

  const fieldOverridesError = validateFieldOverrides(config);
  if (fieldOverridesError) {
    throw new ReviewSetupError(
      "labellens: invalid output.fieldOverrides",
      fieldOverridesError.split("\n"),
    );
  }

  const localOnlyError = validateLocalOnly(config, localOnly);
  if (localOnlyError) {
    throw new ReviewSetupError(`labellens: ${localOnlyError}`);
  }

  const inputPath = resolve(dirname(configPath), config.input.path);
  const stateDir = join(dirname(configPath), ".labellens");
  const stateDbPath = join(stateDir, "state.db");

  let db = openDb(stateDbPath);

  const recordCount = (handle: Db) =>
    handle.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;

  const isEmpty = recordCount(db) === 0;
  const stored = readFingerprint(db, inputPath);
  const current = await computeFingerprint(inputPath);

  const thresholds: LowConfidenceThresholds = thresholdsFromConfig(config.signals?.lowConfidence);

  if (isEmpty) {
    stderr.error(`Ingesting ${inputPath}...`);
    const result = await ingestFile(
      db,
      inputPath,
      config.input.fields,
      ingestTaskOptionsFromConfig(config),
    );
    stderr.error(`  ingested ${result.ingested}, skipped ${result.skipped}`);
    for (const w of result.warnings) stderr.error(`  ${w}`);
    if (result.warningCount > result.warnings.length) {
      const overflow = result.warningCount - result.warnings.length;
      stderr.error(`  …and ${overflow} more warnings suppressed (total ${result.warningCount})`);
    }
    stderr.error("Computing prioritization signals...");
    const signals = runSignals(db, signalsOptions(config));
    stderr.error(`  wrote ${signals.written} issue rows`);
    recordAppliedThresholds(db, thresholds);
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
      const choice = await args.chooseReingest?.({ diff, inputPath, config });
      if (!choice) {
        db.$client.close();
        throw new ReviewSetupError(
          "labellens: source file changed but no re-ingest handler was provided",
        );
      }
      if (choice === "cancel") {
        db.$client.close();
        return {
          db,
          config,
          configPath,
          inputPath,
          allCommands,
          initialScreen: "review",
          localOnly,
          cancelled: true,
        };
      }
      if (choice === "fresh") {
        db = await freshReingest(db, stateDir, stateDbPath, inputPath, config, stderr);
        recordAppliedThresholds(db, thresholds);
        writeFingerprint(db, inputPath, current);
      } else {
        applyDiff(db, diff);
        runSignals(db, signalsOptions(config));
        recordAppliedThresholds(db, thresholds);
        writeFingerprint(db, inputPath, current);
      }
    }
  }

  // After ingest settles, check whether the stored threshold fingerprint
  // matches the current config. Different (or unset) → re-evaluate
  // low_confidence Issues against the new thresholds without a full re-ingest.
  // Same → cheap no-op (one meta read).
  applyThresholdsOnStartup(db, thresholds);

  // Extraction stores structured JSON objects in `predictions.label` /
  // `reviews.final_label`, not configured-label values; the configured-label
  // guard does not apply and would otherwise flag every stored object as
  // unknown.
  const unknown = config.task === "extraction" ? [] : findUnknownLabels(db, config.labels);
  if (unknown.length > 0) {
    const lines = [
      ...unknown.map((u) => `'${u.label}' — ${u.count} record${u.count === 1 ? "" : "s"}`),
      "",
      "Either re-add the missing label(s) to labellens.config.json, or remap them",
      "to a label that is already configured:",
      ...unknown.map((u) => `labellens migrate --rename ${u.label}:<configured-replacement>`),
    ];
    db.$client.close();
    throw new ReviewSetupError(
      "labellens: configured label set is missing values referenced by stored data.",
      lines,
    );
  }

  return {
    db,
    config,
    configPath,
    inputPath,
    allCommands,
    initialScreen: chooseInitialScreen(db),
    localOnly,
    cancelled: false,
  };
}

/**
 * No-args splash (plan A7 + A20). Boots a renderer with detected display,
 * mounts the wordmark + usage hint, exits on the first keypress.
 */
async function runSplash(): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const display = await bootstrapDisplay({
    env: {
      COLORTERM: process.env.COLORTERM,
      TERM: process.env.TERM,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
      NO_COLOR: process.env.NO_COLOR,
    },
    themeProbe: { waitForThemeMode: (ms) => renderer.waitForThemeMode(ms) },
    config: undefined,
  });
  await new Promise<void>((resolveExit) => {
    const handle = mountSplash({
      renderer,
      display,
      onExit: () => {
        handle.destroy();
        renderer.destroy();
        const delay = Number.parseInt(process.env.LABELLENS_EXIT_DELAY_MS ?? "", 10);
        setTimeout(resolveExit, Number.isFinite(delay) && delay >= 0 ? delay : 30);
      },
    });
  });
}

function promptForChoice(
  renderer: CliRenderer,
  diff: DiffResult,
  display: import("../render/capability.ts").ResolvedDisplay,
  inputPath: string,
): Promise<ReingestChoice> {
  return new Promise((resolveChoice) => {
    const handle = mountReingestPrompt({
      renderer,
      display,
      datasetName: inputPath.split("/").pop() ?? inputPath,
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
  stderr: ReviewSetupStderr = console,
): Promise<Db> {
  db.$client.close();
  let bakDir = `${stateDir}.bak`;
  if (existsSync(bakDir)) {
    bakDir = `${stateDir}.bak-${Date.now()}`;
  }
  renameSync(stateDir, bakDir);
  stderr.error(`Backed up state to ${bakDir}`);

  const fresh = openDb(stateDbPath);
  stderr.error(`Ingesting ${inputPath}...`);
  const result = await ingestFile(
    fresh,
    inputPath,
    config.input.fields,
    ingestTaskOptionsFromConfig(config),
  );
  stderr.error(`  ingested ${result.ingested}, skipped ${result.skipped}`);
  for (const w of result.warnings) stderr.error(`  ${w}`);
  if (result.warningCount > result.warnings.length) {
    const overflow = result.warningCount - result.warnings.length;
    stderr.error(`  …and ${overflow} more warnings suppressed (total ${result.warningCount})`);
  }
  stderr.error("Computing prioritization signals...");
  const signals = runSignals(fresh, signalsOptions(config));
  stderr.error(`  wrote ${signals.written} issue rows`);
  return fresh;
}

function signalsOptions(config: LabellensConfig): import("../signals/run.ts").RunSignalsOptions {
  return {
    lowConfidence: thresholdsFromConfig(config.signals?.lowConfidence),
    enabled: config.signals?.enable,
  };
}
