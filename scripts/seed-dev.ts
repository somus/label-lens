#!/usr/bin/env bun

/**
 * Seed a dev playground at $LL_DEV_DIR (default /tmp/llens-dev) with a
 * deterministic, realistic JSONL fixture and an initialised
 * labellens.config.json. Idempotent: nukes the dir first.
 *
 * Usage:
 *   bun run scripts/seed-dev.ts                # default 150 records
 *   bun run scripts/seed-dev.ts --count 1000   # bigger
 *   bun run scripts/seed-dev.ts --seed 42      # different deterministic dataset
 *   LL_DEV_DIR=/tmp/foo bun run scripts/seed-dev.ts
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

type GenOptions = { count: number; seed: number };

function parseArgs(): GenOptions {
  const out: GenOptions = { count: 150, seed: 1 };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--count") out.count = Number(process.argv[++i]);
    else if (arg === "--seed") out.seed = Number(process.argv[++i]);
  }
  if (!Number.isFinite(out.count) || out.count < 1) {
    throw new Error("--count must be a positive integer");
  }
  if (!Number.isFinite(out.seed)) throw new Error("--seed must be a number");
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
  predictions: { label: string; confidence?: number; source: string; reason?: string }[];
  issues?: { type: string; score: number }[];
};

function generate(opts: GenOptions): GeneratedRecord[] {
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

async function main(): Promise<void> {
  const opts = parseArgs();
  const dir = process.env.LL_DEV_DIR || "/tmp/llens-dev";
  const dataPath = join(dir, "data.jsonl");

  console.log(`Seeding ${dir} with ${opts.count} records (seed=${opts.seed})...`);
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
