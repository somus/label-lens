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

// --- deterministic PRNG (mulberry32) ---
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

// --- domain ---
const LABELS = ["food", "travel", "shopping", "utility", "salary", "rent", "other"] as const;
type Label = (typeof LABELS)[number];

const TEMPLATES: { vendor: string; truthLabel: Label; channels: string[] }[] = [
  { vendor: "Zomato", truthLabel: "food", channels: ["UPI", "Card"] },
  { vendor: "Swiggy", truthLabel: "food", channels: ["UPI", "Card"] },
  { vendor: "Blue Tokai", truthLabel: "food", channels: ["UPI"] },
  { vendor: "Uber", truthLabel: "travel", channels: ["Card"] },
  { vendor: "Ola", truthLabel: "travel", channels: ["Card", "UPI"] },
  { vendor: "Indigo", truthLabel: "travel", channels: ["Card"] },
  { vendor: "Amazon", truthLabel: "shopping", channels: ["Card", "UPI"] },
  { vendor: "Flipkart", truthLabel: "shopping", channels: ["UPI"] },
  { vendor: "Myntra", truthLabel: "shopping", channels: ["Card"] },
  { vendor: "Netflix", truthLabel: "utility", channels: ["Card"] },
  { vendor: "Spotify", truthLabel: "utility", channels: ["Card"] },
  { vendor: "Jio Recharge", truthLabel: "utility", channels: ["UPI"] },
  { vendor: "Acme Corp Salary", truthLabel: "salary", channels: ["NEFT"] },
  { vendor: "Quarterly Bonus", truthLabel: "salary", channels: ["NEFT"] },
  { vendor: "Landlord Transfer", truthLabel: "rent", channels: ["IMPS", "NEFT"] },
];

type GeneratedRecord = {
  text: string;
  context_before?: string;
  context_after?: string;
  predictions: { label: string; confidence?: number; source: string; reason?: string }[];
  issues?: { type: string; score: number }[];
  meta?: Record<string, unknown>;
};

function generate(opts: GenOptions): GeneratedRecord[] {
  if (opts.task === "boundary") return generateBoundary(opts);
  return generateClassification(opts);
}

function generateClassification(opts: GenOptions): GeneratedRecord[] {
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];

  for (let i = 0; i < opts.count; i++) {
    const tpl = pick(rand, TEMPLATES);
    const channel = pick(rand, tpl.channels);
    const ref = Math.floor(rand() * 1e10)
      .toString()
      .padStart(10, "0");
    const amount = (Math.floor(rand() * 50000) / 100).toFixed(2);
    const text = `${channel}/${tpl.vendor.toUpperCase().replace(/\s+/g, "_")}/${ref}/INR${amount}`;

    // primary llm prediction: usually correct, with a confidence drift
    const llmCorrect = rand() < 0.85;
    const llmLabel = llmCorrect ? tpl.truthLabel : pick(rand, LABELS);
    const llmConf = clamp(0.5 + (llmCorrect ? rand() * 0.5 : -rand() * 0.3));

    const predictions: GeneratedRecord["predictions"] = [
      { label: llmLabel, confidence: round(llmConf, 2), source: "llm:gpt-4" },
    ];

    // sometimes a noisier regex source disagrees
    if (rand() < 0.4) {
      const regexCorrect = rand() < 0.55;
      predictions.push({
        label: regexCorrect ? tpl.truthLabel : pick(rand, LABELS),
        source: "regex.simple",
      });
    }

    // sometimes a model_v1 third source
    if (rand() < 0.2) {
      predictions.push({
        label: tpl.truthLabel,
        confidence: round(0.3 + rand() * 0.4, 2),
        source: "model_v1",
        reason: rand() < 0.5 ? "low_confidence" : undefined,
      });
    }

    const record: GeneratedRecord = { text, predictions };

    // sprinkle imported issues on ~5% of records
    if (rand() < 0.05) {
      record.issues = [
        {
          type: pick(rand, ["label_issue", "ambiguous", "outlier"] as const),
          score: round(0.5 + rand() * 0.5, 2),
        },
      ];
    }

    records.push(record);
  }

  if (opts.withDuplicates >= 2 && opts.count >= 50) {
    const dupText = "Recurring monthly subscription INR499";
    const dupRows: GeneratedRecord[] = [];
    for (let i = 0; i < opts.withDuplicates; i++) {
      dupRows.push({
        text: dupText,
        context_before: `dup-cluster-${i}`,
        predictions: [
          { label: "utility", confidence: round(0.6 + rand() * 0.3, 2), source: "llm:gpt-4" },
        ],
      });
    }
    // Prepend so the schema-inference sample (first 100 records) sees the
    // context_before field — otherwise inferSchema misses it and ingest
    // collapses the cluster to a single content-hash ID. Cluster size stays
    // far below the 50% threshold that would flip the inferred task to
    // 'boundary'.
    records.unshift(...dupRows);
  }

  return records;
}

