import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { LabellensConfig } from "../../src/config/config.ts";
import { exportCsvString } from "../../src/export/csv.ts";
import { exportJsonlString } from "../../src/export/jsonl.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../../src/ingest/ingest.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const cfg: LabellensConfig = {
  task: "multi-label",
  labels: ["spam", "toxicity", "promotion"],
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

type ReviewOverrides = {
  status?: "accepted" | "relabeled" | "rejected" | "skipped";
  final_label?: string | null;
};

async function setup(overrides: ReviewOverrides = {}): Promise<{
  db: Db;
  id: string;
  dispose: () => void;
}> {
  const dir = tmpdir({ prefix: "labellens-export-ml-" });
  const db = openDb(join(dir.path, "state.db"));
  const jsonl = join(dir.path, "in.jsonl");
  writeFileSync(
    jsonl,
    `${JSON.stringify({
      text: "x",
      predictions: [{ label: ["spam", "toxicity"], source: "a" }],
    })}\n`,
    "utf8",
  );
  await ingestFile(db, jsonl, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(cfg));
  const id = db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
  insertReview(db, {
    record_id: id,
    status: overrides.status ?? "accepted",
    final_label:
      overrides.final_label === undefined ? '["spam","toxicity"]' : overrides.final_label,
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

test("JSONL export emits multi-label label as string[] when task is multi-label", async () => {
  const { db, dispose } = await setup();
  try {
    const out = exportJsonlString(db, { multiLabel: true });
    const parsed = JSON.parse(out.trim());
    expect(parsed.label).toEqual(["spam", "toxicity"]);
  } finally {
    dispose();
  }
});

test("JSONL export keeps scalar label when task is single-label (default)", async () => {
  const { db, dispose } = await setup();
  try {
    const out = exportJsonlString(db);
    const parsed = JSON.parse(out.trim());
    // Without the multiLabel flag the JSON-encoded text passes through raw —
    // exporter does not silently decode. Caller is responsible for the flag.
    expect(parsed.label).toBe('["spam","toxicity"]');
  } finally {
    dispose();
  }
});

test("CSV export joins multi-label set with configured separator", async () => {
  const { db, dispose } = await setup();
  try {
    const out = exportCsvString(db, { multiLabel: true, multiLabelSeparator: "|" });
    const lines = out.trim().split("\r\n");
    const cells = lines[1]!.split(",");
    expect(cells[2]).toBe("spam|toxicity");
  } finally {
    dispose();
  }
});

test("JSONL multi-label export fails on an accepted empty array", async () => {
  const { db, id, dispose } = await setup({ final_label: "[]" });
  try {
    expect(() => exportJsonlString(db, { multiLabel: true })).toThrow(
      new RegExp(`empty.*${id}|${id}.*empty`, "i"),
    );
  } finally {
    dispose();
  }
});

test("JSONL multi-label export fails on malformed (non-JSON) final_label", async () => {
  const { db, id, dispose } = await setup({ final_label: "not json" });
  try {
    expect(() => exportJsonlString(db, { multiLabel: true })).toThrow(
      new RegExp(`malformed.*${id}|${id}.*malformed`, "i"),
    );
  } finally {
    dispose();
  }
});

test("JSONL multi-label export fails on non-array JSON final_label", async () => {
  const { db, id, dispose } = await setup({ final_label: '"spam"' });
  try {
    expect(() => exportJsonlString(db, { multiLabel: true })).toThrow(
      new RegExp(`array.*${id}|${id}.*array`, "i"),
    );
  } finally {
    dispose();
  }
});

test("JSONL multi-label export fails on array with non-string element", async () => {
  const { db, id, dispose } = await setup({ final_label: '["spam",42]' });
  try {
    expect(() => exportJsonlString(db, { multiLabel: true })).toThrow(
      new RegExp(`string.*${id}|${id}.*string`, "i"),
    );
  } finally {
    dispose();
  }
});

test("CSV multi-label export fails on accepted empty array", async () => {
  const { db, id, dispose } = await setup({ final_label: "[]" });
  try {
    expect(() => exportCsvString(db, { multiLabel: true })).toThrow(
      new RegExp(`empty.*${id}|${id}.*empty`, "i"),
    );
  } finally {
    dispose();
  }
});

test("CSV multi-label export fails on malformed final_label", async () => {
  const { db, id, dispose } = await setup({ final_label: "not json" });
  try {
    expect(() => exportCsvString(db, { multiLabel: true })).toThrow(
      new RegExp(`malformed.*${id}|${id}.*malformed`, "i"),
    );
  } finally {
    dispose();
  }
});

test("CSV multi-label export fails when a label contains the configured separator", async () => {
  const { db, id, dispose } = await setup({ final_label: '["a;b","c"]' });
  try {
    expect(() => exportCsvString(db, { multiLabel: true })).toThrow(
      new RegExp(`separator.*${id}|${id}.*separator|a;b`, "i"),
    );
  } finally {
    dispose();
  }
});

test("JSONL multi-label honours output.fieldOverrides.label", async () => {
  const { db, dispose } = await setup();
  try {
    const out = exportJsonlString(db, {
      multiLabel: true,
      fieldOverrides: { label: "tags" },
    });
    const parsed = JSON.parse(out.trim());
    expect(parsed.tags).toEqual(["spam", "toxicity"]);
    expect(parsed.label).toBeUndefined();
  } finally {
    dispose();
  }
});

test("JSONL multi-label emits label:null for rejected rows included via includeRejected", async () => {
  const { db, dispose } = await setup({ status: "rejected", final_label: null });
  try {
    const out = exportJsonlString(db, { multiLabel: true, includeRejected: true });
    const parsed = JSON.parse(out.trim());
    expect(parsed.label).toBeNull();
  } finally {
    dispose();
  }
});

test("JSONL multi-label emits label:null for skipped rows included via includeSkipped", async () => {
  const { db, dispose } = await setup({ status: "skipped", final_label: null });
  try {
    const out = exportJsonlString(db, { multiLabel: true, includeSkipped: true });
    const parsed = JSON.parse(out.trim());
    expect(parsed.label).toBeNull();
  } finally {
    dispose();
  }
});

test("CSV multi-label emits blank label cell for rejected rows included via includeRejected", async () => {
  const { db, dispose } = await setup({ status: "rejected", final_label: null });
  try {
    const out = exportCsvString(db, { multiLabel: true, includeRejected: true });
    const cells = out.trim().split("\r\n")[1]!.split(",");
    expect(cells[2]).toBe("");
  } finally {
    dispose();
  }
});

test("CSV multi-label emits blank label cell for skipped rows included via includeSkipped", async () => {
  const { db, dispose } = await setup({ status: "skipped", final_label: null });
  try {
    const out = exportCsvString(db, { multiLabel: true, includeSkipped: true });
    const cells = out.trim().split("\r\n")[1]!.split(",");
    expect(cells[2]).toBe("");
  } finally {
    dispose();
  }
});

test("CSV multi-label export succeeds when configured separator avoids the conflict", async () => {
  const { db, dispose } = await setup({ final_label: '["a;b","c"]' });
  try {
    const out = exportCsvString(db, { multiLabel: true, multiLabelSeparator: "|" });
    const cells = out.trim().split("\r\n")[1]!.split(",");
    expect(cells[2]).toBe("a;b|c");
  } finally {
    dispose();
  }
});
