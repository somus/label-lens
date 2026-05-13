/**
 * Pure fixture generator. Consumed by:
 *   - scripts/gen-fixtures.ts (writes committed fixtures under test/fixtures/)
 *   - scripts/seed-dev.ts     (writes dev playground at /tmp/llens-dev)
 *
 * Determinism: mulberry32 PRNG over 32-bit integer math. Same seed → same
 * record sequence across Bun versions. Output predictions/issues carry no
 * truth label; tests verify accuracy by reading the `truth` array returned
 * alongside `records`.
 */

export type GeneratedRecord = {
  text: string;
  context_before?: string;
  context_after?: string;
  predictions: GeneratedPrediction[];
  issues?: GeneratedIssue[];
  meta?: Record<string, unknown>;
};

export type GeneratedPrediction = {
  label: string;
  confidence?: number;
  source: string;
  reason?: string;
};

export type GeneratedIssue = {
  type: string;
  score: number;
};

export type GeneratedSet = {
  records: GeneratedRecord[];
  truth: string[];
};

export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number, places: number): number {
  const m = 10 ** places;
  return Math.round(n * m) / m;
}

export const LABELS = ["food", "travel", "shopping", "utility", "salary", "rent", "other"] as const;
export type Label = (typeof LABELS)[number];

export const TEMPLATES: { vendor: string; truthLabel: Label; channels: string[] }[] = [
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

export type ClassificationOptions = {
  seed: number;
  count: number;
  /**
   * Inject an exact-duplicate cluster of N records (test/fixtures use 0;
   * seed-dev defaults to 3). When >= 2 and count >= 50, the cluster is
   * prepended so the schema-inference sample picks up `context_before`.
   */
  withDuplicates?: number;
};

/**
 * Two seeded prediction sources:
 *   - llm:gpt-4    ≈ 85% match against vendor truth, confidence numeric
 *   - regex.simple ≈ 55% match, NO confidence, present on ~40% of records
 * A third `model_v1` source appears on ~20% of records.
 * Imported `issues[]` sprinkled on ~5%.
 */
export function generateClassification(opts: ClassificationOptions): GeneratedSet {
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];
  const truth: string[] = [];

  for (let i = 0; i < opts.count; i++) {
    const tpl = pick(rand, TEMPLATES);
    const channel = pick(rand, tpl.channels);
    const ref = Math.floor(rand() * 1e10)
      .toString()
      .padStart(10, "0");
    const amount = (Math.floor(rand() * 50000) / 100).toFixed(2);
    const text = `${channel}/${tpl.vendor.toUpperCase().replace(/\s+/g, "_")}/${ref}/INR${amount}`;

    const llmCorrect = rand() < 0.85;
    const llmLabel = llmCorrect ? tpl.truthLabel : pick(rand, LABELS);
    const llmConf = clamp(0.5 + (llmCorrect ? rand() * 0.5 : -rand() * 0.3));

    const predictions: GeneratedPrediction[] = [
      { label: llmLabel, confidence: round(llmConf, 2), source: "llm:gpt-4" },
    ];

    if (rand() < 0.4) {
      const regexCorrect = rand() < 0.55;
      predictions.push({
        label: regexCorrect ? tpl.truthLabel : pick(rand, LABELS),
        source: "regex.simple",
      });
    }

    if (rand() < 0.2) {
      predictions.push({
        label: tpl.truthLabel,
        confidence: round(0.3 + rand() * 0.4, 2),
        source: "model_v1",
        reason: rand() < 0.5 ? "low_confidence" : undefined,
      });
    }

    const record: GeneratedRecord = { text, predictions };

    if (rand() < 0.05) {
      record.issues = [
        {
          type: pick(rand, ["label_issue", "ambiguous", "outlier"] as const),
          score: round(0.5 + rand() * 0.5, 2),
        },
      ];
    }

    records.push(record);
    truth.push(tpl.truthLabel);
  }

  const dup = opts.withDuplicates ?? 0;
  if (dup >= 2 && opts.count >= 50) {
    const dupText = "Recurring monthly subscription INR499";
    const dupRows: GeneratedRecord[] = [];
    const dupTruth: string[] = [];
    for (let i = 0; i < dup; i++) {
      dupRows.push({
        text: dupText,
        context_before: `dup-cluster-${i}`,
        predictions: [
          { label: "utility", confidence: round(0.6 + rand() * 0.3, 2), source: "llm:gpt-4" },
        ],
      });
      dupTruth.push("utility");
    }
    records.unshift(...dupRows);
    truth.unshift(...dupTruth);
  }

  return { records, truth };
}

export const BOUNDARY_LABELS = ["SECTION_HEADER", "ENTRY_START", "CONTINUATION", "NOISE"] as const;
export type BoundaryLabel = (typeof BOUNDARY_LABELS)[number];

export type BoundaryDoc = { id: string; lines: { text: string; truth: BoundaryLabel }[] };

/**
 * Hand-crafted documents used by both the fixture and dev playground.
 * Templates live in scripts/fixtures/boundary-docs.ts so the long literal
 * data does not bloat the generator module.
 */
import { DOC_TEMPLATES_LARGE, DOC_TEMPLATES_SMALL } from "./boundary-docs.ts";

export type BoundaryOptions = {
  /**
   * "small" — 3 docs × ~15 lines each (~45 records). Used by seed-dev.
   * "large" — 3 docs × ~150 lines each (~450 records). Used by the
   *   committed boundary.jsonl fixture.
   */
  size: "small" | "large";
  seed: number;
};

export function generateBoundary(opts: BoundaryOptions): GeneratedSet {
  const docs = opts.size === "large" ? DOC_TEMPLATES_LARGE : DOC_TEMPLATES_SMALL;
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];
  const truth: string[] = [];
  for (const doc of docs) {
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

      const pred: GeneratedPrediction = {
        label: predLabel,
        confidence: round(conf, 2),
        source: "rule.entry_boundary",
      };
      // context_before / context_after omitted at doc boundaries so the JSONL
      // matches the "undefined means absent" convention in InputRecord and
      // `if (rec.context_before)` consumers cleanly skip first/last lines.
      // Field order matches the convention: text → context_* → predictions → meta.
      const record: GeneratedRecord = {
        text: line.text,
        ...(before.length > 0 ? { context_before: before } : {}),
        ...(after.length > 0 ? { context_after: after } : {}),
        predictions: [pred],
        meta: { document_id: doc.id },
      };
      records.push(record);
      truth.push(line.truth);
    }
  }
  return { records, truth };
}

export function serializeJsonl(rows: ReadonlyArray<unknown>): string {
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
