#!/usr/bin/env bun

/**
 * Seed a dev playground at $LL_DEV_DIR (default /tmp/llens-dev) with a
 * deterministic, realistic JSONL fixture and an initialised
 * labellens.config.json. Idempotent: nukes the dir first.
 *
 * Usage:
 *   bun run scripts/seed-dev.ts                       # default 150 classification records
 *   bun run scripts/seed-dev.ts --count 1000          # bigger
 *   bun run scripts/seed-dev.ts --seed 42             # different deterministic dataset
 *   bun run scripts/seed-dev.ts --task boundary       # boundary task fixture (3-5 docs)
 *   LL_DEV_DIR=/tmp/foo bun run scripts/seed-dev.ts
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LabellensConfig } from "../src/config/config.ts";
import { ingestFile } from "../src/ingest/ingest.ts";
import { runSignals } from "../src/signals/run.ts";
import { openDb } from "../src/store/db.ts";
import { insertReview } from "../src/store/records.ts";
import { toggleTag } from "../src/store/tags.ts";
import {
  type GeneratedRecord,
  generateBoundary,
  generateClassification,
  LABELS,
  rng,
  serializeJsonl,
} from "./fixtures/generator.ts";

type Task = "classification" | "boundary";
type GenOptions = {
  count: number;
  seed: number;
  task: Task;
  withMarks: number;
  withReviews: number;
  withDuplicates: number;
  noPrefill: boolean;
};

function parseArgs(): GenOptions {
  const out: GenOptions = {
    count: 150,
    seed: 1,
    task: "classification",
    withMarks: 5,
    withReviews: 8,
    withDuplicates: 3,
    noPrefill: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--count") out.count = Number(process.argv[++i]);
    else if (arg === "--seed") out.seed = Number(process.argv[++i]);
    else if (arg === "--with-marks") out.withMarks = Number(process.argv[++i]);
    else if (arg === "--with-reviews") out.withReviews = Number(process.argv[++i]);
    else if (arg === "--with-duplicates") out.withDuplicates = Number(process.argv[++i]);
    else if (arg === "--no-prefill") out.noPrefill = true;
    else if (arg === "--task") {
      const v = process.argv[++i];
      if (v !== "classification" && v !== "boundary") {
        throw new Error("--task must be 'classification' or 'boundary'");
      }
      out.task = v;
    }
  }
  if (!Number.isFinite(out.count) || out.count < 1) {
    throw new Error("--count must be a positive integer");
  }
  if (!Number.isFinite(out.seed)) throw new Error("--seed must be a number");
  if (!Number.isFinite(out.withMarks) || out.withMarks < 0) {
    throw new Error("--with-marks must be a non-negative integer");
  }
  if (!Number.isFinite(out.withReviews) || out.withReviews < 0) {
    throw new Error("--with-reviews must be a non-negative integer");
  }
  if (!Number.isFinite(out.withDuplicates) || out.withDuplicates < 0) {
    throw new Error("--with-duplicates must be a non-negative integer");
  }
  return out;
}

function generate(opts: GenOptions): GeneratedRecord[] {
  if (opts.task === "boundary") {
    return generateBoundary({ size: "small", seed: opts.seed }).records;
  }
  return generateClassification({
    seed: opts.seed,
    count: opts.count,
    withDuplicates: opts.withDuplicates,
  }).records;
}

async function writeJsonl(path: string, rows: GeneratedRecord[]): Promise<void> {
  await Bun.write(path, serializeJsonl(rows));
}

/**
 * Pre-populate marks + a handful of reviews so dev launches land on a DB that
 * exercises every queue (marked / by-correction / pending / etc.) without the
 * reviewer having to type anything first.
 */
function prefillStateOpen(db: ReturnType<typeof openDb>, opts: GenOptions): void {
  {
    const rand = rng(opts.seed ^ 0xa11ce);
    type Row = { id: string; primary_label: string | null };
    const rows = db.$client
      .prepare("SELECT id, primary_label FROM records_with_primary")
      .all() as Row[];
    // Sample without replacement: marks first, then reviews. If
    // withMarks + withReviews > rows.length, the trailing iterations are
    // intentionally skipped — small datasets just get fewer prefills.
    const candidates = rows.slice();

    let marks = 0;
    for (let i = 0; i < opts.withMarks && candidates.length > 0; i++) {
      const idx = Math.floor(rand() * candidates.length);
      const row = candidates.splice(idx, 1)[0]!;
      toggleTag(db, row.id, "marked");
      marks++;
    }

    const otherLabels = LABELS.filter((l) => l !== "other");
    let reviews = 0;
    for (let i = 0; i < opts.withReviews && candidates.length > 0; i++) {
      const idx = Math.floor(rand() * candidates.length);
      const row = candidates.splice(idx, 1)[0]!;
      const accept = i % 2 === 0;
      const predicted = row.primary_label;
      if (accept) {
        if (!predicted) continue;
        insertReview(db, {
          record_id: row.id,
          status: "accepted",
          final_label: predicted,
          prev_label: null,
          source_of_truth: "human",
        });
      } else {
        const flip =
          predicted && otherLabels.includes(predicted as (typeof LABELS)[number])
            ? (otherLabels.filter((l) => l !== predicted)[
                Math.floor(rand() * (otherLabels.length - 1))
              ] ?? otherLabels[0])
            : otherLabels[0];
        insertReview(db, {
          record_id: row.id,
          status: "relabeled",
          final_label: flip ?? "food",
          prev_label: predicted,
          source_of_truth: "human",
        });
      }
      reviews++;
    }

    console.log(`Prefilled state: ${marks} marks, ${reviews} reviews.`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const dir = process.env.LL_DEV_DIR || "/tmp/llens-dev";
  const dataPath = join(dir, "data.jsonl");

  console.log(
    `Seeding ${dir} with task=${opts.task}${opts.task === "classification" ? `, count=${opts.count}` : ""} (seed=${opts.seed})...`,
  );
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const rows = generate(opts);
  await writeJsonl(dataPath, rows);

  // run `labellens init` from the dir so the config picks up the right paths
  const init = spawnSync(
    "bun",
    ["run", new URL("../src/main.ts", import.meta.url).pathname, "init", "data.jsonl"],
    { cwd: dir, stdio: "inherit" },
  );
  if (init.status !== 0) throw new Error(`labellens init failed (exit ${init.status})`);

  // Ingest now (instead of waiting for first `labellens` run) so the prefill
  // step has records to mark / review against.
  const configPath = join(dir, "labellens.config.json");
  const config = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  const dbPath = join(dir, ".labellens", "state.db");
  const db = openDb(dbPath);
  try {
    const ingestResult = await ingestFile(db, dataPath, config.input.fields);
    console.log(`Ingested ${ingestResult.ingested}, skipped ${ingestResult.skipped}.`);
    const signals = runSignals(db);
    console.log(`Signals: wrote ${signals.written} issue rows.`);
    if (!opts.noPrefill && (opts.withMarks > 0 || opts.withReviews > 0)) {
      prefillStateOpen(db, opts);
    }
  } finally {
    db.$client.close();
  }

  console.log("");
  console.log(`Done. ${rows.length} records at ${dataPath}.`);
  console.log("Next:");
  console.log(`  cd ${dir}`);
  console.log(`  bun run ${new URL("../src/main.ts", import.meta.url).pathname}`);
  console.log("");
  console.log("Reset to a fresh state without re-generating:");
  console.log(`  rm -rf ${dir}/.labellens`);
}

main();
