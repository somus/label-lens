#!/usr/bin/env bun

/**
 * Seed a dev playground at $LL_DEV_DIR (default /tmp/llens-dev) with a
 * deterministic, realistic JSONL fixture and an initialised
 * labellens.config.json. Idempotent: nukes the dir first.
 *
 * Usage:
 *   bun run dev/seed-dev.ts                       # default 150 classification records
 *   bun run dev/seed-dev.ts --count 1000          # bigger
 *   bun run dev/seed-dev.ts --seed 42             # different deterministic dataset
 *   bun run dev/seed-dev.ts --task boundary       # boundary task fixture (3-5 docs)
 *   bun run dev/seed-dev.ts --task multi-label    # content-moderation fixture
 *   bun run dev/seed-dev.ts --task extraction     # structured invoice-extraction fixture
 *   LL_DEV_DIR=/tmp/foo bun run dev/seed-dev.ts
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LabellensConfig } from "../src/config/config.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../src/ingest/ingest.ts";
import { encodeExtractionObject } from "../src/labels/extraction-object.ts";
import { encodeLabelSet } from "../src/labels/label-set.ts";
import { runSignals } from "../src/signals/run.ts";
import { openDb } from "../src/store/db.ts";
import { insertReview, updateRecordNote } from "../src/store/records.ts";
import { toggleTag } from "../src/store/tags.ts";
import {
  BOUNDARY_LABELS,
  EXTRA_LABELS,
  EXTRACTION_FIELDS,
  type GeneratedRecord,
  generateBoundary,
  generateClassification,
  generateExtraction,
  generateMultiLabel,
  LABELS,
  MULTI_LABELS,
  rng,
  serializeJsonl,
} from "./fixtures/generator.ts";

type Task = "classification" | "boundary" | "multi-label" | "extraction";
type GenOptions = {
  count: number;
  seed: number;
  task: Task;
  withMarks: number;
  withReviews: number;
  withNotes: number;
  withDuplicates: number;
  withManyLabels: boolean;
  withBoundaryMultiSource: boolean;
  noPrefill: boolean;
};

const NOTE_TEMPLATES = [
  "double-check against bank statement",
  "merchant reuses card for multiple categories",
  "amount unusually high; verify",
  "predicted source carries no confidence",
  "model_v1 disagrees — worth a second look",
  "follow up next quarter",
  "potential refund; revisit when bank confirms",
];

function parseArgs(): GenOptions {
  const out: GenOptions = {
    count: 150,
    seed: 1,
    task: "classification",
    withMarks: 5,
    withReviews: 8,
    withNotes: 4,
    withDuplicates: 3,
    withManyLabels: false,
    withBoundaryMultiSource: false,
    noPrefill: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--count") out.count = Number(process.argv[++i]);
    else if (arg === "--seed") out.seed = Number(process.argv[++i]);
    else if (arg === "--with-marks") out.withMarks = Number(process.argv[++i]);
    else if (arg === "--with-reviews") out.withReviews = Number(process.argv[++i]);
    else if (arg === "--with-notes") out.withNotes = Number(process.argv[++i]);
    else if (arg === "--with-duplicates") out.withDuplicates = Number(process.argv[++i]);
    else if (arg === "--with-many-labels") out.withManyLabels = true;
    else if (arg === "--with-boundary-multi-source") out.withBoundaryMultiSource = true;
    else if (arg === "--no-prefill") out.noPrefill = true;
    else if (arg === "--task") {
      const v = process.argv[++i];
      if (v !== "classification" && v !== "boundary" && v !== "multi-label" && v !== "extraction") {
        throw new Error(
          "--task must be 'classification', 'boundary', 'multi-label', or 'extraction'",
        );
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
  if (!Number.isFinite(out.withNotes) || out.withNotes < 0) {
    throw new Error("--with-notes must be a non-negative integer");
  }
  if (!Number.isFinite(out.withDuplicates) || out.withDuplicates < 0) {
    throw new Error("--with-duplicates must be a non-negative integer");
  }
  return out;
}

function generate(opts: GenOptions): GeneratedRecord[] {
  if (opts.task === "boundary") {
    return generateBoundary({
      size: "small",
      seed: opts.seed,
      withMultiSource: opts.withBoundaryMultiSource,
    }).records;
  }
  if (opts.task === "multi-label") {
    return generateMultiLabel({ seed: opts.seed, count: opts.count }).records;
  }
  if (opts.task === "extraction") {
    return generateExtraction({ seed: opts.seed, count: opts.count }).records;
  }
  return generateClassification({
    seed: opts.seed,
    count: opts.count,
    withDuplicates: opts.withDuplicates,
  }).records;
}

/**
 * `labellens init` infers `classification` / `boundary` from the JSONL. For
 * the multi-label dev fixture we want `task: "multi-label"` with the
 * canonical moderation label set — overwrite the inferred config to match.
 */
