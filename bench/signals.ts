#!/usr/bin/env bun
/**
 * Manual perf check for the signals worker. Generates N synthetic records,
 * ingests them into a tmp DB, and prints wall-clock for the signals pass.
 * Acceptance criterion (issue #10): 10K records under 30s on a modern laptop.
 *
 * Automated envelope assertion lives with #15 — this script is for ad-hoc
 * measurement until that lands.
 *
 *   bun run bench/signals.ts                  # default 10000 records
 *   bun run bench/signals.ts --count 50000    # bigger
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestFile } from "../src/ingest/ingest.ts";
import { runSignals } from "../src/signals/run.ts";
import { openDb } from "../src/store/db.ts";

const SOURCES = ["llm:gpt-4", "regex.simple", "model_v1"] as const;
const LABELS = ["food", "travel", "shopping", "utility", "salary", "rent", "other"] as const;

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

function parseArgs(): { count: number; seed: number } {
  const out = { count: 10_000, seed: 1 };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--count") out.count = Number(process.argv[++i]);
    else if (a === "--seed") out.seed = Number(process.argv[++i]);
  }
  if (!Number.isFinite(out.count) || out.count < 1) throw new Error("--count must be >= 1");
  return out;
}

async function main(): Promise<void> {
  const { count, seed } = parseArgs();
  const dir = mkdtempSync(join(tmpdir(), "labellens-bench-"));
  const dataPath = join(dir, "data.jsonl");
  const dbPath = join(dir, "state.db");

  console.log(`Generating ${count} synthetic records (seed=${seed})...`);
  const rand = rng(seed);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const truth = LABELS[Math.floor(rand() * LABELS.length)]!;
    const llmCorrect = rand() < 0.85;
    const llmLabel = llmCorrect ? truth : LABELS[Math.floor(rand() * LABELS.length)]!;
    const llmConf = Math.max(0, Math.min(1, 0.5 + (llmCorrect ? rand() * 0.5 : -rand() * 0.3)));
    const preds: { label: string; confidence?: number; source: string }[] = [
      { label: llmLabel, confidence: Math.round(llmConf * 100) / 100, source: "llm:gpt-4" },
    ];
    if (rand() < 0.4) {
      preds.push({
        label: rand() < 0.55 ? truth : LABELS[Math.floor(rand() * LABELS.length)]!,
        source: SOURCES[1 + Math.floor(rand() * 2)]!,
      });
    }
    const text = `txn-${i}-${Math.floor(rand() * 1e9)}`;
    lines.push(JSON.stringify({ text, predictions: preds }));
  }
  // 1% duplicates
  const dupCount = Math.max(2, Math.floor(count * 0.01));
  for (let i = 0; i < dupCount; i++) {
    lines.push(
      JSON.stringify({
        text: "Recurring monthly subscription",
        context_before: `dup-${i}`,
        predictions: [{ label: "utility", confidence: 0.6, source: "llm:gpt-4" }],
      }),
    );
  }
  await Bun.write(dataPath, `${lines.join("\n")}\n`);

  const db = openDb(dbPath);
  try {
    const t0 = performance.now();
    await ingestFile(db, dataPath, {
      text: "text",
      prediction: "prediction",
      confidence: "confidence",
      source: "source",
      context_before: "context_before",
      context_after: "context_after",
    });
    const ingestMs = performance.now() - t0;

    const t1 = performance.now();
    const result = runSignals(db);
    const signalsMs = performance.now() - t1;

    console.log(`Ingest:  ${ingestMs.toFixed(0)} ms`);
    console.log(`Signals: ${signalsMs.toFixed(0)} ms (${result.written} issue rows)`);
    console.log(`Target (issue #10): signals < 30000 ms at 10000 records.`);
  } finally {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
