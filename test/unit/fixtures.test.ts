import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  BOUNDARY_LABELS,
  generateBoundary,
  generateClassification,
  serializeJsonl,
} from "../../dev/fixtures/generator.ts";
import { resolveDocumentId } from "../../src/boundary/document.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { recordsInDoc } from "../../src/store/queries.ts";
import { fixturePath, openTmpStore } from "../util/tmp.ts";

type AnyRec = Record<string, unknown> & {
  text: string;
  prediction?: unknown;
  confidence?: unknown;
  source?: unknown;
  context_before?: unknown;
  context_after?: unknown;
  predictions?: { label: unknown; confidence?: unknown; source: unknown }[];
  issues?: { type: unknown; score?: unknown }[];
};

function loadJsonl(name: string): AnyRec[] {
  return readFileSync(fixturePath(name), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AnyRec);
}

describe("tiny.jsonl schema variations", () => {
  const records = loadJsonl("tiny.jsonl");

  test("has 10 records", () => {
    expect(records.length).toBe(10);
  });

  test("at least one record is missing confidence", () => {
    const flat = records.find(
      (r) => typeof r.prediction === "string" && r.confidence === undefined,
    );
    const nested = records.find(
      (r) => Array.isArray(r.predictions) && r.predictions.some((p) => p.confidence === undefined),
    );
    expect(flat || nested).toBeDefined();
  });

  test("at least one record is missing both context fields", () => {
    const hit = records.find(
      (r) => r.context_before === undefined && r.context_after === undefined,
    );
    expect(hit).toBeDefined();
  });

  test("at least one record carries multi-prediction predictions[]", () => {
    const multi = records.find((r) => Array.isArray(r.predictions) && r.predictions.length >= 2);
    expect(multi).toBeDefined();
  });

  test("at least one record carries imported issues[]", () => {
    const withIssues = records.find(
      (r) =>
        Array.isArray(r.issues) &&
        r.issues.some((i) => typeof i.type === "string" && i.type === "label_issue"),
    );
    expect(withIssues).toBeDefined();
  });

  test("every record has non-empty text", () => {
    for (const r of records) expect(typeof r.text === "string" && r.text.length > 0).toBe(true);
  });
});

describe("serializeJsonl edge cases", () => {
  test("empty array serializes to bare newline", () => {
    expect(serializeJsonl([])).toBe("\n");
  });

  test("special characters in text round-trip through JSON.parse", () => {
    const rec = { text: 'line one\nline two with "quotes" and \\backslash' };
    const bytes = serializeJsonl([rec]);
    const parsed = JSON.parse(bytes.trim()) as { text: string };
    expect(parsed.text).toBe(rec.text);
    expect(bytes.endsWith("\n")).toBe(true);
    expect(bytes.split("\n").length - 1).toBe(1);
  });

  test("multiple records are newline-separated with trailing newline", () => {
    const bytes = serializeJsonl([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(bytes).toBe('{"a":1}\n{"a":2}\n{"a":3}\n');
  });
});

describe("generator determinism", () => {
  test("generateClassification produces identical output across two runs", () => {
    const a = generateClassification({ seed: 1, count: 1000 });
    const b = generateClassification({ seed: 1, count: 1000 });
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
    expect(a.truth).toEqual(b.truth);
  });

  test("generateBoundary(large) produces identical output across two runs", () => {
    const a = generateBoundary({ size: "large", seed: 1 });
    const b = generateBoundary({ size: "large", seed: 1 });
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
    expect(a.truth).toEqual(b.truth);
  });

  test("different seeds diverge", () => {
    const a = generateClassification({ seed: 1, count: 100 });
    const b = generateClassification({ seed: 2, count: 100 });
    expect(JSON.stringify(a.records)).not.toBe(JSON.stringify(b.records));
  });
});

describe("generated classification — source distribution + accuracy", () => {
  const { records, truth } = generateClassification({ seed: 1, count: 1000 });

  test("every record has at least one llm:gpt-4 prediction with numeric confidence", () => {
    for (const r of records) {
      const llm = r.predictions.find((p) => p.source === "llm:gpt-4");
      expect(llm).toBeDefined();
      expect(typeof llm?.confidence).toBe("number");
    }
  });

  test("regex.simple appears on ~40% of records, never with confidence", () => {
    let count = 0;
    for (const r of records) {
      const regex = r.predictions.find((p) => p.source === "regex.simple");
      if (regex) {
        count++;
        expect(regex.confidence).toBeUndefined();
      }
    }
    // Generator threshold is `rand() < 0.4`. Window [350, 450] catches an
    // accidental flip to 0.3 or 0.5 while tolerating PRNG variance.
    expect(count).toBeGreaterThanOrEqual(350);
    expect(count).toBeLessThanOrEqual(450);
  });

  test("llm:gpt-4 truth-match rate ∈ [0.80, 0.95]", () => {
    let hits = 0;
    for (let i = 0; i < records.length; i++) {
      const llm = records[i]!.predictions.find((p) => p.source === "llm:gpt-4");
      if (llm && llm.label === truth[i]) hits++;
    }
    const rate = hits / records.length;
    expect(rate).toBeGreaterThanOrEqual(0.8);
    expect(rate).toBeLessThanOrEqual(0.95);
  });

  test("regex.simple truth-match rate ∈ [0.45, 0.70] over the records that have it", () => {
    let total = 0;
    let hits = 0;
    for (let i = 0; i < records.length; i++) {
      const regex = records[i]!.predictions.find((p) => p.source === "regex.simple");
      if (!regex) continue;
      total++;
      if (regex.label === truth[i]) hits++;
    }
    expect(total).toBeGreaterThan(0);
    const rate = hits / total;
    expect(rate).toBeGreaterThanOrEqual(0.45);
    expect(rate).toBeLessThanOrEqual(0.7);
  });
});

function streamLines(name: string): Generator<string, void, unknown> {
  const bytes = readFileSync(fixturePath(name), "utf8");
  return (function* () {
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes.charCodeAt(i) === 10) {
        if (i > start) yield bytes.slice(start, i);
        start = i + 1;
      }
    }
    if (start < bytes.length) yield bytes.slice(start);
  })();
}