async function patchConfigForMultiLabel(configPath: string): Promise<void> {
  const parsed = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  parsed.task = "multi-label";
  parsed.labels = [...MULTI_LABELS];
  parsed.output = {
    ...parsed.output,
    csvMultiLabelSeparator: parsed.output.csvMultiLabelSeparator ?? ";",
  };
  await Bun.write(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(
    `Multi-label: rewrote config.task and config.labels (${parsed.labels.length} labels).`,
  );
}

/**
 * `labellens init` infers `classification` / `boundary` from the JSONL and
 * has no way to recognise extraction-shaped object predictions. Rewrite the
 * inferred config to `task: "extraction"` with the canonical fields and a
 * placeholder `labels` array (config schema requires labels.minItems=1 but
 * extraction does not use it).
 */
async function patchConfigForExtraction(configPath: string): Promise<void> {
  const parsed = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  parsed.task = "extraction";
  parsed.labels = ["__placeholder__"];
  parsed.extraction = { fields: [...EXTRACTION_FIELDS] };
  await Bun.write(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(
    `Extraction: rewrote config.task and config.extraction.fields (${EXTRACTION_FIELDS.length} fields).`,
  );
}

/**
 * Append `EXTRA_LABELS` to the inferred `config.labels` so the chip rail's
 * `+N more (r)` hint exercises (only fires when `labels.length > 9`).
 * Default classification template has 7 labels; this push lands at 11.
 */
async function patchConfigForManyLabels(configPath: string): Promise<void> {
  const parsed = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  const existing = new Set(parsed.labels.map((l) => (typeof l === "string" ? l : l.name)));
  for (const extra of EXTRA_LABELS) {
    if (!existing.has(extra)) parsed.labels.push(extra);
  }
  await Bun.write(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(
    `Many-labels: extended config.labels to ${parsed.labels.length} entries (+${EXTRA_LABELS.length}).`,
  );
}

/**
 * Attach a short note to N random records so the `note: <text>` row in
 * the prediction signals block exercises. Notes are drawn from a fixed
 * template list (deterministic via the seed) and sampled without
 * replacement from records that don't already carry one.
 */
function prefillNotesOpen(db: ReturnType<typeof openDb>, opts: GenOptions): void {
  if (opts.withNotes <= 0) return;
  const rand = rng(opts.seed ^ 0xb0b1e);
  const rows = db.$client.prepare("SELECT id FROM records ORDER BY row_index ASC").all() as {
    id: string;
  }[];
  const candidates = rows.slice();
  let written = 0;
  for (let i = 0; i < opts.withNotes && candidates.length > 0; i++) {
    const idx = Math.floor(rand() * candidates.length);
    const row = candidates.splice(idx, 1)[0]!;
    const tpl = NOTE_TEMPLATES[Math.floor(rand() * NOTE_TEMPLATES.length)]!;
    updateRecordNote(db, row.id, tpl);
    written++;
  }
  console.log(`Prefilled notes: ${written}.`);
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

    // Task-appropriate label pool so the relabel prefill doesn't write
    // labels that don't exist in the generated config (e.g. classification
    // labels into a boundary dataset).
    const taskLabels: readonly string[] =
      opts.task === "boundary"
        ? BOUNDARY_LABELS
        : opts.task === "multi-label"
          ? MULTI_LABELS
          : LABELS.filter((l) => l !== "other");
    const otherLabels = taskLabels;
    let reviews = 0;
    for (let i = 0; i < opts.withReviews && candidates.length > 0; i++) {
      const idx = Math.floor(rand() * candidates.length);
      const row = candidates.splice(idx, 1)[0]!;
      const accept = i % 2 === 0;
      const predicted = row.primary_label;
      if (accept) {
        if (!predicted) continue;
        if (opts.task === "extraction") {
          // Only accept extraction predictions whose required fields are
          // all populated — matches the runtime accept gate so the seeded
          // state is realistic and consistent with what `a` would write.
          let parsed: Record<string, unknown> | null;
          try {
            parsed = JSON.parse(predicted) as Record<string, unknown>;
          } catch {
            parsed = null;
          }
          if (!parsed) continue;
          let ok = true;
          for (const f of EXTRACTION_FIELDS) {
            if (!f.required) continue;
            const v = parsed[f.name];
            if (v === null || v === undefined || v === "") {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
        }
        insertReview(db, {
          record_id: row.id,
          status: "accepted",
          final_label: predicted,
          prev_label: null,
          source_of_truth: "human",
        });
      } else if (opts.task === "extraction") {
        // Extraction flip: tweak the predicted object so status='relabeled'.
        // Append " (reviewed)" to `company` and re-encode the canonical
        // object — produces a deterministic, valid relabel.
        let parsed: Record<string, unknown> | null;
        try {
          parsed = predicted ? (JSON.parse(predicted) as Record<string, unknown>) : null;
        } catch {
          parsed = null;
        }
        if (!parsed) continue;
        // Walk fields with source-shape keys (honouring `key` alias) so
        // encodeExtractionObject — which alias-resolves on read — picks
        // every value up. Storing under canonical names would silently
        // drop the `amount` value because the field's `key: "amt"` alias
        // hides it from the encoder.
        const corrected: Record<string, string | null> = {};
        for (const f of EXTRACTION_FIELDS) {
          const sourceKey = (f as { key?: string }).key ?? f.name;
          const v = parsed[f.name];
          corrected[sourceKey] = typeof v === "string" && v.length > 0 ? v : null;
        }
        if (typeof corrected.company === "string" && corrected.company.length > 0) {
          corrected.company = `${corrected.company} (reviewed)`;
        } else {
          corrected.company = "Reviewed Co";
        }
        // Backfill required amount via its source-shape key (`amt`).
        if ((corrected.amt ?? "") === "") corrected.amt = "0.00";
        const finalLabel = encodeExtractionObject(corrected, [...EXTRACTION_FIELDS]);
        insertReview(db, {
          record_id: row.id,
          status: "relabeled",
          final_label: finalLabel,
          prev_label: predicted,
          source_of_truth: "human",
        });
      } else if (opts.task === "multi-label") {
        // Multi-label flip: pick a different single configured label as the
        // committed set so prev != final and status='relabeled' fires.
        const fallback = otherLabels[0]!;
        const flipLabel =
          otherLabels.filter((l) => l !== fallback)[
            Math.floor(rand() * (otherLabels.length - 1))
          ] ?? fallback;
        insertReview(db, {
          record_id: row.id,
          status: "relabeled",
          final_label: encodeLabelSet([flipLabel]),
          prev_label: predicted,
          source_of_truth: "human",
        });
      } else {
        const fallback = otherLabels[0]!;
        const flip =
          predicted && otherLabels.includes(predicted)
            ? (otherLabels.filter((l) => l !== predicted)[
                Math.floor(rand() * (otherLabels.length - 1))
              ] ?? fallback)
            : fallback;
        insertReview(db, {
          record_id: row.id,
          status: "relabeled",
          final_label: flip,
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
  if (opts.withManyLabels && opts.task === "classification") {
    await patchConfigForManyLabels(configPath);
  }
  if (opts.task === "multi-label") {
    await patchConfigForMultiLabel(configPath);
  }
  if (opts.task === "extraction") {
    await patchConfigForExtraction(configPath);
  }
  const config = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  const dbPath = join(dir, ".labellens", "state.db");
  const db = openDb(dbPath);
  try {
    const ingestResult = await ingestFile(
      db,
      dataPath,
      config.input.fields,
      ingestTaskOptionsFromConfig(config),
    );
    console.log(`Ingested ${ingestResult.ingested}, skipped ${ingestResult.skipped}.`);
    for (const w of ingestResult.warnings) console.log(`  warn: ${w}`);
    const signals = runSignals(db);
    console.log(`Signals: wrote ${signals.written} issue rows.`);
    if (!opts.noPrefill && (opts.withMarks > 0 || opts.withReviews > 0)) {
      prefillStateOpen(db, opts);
    }
    if (!opts.noPrefill) prefillNotesOpen(db, opts);
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
