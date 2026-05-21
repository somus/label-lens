import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { ExtractionField } from "../../src/config/config.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false, key: "amt" },
];

describe("ingest extraction task", () => {
  async function ingestRow(rawObject: unknown): Promise<{
    predictions: { label: string; source: string | null; raw: string | null }[];
    raw: string;
    warnings: string[];
  }> {
    using dir = tmpdir({ prefix: "labellens-ingest-extract-" });
    const db = openDb(join(dir.path, "state.db"));
    const file = join(dir.path, "in.jsonl");
    writeFileSync(file, `${JSON.stringify(rawObject)}\n`, "utf8");
    const result = await ingestFile(db, file, DEFAULT_FIELDS, {
      task: "extraction",
      labels: [],
      extractionFields: FIELDS,
    });
    const predictions = db.all<{ label: string; source: string | null; raw: string | null }>(
      sql`SELECT label, source, raw FROM predictions ORDER BY id`,
    );
    const raw = db.all<{ raw: string }>(sql`SELECT raw FROM records LIMIT 1`)[0]!.raw;
    db.$client.close();
    return { predictions, raw, warnings: result.warnings };
  }

  test("stores prediction label as canonical JSON object text in configured field order", async () => {
    const { predictions } = await ingestRow({
      text: "row",
      predictions: [{ label: { amt: "100", company: "Acme" }, source: "x" }],
    });
    expect(predictions[0]!.label).toBe('{"company":"Acme","amount":"100"}');
  });

  test("preserves unknown source keys verbatim in raw record and prediction.raw", async () => {
    const { raw, predictions } = await ingestRow({
      text: "row",
      notes: "preserve me",
      predictions: [{ label: { company: "Acme", _extra: "v" }, source: "x" }],
    });
    expect(raw).toContain('"notes":"preserve me"');
    expect(predictions[0]!.raw).toContain('"_extra":"v"');
    // But the canonical stored label drops the unknown key.
    expect(predictions[0]!.label).toBe('{"company":"Acme","amount":null}');
  });

  test("drops predictions whose label is not an object, with a warning", async () => {
    const { predictions, warnings } = await ingestRow({
      text: "row",
      predictions: [
        { label: "Acme", source: "bad-string" },
        { label: ["Acme"], source: "bad-array" },
        { label: null, source: "bad-null" },
        { label: { company: "Acme" }, source: "good" },
      ],
    });
    expect(predictions.length).toBe(1);
    expect(predictions[0]!.source).toBe("good");
    expect(warnings.join("\n")).toMatch(/bad-string.*requires object/);
    expect(warnings.join("\n")).toMatch(/bad-array.*requires object/);
    expect(warnings.join("\n")).toMatch(/bad-null.*requires object/);
  });

  test("stores multiple source predictions, each canonicalised", async () => {
    const { predictions } = await ingestRow({
      text: "row",
      predictions: [
        { label: { company: "Acme", amt: "100" }, source: "src1" },
        { label: { company: "Beta" }, source: "src2" },
      ],
    });
    expect(predictions.map((p) => p.source)).toEqual(["src1", "src2"]);
    expect(predictions[0]!.label).toBe('{"company":"Acme","amount":"100"}');
    expect(predictions[1]!.label).toBe('{"company":"Beta","amount":null}');
  });
});
