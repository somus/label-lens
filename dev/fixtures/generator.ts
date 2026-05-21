/**
 * Pure fixture generator. Consumed by:
 *   - dev/gen-fixtures.ts (writes committed fixtures under test/fixtures/)
 *   - dev/seed-dev.ts     (writes dev playground at /tmp/llens-dev)
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
  label: string | string[] | Record<string, string | null>;
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
 * Templates live in dev/fixtures/boundary-docs.ts so the long literal
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
  /**
   * Inject a second prediction source (`model_v1`) on ~30% of records so
   * the agreement + alternatives rows in the signals region exercise
   * under the boundary task. Off by default — committed fixtures keep
   * the single-source `rule.entry_boundary` baseline for byte
   * reproducibility.
   */
  withMultiSource?: boolean;
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

      const predictions: GeneratedPrediction[] = [
        {
          label: predLabel,
          confidence: round(conf, 2),
          source: "rule.entry_boundary",
        },
      ];

      // Optional second source so the agreement + alternatives rows
      // exercise under the boundary task. Roughly 30% of records carry
      // it; the source agrees ~60% of the time to make disagreement a
      // realistic minority signal.
      if (opts.withMultiSource && rand() < 0.3) {
        const secondCorrect = rand() < 0.6;
        const secondLabel = secondCorrect ? line.truth : pick(rand, BOUNDARY_LABELS);
        predictions.push({
          label: secondLabel,
          confidence: round(0.4 + rand() * 0.4, 2),
          source: "model_v1",
        });
      }

      // context_before / context_after omitted at doc boundaries so the JSONL
      // matches the "undefined means absent" convention in InputRecord and
      // `if (rec.context_before)` consumers cleanly skip first/last lines.
      // Field order matches the convention: text → context_* → predictions → meta.
      const record: GeneratedRecord = {
        text: line.text,
        ...(before.length > 0 ? { context_before: before } : {}),
        ...(after.length > 0 ? { context_after: after } : {}),
        predictions,
        meta: { document_id: doc.id },
      };
      records.push(record);
      truth.push(line.truth);
    }
  }
  return { records, truth };
}

/**
 * Multi-label content-moderation fixture. Labels overlap on the same row
 * (a comment can be both spam + toxicity, or promotion + spam) so the
 * relabel picker's Space-toggle / Enter-commit flow exercises and the
 * by-label:<l> set-membership predicate has real hits.
 */
export const MULTI_LABELS = [
  "spam",
  "toxicity",
  "promotion",
  "off-topic",
  "harassment",
  "self-promo",
] as const;
export type MultiLabel = (typeof MULTI_LABELS)[number];

type MultiLabelTemplate = { text: string; truth: MultiLabel[] };

const MULTI_LABEL_TEMPLATES: MultiLabelTemplate[] = [
  { text: "buy cheap watches now www.cheap-watches.example", truth: ["spam", "promotion"] },
  { text: "you are a complete idiot, nobody likes you", truth: ["toxicity", "harassment"] },
  { text: "discount code XYZ at checkout, limited time!!!", truth: ["promotion", "spam"] },
  { text: "this is so dumb, the author should be fired", truth: ["toxicity"] },
  { text: "great recipe, will try this weekend", truth: [] },
  { text: "check my channel youtube.com/@me for similar content", truth: ["self-promo"] },
  { text: "what does this have to do with the original post?", truth: ["off-topic"] },
  {
    text: "morons like you should not be allowed to comment, get a brain",
    truth: ["toxicity", "harassment"],
  },
  {
    text: "FREE iPhone giveaway just click here ===> sketchy.link",
    truth: ["spam", "promotion"],
  },
  { text: "I disagree but appreciate the perspective", truth: [] },
  { text: "subscribe to my newsletter for more tips", truth: ["self-promo", "promotion"] },
  {
    text: "off-topic but has anyone tried the new burger place downtown",
    truth: ["off-topic"],
  },
  { text: "go kill yourself you absolute waste", truth: ["toxicity", "harassment"] },
  { text: "thanks for sharing, this was helpful", truth: [] },
  { text: "DM me for crypto signals 50% return guaranteed", truth: ["spam", "promotion"] },
];

export type MultiLabelOptions = {
  seed: number;
  count: number;
};