describe("fixture sizes + per-record validity", () => {
  test("small.jsonl has exactly 1000 valid records", () => {
    let count = 0;
    for (const line of streamLines("small.jsonl")) {
      const r = JSON.parse(line) as AnyRec;
      expect(typeof r.text).toBe("string");
      expect(r.text.length).toBeGreaterThan(0);
      expect(Array.isArray(r.predictions) && r.predictions.length > 0).toBe(true);
      count++;
    }
    expect(count).toBe(1000);
  });

  test("medium.jsonl has exactly 10000 valid records", () => {
    let count = 0;
    for (const line of streamLines("medium.jsonl")) {
      const r = JSON.parse(line) as AnyRec;
      expect(typeof r.text).toBe("string");
      expect(Array.isArray(r.predictions) && r.predictions.length > 0).toBe(true);
      count++;
    }
    expect(count).toBe(10000);
  });

  test("large.jsonl has exactly 50000 valid records", () => {
    let count = 0;
    for (const line of streamLines("large.jsonl")) {
      const r = JSON.parse(line) as AnyRec;
      expect(typeof r.text).toBe("string");
      expect(Array.isArray(r.predictions) && r.predictions.length > 0).toBe(true);
      count++;
    }
    expect(count).toBe(50000);
  });
});

describe("boundary.jsonl ingest under task: boundary", () => {
  test("ingests 450 records across 3 documents with resolvable document_id", async () => {
    using store = await openTmpStore({ ingest: "boundary.jsonl" });

    const config: LabellensConfig = {
      task: "boundary",
      labels: [...BOUNDARY_LABELS],
      boundary: { documentField: "document_id", contextLines: 3 },
      input: {
        path: fixturePath("boundary.jsonl"),
        format: "jsonl",
        fields: { text: "text" },
      },
      output: { path: "/tmp/out.jsonl", format: "jsonl" },
    };

    const totalRow = store.db.$client
      .prepare("SELECT count(*) as n FROM records_with_primary")
      .get() as { n: number };
    expect(totalRow.n).toBe(450);

    const docs = store.db.$client
      .prepare(
        "SELECT document_id, count(*) as n FROM records_with_primary GROUP BY document_id ORDER BY document_id",
      )
      .all() as { document_id: string; n: number }[];
    expect(docs).toHaveLength(3);
    expect(docs.map((d) => d.document_id).sort()).toEqual(["chat-log-3", "invoice-7", "resume-1"]);
    for (const d of docs) expect(d.n).toBe(150);

    const docResume = recordsInDoc(store.db, "resume-1");
    expect(docResume).toHaveLength(150);
    for (const rec of docResume) {
      expect(resolveDocumentId(rec, config)).toBe("resume-1");
    }

    const labels = store.db.$client
      .prepare("SELECT DISTINCT primary_label FROM records_with_primary")
      .all() as { primary_label: string }[];
    const set = new Set(labels.map((l) => l.primary_label));
    for (const expected of BOUNDARY_LABELS) {
      expect(set.has(expected)).toBe(true);
    }
  });
});

describe("committed fixtures match generator output byte-for-byte", () => {
  test("small.jsonl reproduces from seed 1 / count 1000", () => {
    const bytes = serializeJsonl(generateClassification({ seed: 1, count: 1000 }).records);
    expect(bytes).toBe(readFileSync(fixturePath("small.jsonl"), "utf8"));
  });

  test("medium.jsonl reproduces from seed 2 / count 10000", () => {
    const bytes = serializeJsonl(generateClassification({ seed: 2, count: 10000 }).records);
    expect(bytes).toBe(readFileSync(fixturePath("medium.jsonl"), "utf8"));
  });

  test("large.jsonl reproduces from seed 3 / count 50000", () => {
    const bytes = serializeJsonl(generateClassification({ seed: 3, count: 50000 }).records);
    expect(bytes).toBe(readFileSync(fixturePath("large.jsonl"), "utf8"));
  });

  test("boundary.jsonl reproduces from size large / seed 1", () => {
    const bytes = serializeJsonl(generateBoundary({ size: "large", seed: 1 }).records);
    expect(bytes).toBe(readFileSync(fixturePath("boundary.jsonl"), "utf8"));
  });
});

describe("generated classification — imported issues[] passthrough", () => {
  test("~5% of records carry issues[] (window 3–8%)", () => {
    const { records } = generateClassification({ seed: 1, count: 1000 });
    const withIssues = records.filter((r) => Array.isArray(r.issues) && r.issues.length > 0);
    expect(withIssues.length).toBeGreaterThanOrEqual(30);
    expect(withIssues.length).toBeLessThanOrEqual(80);
    for (const r of withIssues) {
      const issue = r.issues![0]!;
      expect(["label_issue", "ambiguous", "outlier"]).toContain(issue.type);
      expect(typeof issue.score).toBe("number");
    }
  });
});
