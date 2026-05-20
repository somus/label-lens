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

async function setup(): Promise<{
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
    status: "accepted",
    final_label: '["spam","toxicity"]',
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