/**
 * Two seeded multi-label sources:
 *   - moderator:gpt   ≈ 75% exact-set match, noisy on edges (adds spurious
 *                       label ~15%, drops a true label ~10%)
 *   - heuristic.rules ≈ 50% exact-set match, present on ~40% of records,
 *                       no confidence
 */
export function generateMultiLabel(opts: MultiLabelOptions): GeneratedSet {
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];
  const truth: string[] = [];

  for (let i = 0; i < opts.count; i++) {
    const tpl = pick(rand, MULTI_LABEL_TEMPLATES);
    const ts = Math.floor(rand() * 1e10)
      .toString()
      .padStart(10, "0");
    const text = `[${ts}] ${tpl.text}`;
    const primary = mutateSet(rand, tpl.truth, 0.75, 0.1, 0.15);
    const primaryConf = clamp(0.5 + (setEquals(primary, tpl.truth) ? rand() * 0.5 : -rand() * 0.3));
    const predictions: GeneratedPrediction[] = [
      {
        label: canonicalise(primary),
        confidence: round(primaryConf, 2),
        source: "moderator:gpt",
      },
    ];
    if (rand() < 0.4) {
      const secondary = mutateSet(rand, tpl.truth, 0.5, 0.2, 0.25);
      predictions.push({
        label: canonicalise(secondary),
        source: "heuristic.rules",
      });
    }
    if (rand() < 0.05) {
      records.push({
        text,
        predictions,
        issues: [
          {
            type: pick(rand, ["ambiguous", "edge_case", "label_issue"] as const),
            score: round(0.5 + rand() * 0.5, 2),
          },
        ],
      });
    } else {
      records.push({ text, predictions });
    }
    truth.push(JSON.stringify(canonicalise(tpl.truth)));
  }
  return { records, truth };
}

