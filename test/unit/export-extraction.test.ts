import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { ExtractionField, LabellensConfig } from "../../src/config/config.ts";
import { exportCsvString } from "../../src/export/csv.ts";
import { exportJsonlString } from "../../src/export/jsonl.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../../src/ingest/ingest.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false },
];

const cfg: LabellensConfig = {
  task: "extraction",
  labels: ["dummy"],
  extraction: { fields: FIELDS },
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

type SetupOverrides = {
  status?: "accepted" | "relabeled" | "rejected" | "skipped";
  final_label?: string | null;
};

async function setup(overrides: SetupOverrides = {}): Promise<{
  db: Db;
  id: string;
  dispose: () => void;
}> {
  const dir = tmpdir({ prefix: "labellens-extract-export-" });
  const db = openDb(join(dir.path, "state.db"));
  const file = join(dir.path, "in.jsonl");
  writeFileSync(
    file,
    `${JSON.stringify({
      text: "row",
      predictions: [{ label: { company: "Acme", amount: "100" }, source: "src" }],
    })}\n`,
    "utf8",
  );
  await ingestFile(db, file, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(cfg));
  const id = db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
  insertReview(db, {
    record_id: id,
    status: overrides.status ?? "accepted",
    final_label:
      overrides.final_label === undefined
        ? '{"company":"Acme","amount":"100"}'
        : overrides.final_label,
    prev_label: null,
    source_of_truth: "human",
  });
  return {
    db,
    id,
    dispose: () => {
      db.$client.close();
      dir[Symbol.dispose]();
    },
  };
}

describe("extraction JSONL export", () => {
  test("emits label as the corrected object for accepted/relabeled rows", async () => {
    const { db, dispose } = await setup();
    try {
      const out = exportJsonlString(db, { extraction: { fields: FIELDS } });
      const parsed = JSON.parse(out.trim());
      expect(parsed.label).toEqual({ company: "Acme", amount: "100" });
    } finally {
      dispose();
    }
  });

  test("rejected row included via includeRejected emits label: null", async () => {
    const { db, dispose } = await setup({ status: "rejected", final_label: null });
    try {
      const out = exportJsonlString(db, {
        extraction: { fields: FIELDS },
        includeRejected: true,
      });
      const parsed = JSON.parse(out.trim());
      expect(parsed.label).toBeNull();
    } finally {
      dispose();
    }
  });

  test("honours output.fieldOverrides.label for extraction", async () => {
    const { db, dispose } = await setup();
    try {
      const out = exportJsonlString(db, {
        extraction: { fields: FIELDS },
        fieldOverrides: { label: "extracted" },
      });
      const parsed = JSON.parse(out.trim());
      expect(parsed.extracted).toEqual({ company: "Acme", amount: "100" });
      expect(parsed.label).toBeUndefined();
    } finally {
      dispose();
    }
  });

  test("aborts when a required field is missing in stored value", async () => {
    const { db, id, dispose } = await setup({
      final_label: '{"amount":"100"}',
    });
    try {
      expect(() => exportJsonlString(db, { extraction: { fields: FIELDS } })).toThrow(
        new RegExp(`${id}.*required.*company|company.*${id}`, "i"),
      );
    } finally {
      dispose();
    }
  });

  test("aborts on malformed stored value", async () => {
    const { db, id, dispose } = await setup({ final_label: "not json" });
    try {
      expect(() => exportJsonlString(db, { extraction: { fields: FIELDS } })).toThrow(
        new RegExp(`${id}.*malformed|malformed.*${id}`, "i"),
      );
    } finally {
      dispose();
    }
  });
});

describe("extraction CSV export", () => {
  test("JSON-stringifies the corrected object in the label cell", async () => {
    const { db, dispose } = await setup();
    try {
      const out = exportCsvString(db, { extraction: { fields: FIELDS } });
      const line = out.trim().split("\r\n")[1]!;
      // The cell will be RFC-4180 quoted because the JSON contains commas.
      expect(line).toContain('"{""company"":""Acme"",""amount"":""100""}"');
    } finally {
      dispose();
    }
  });

  test("rejected row included via includeRejected emits a blank label cell", async () => {
    const { db, dispose } = await setup({ status: "rejected", final_label: null });
    try {
      const out = exportCsvString(db, {
        extraction: { fields: FIELDS },
        includeRejected: true,
      });
      const cells = out.trim().split("\r\n")[1]!.split(",");
      expect(cells[2]).toBe("");
    } finally {
      dispose();
    }
  });

  test("aborts on malformed stored value", async () => {
    const { db, id, dispose } = await setup({ final_label: "not json" });
    try {
      expect(() => exportCsvString(db, { extraction: { fields: FIELDS } })).toThrow(
        new RegExp(`${id}.*malformed|malformed.*${id}`, "i"),
      );
    } finally {
      dispose();
    }
  });
});