const BOUNDARY_LABELS = ["SECTION_HEADER", "ENTRY_START", "CONTINUATION", "NOISE"] as const;

const DOC_TEMPLATES: { id: string; lines: { text: string; truth: string }[] }[] = [
  {
    id: "resume-1",
    lines: [
      { text: "Jane Smith", truth: "ENTRY_START" },
      { text: "San Francisco, CA · jane@example.com", truth: "CONTINUATION" },
      { text: "EXPERIENCE", truth: "SECTION_HEADER" },
      { text: "Staff Engineer at Globex", truth: "ENTRY_START" },
      { text: "Led the storage team rewrite", truth: "CONTINUATION" },
      { text: "Mentored 4 engineers across 2 teams", truth: "CONTINUATION" },
      { text: "Reduced p99 latency by 40%", truth: "CONTINUATION" },
      { text: "Senior Engineer at Initech", truth: "ENTRY_START" },
      { text: "Built the payments ingestion pipeline", truth: "CONTINUATION" },
      { text: "Migrated three services to gRPC", truth: "CONTINUATION" },
      { text: "EDUCATION", truth: "SECTION_HEADER" },
      { text: "BS Computer Science, MIT, 2017", truth: "ENTRY_START" },
      { text: "Coursework: distributed systems, ML", truth: "CONTINUATION" },
      { text: "SKILLS", truth: "SECTION_HEADER" },
      { text: "Go, Rust, TypeScript, SQL", truth: "CONTINUATION" },
    ],
  },
  {
    id: "invoice-7",
    lines: [
      { text: "INVOICE #2026-0042", truth: "ENTRY_START" },
      { text: "Date: 2026-04-12", truth: "CONTINUATION" },
      { text: "Bill To:", truth: "SECTION_HEADER" },
      { text: "Acme Corporation", truth: "ENTRY_START" },
      { text: "123 Market Street, San Francisco, CA 94103", truth: "CONTINUATION" },
      { text: "Items:", truth: "SECTION_HEADER" },
      { text: "1x Engineering audit — $2,400", truth: "ENTRY_START" },
      { text: "2x Code review session — $1,800", truth: "ENTRY_START" },
      { text: "Subtotal: $4,200", truth: "CONTINUATION" },
      { text: "Tax: $360", truth: "CONTINUATION" },
      { text: "Total: $4,560", truth: "CONTINUATION" },
      { text: "Payment Terms:", truth: "SECTION_HEADER" },
      { text: "Net 30, wire transfer preferred", truth: "CONTINUATION" },
    ],
  },
  {
    id: "chat-log-3",
    lines: [
      { text: "[2026-04-12 09:01] standup channel", truth: "SECTION_HEADER" },
      { text: "alice: morning everyone", truth: "ENTRY_START" },
      { text: "bob: morning", truth: "ENTRY_START" },
      { text: "carol: morning, what's on the board today?", truth: "ENTRY_START" },
      { text: "alice: I'm picking up the boundary task slice", truth: "CONTINUATION" },
      { text: "bob: nice. need a review on PR #28", truth: "CONTINUATION" },
      { text: "carol: I'll grab it after lunch", truth: "CONTINUATION" },
      { text: "alice: thanks", truth: "CONTINUATION" },
      { text: "[2026-04-12 14:22] random channel", truth: "SECTION_HEADER" },
      { text: "bob: anyone seen the migration error?", truth: "ENTRY_START" },
      { text: "alice: which one", truth: "CONTINUATION" },
      { text: "bob: 0006 doc-id view", truth: "CONTINUATION" },
      { text: "alice: looking", truth: "CONTINUATION" },
      { text: "alice: lgtm now, was a stale snapshot", truth: "CONTINUATION" },
      { text: "       ", truth: "NOISE" },
    ],
  },
];

function generateBoundary(opts: GenOptions): GeneratedRecord[] {
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];
  for (const doc of DOC_TEMPLATES) {
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i]!;
      const before = doc.lines
        .slice(Math.max(0, i - 4), i)
        .map((l) => l.text)
        .join("\n");
      const after = doc.lines
        .slice(i + 1, i + 5)
        .map((l) => l.text)
        .join("\n");

      const correct = rand() < 0.85;
      const predLabel = correct ? line.truth : pick(rand, BOUNDARY_LABELS);
      const conf = clamp(0.5 + (correct ? rand() * 0.5 : -rand() * 0.3));

      records.push({
        text: line.text,
        context_before: before,
        context_after: after,
        predictions: [
          { label: predLabel, confidence: round(conf, 2), source: "rule.entry_boundary" },
        ],
        meta: { document_id: doc.id },
      });
    }
  }
  return records;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number, places: number): number {
  const m = 10 ** places;
  return Math.round(n * m) / m;
}

async function writeJsonl(path: string, rows: GeneratedRecord[]): Promise<void> {
  await Bun.write(path, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
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