function canonicalise(set: readonly MultiLabel[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of MULTI_LABELS) {
    if (set.includes(name) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

function setEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  for (const v of b) if (!s.has(v)) return false;
  return true;
}

function mutateSet(
  rand: () => number,
  truth: readonly MultiLabel[],
  exactRate: number,
  dropRate: number,
  addRate: number,
): MultiLabel[] {
  if (rand() < exactRate) return [...truth];
  const set = new Set<MultiLabel>(truth);
  for (const t of truth) {
    if (rand() < dropRate) set.delete(t);
  }
  for (const l of MULTI_LABELS) {
    if (!set.has(l) && rand() < addRate) set.add(l);
  }
  return [...set];
}

/**
 * Extra classification labels used by seed-dev's `--with-many-labels` flag.
 * Bumps the configured label set past 9 so the `+N more (r)` chip-rail
 * hint exercises. Templates don't target these labels, so they appear
 * only as occasional `regex.simple`/`model_v1` mis-predictions if at
 * all — usually they sit unused in the config and surface only via the
 * picker overlay's `r` flow.
 */
export const EXTRA_LABELS = ["entertainment", "healthcare", "education", "fitness"] as const;

/**
 * Extraction task fixture. Structured invoice-extraction shape: every
 * record carries a `predictions[]` array whose `label` is an object keyed
 * by configured field names. Two seeded sources produce a mix of
 * exact-match, partial, and dropped-required-field rows so the reviewer's
 * accept / form-edit / reject paths all exercise on first launch.
 */
export const EXTRACTION_FIELDS = [
  { name: "company", type: "string" as const, required: true },
  { name: "amount", type: "string" as const, required: true, key: "amt" },
  { name: "date", type: "string" as const, required: false },
] as const;

type ExtractionTruth = { company: string; amount: string; date: string | null };
type ExtractionTemplate = { text: string; truth: ExtractionTruth };

const EXTRACTION_TEMPLATES: ExtractionTemplate[] = [
  {
    text: "Invoice #4012 from Acme Industries for $1,250.00 dated 2026-05-10",
    truth: { company: "Acme Industries", amount: "1250.00", date: "2026-05-10" },
  },
  {
    text: "Receipt from BetaCorp; total 99.99 USD on 2026-04-22",
    truth: { company: "BetaCorp", amount: "99.99", date: "2026-04-22" },
  },
  {
    text: "Wire transfer to Gamma LLC — see attached PDF for $2,400",
    truth: { company: "Gamma LLC", amount: "2400.00", date: null },
  },
  {
    text: "Refund issued by Delta on May 3 for $42.00",
    truth: { company: "Delta", amount: "42.00", date: "2026-05-03" },
  },
  {
    text: "Subscription renewal: Epsilon Cloud $19.99/mo billed 2026-05-15",
    truth: { company: "Epsilon Cloud", amount: "19.99", date: "2026-05-15" },
  },
  {
    text: "Hotel charge — Zeta Inn, $325.50, checkout 2026-04-29",
    truth: { company: "Zeta Inn", amount: "325.50", date: "2026-04-29" },
  },
  {
    text: "Vendor payment to Eta Logistics, total 1875.00 USD, 2026-04-15",
    truth: { company: "Eta Logistics", amount: "1875.00", date: "2026-04-15" },
  },
];

export type ExtractionOptions = {
  seed: number;
  count: number;
};

export function generateExtraction(opts: ExtractionOptions): GeneratedSet {
  const rand = rng(opts.seed);
  const records: GeneratedRecord[] = [];
  const truth: string[] = [];

  for (let i = 0; i < opts.count; i++) {
    const tpl = pick(rand, EXTRACTION_TEMPLATES);
    const ts = Math.floor(rand() * 1e10)
      .toString()
      .padStart(10, "0");
    const text = `[${ts}] ${tpl.text}`;
    const primary = mutateExtraction(rand, tpl.truth, /*exactRate*/ 0.7);
    const primaryConf = clamp(
      0.55 + (exactMatch(primary, tpl.truth) ? rand() * 0.4 : -rand() * 0.3),
    );
    const predictions: GeneratedPrediction[] = [
      {
        // Use the `amt` source key so the `key` alias on the amount field
        // exercises ingest's alias-resolution path.
        label: toSourceShape(primary),
        confidence: round(primaryConf, 2),
        source: "extractor:gpt",
      },
    ];
    if (rand() < 0.35) {
      const secondary = mutateExtraction(rand, tpl.truth, 0.4);
      predictions.push({
        label: toSourceShape(secondary),
        source: "regex.invoices",
      });
    }
    if (rand() < 0.08) {
      records.push({
        text,
        predictions,
        issues: [
          {
            type: pick(rand, ["ambiguous", "edge_case", "label_issue"] as const),
            score: round(0.5 + rand() * 0.5, 2),
          },
        ],
      });
    } else {
      records.push({ text, predictions });
    }
    truth.push(
      JSON.stringify({
        company: tpl.truth.company,
        amount: tpl.truth.amount,
        date: tpl.truth.date,
      }),
    );
  }
  return { records, truth };
}

function toSourceShape(obj: {
  company: string | null;
  amount: string | null;
  date: string | null;
}): Record<string, string | null> {
  // Source JSON uses `amt` (the `key` alias) instead of `amount`.
  return { company: obj.company, amt: obj.amount, date: obj.date };
}

function exactMatch(
  a: { company: string | null; amount: string | null; date: string | null },
  b: ExtractionTruth,
): boolean {
  return a.company === b.company && a.amount === b.amount && (a.date ?? null) === (b.date ?? null);
}

function mutateExtraction(
  rand: () => number,
  truth: ExtractionTruth,
  exactRate: number,
): { company: string | null; amount: string | null; date: string | null } {
  if (rand() < exactRate) {
    return { company: truth.company, amount: truth.amount, date: truth.date };
  }
  // Wrong-amount, missing-date, missing-company-required, slight typo —
  // each at modest probability so the reviewer's `a`-refuses, edit, and
  // reject paths all see at least one row in a 30-row dataset.
  const r = rand();
  if (r < 0.25) {
    return { company: truth.company, amount: null, date: truth.date }; // required field dropped
  }
  if (r < 0.45) {
    return { company: null, amount: truth.amount, date: truth.date }; // required field dropped
  }
  if (r < 0.65) {
    const bumped = truth.amount.replace(/\.\d+$/, "") || truth.amount;
    return { company: truth.company, amount: bumped, date: truth.date }; // partial change
  }
  if (r < 0.85) {
    return { company: truth.company, amount: truth.amount, date: null }; // optional dropped
  }
  return { company: `${truth.company}, Inc.`, amount: truth.amount, date: truth.date }; // tweak
}

export function serializeJsonl(rows: ReadonlyArray<unknown>): string {
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
