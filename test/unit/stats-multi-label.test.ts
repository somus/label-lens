import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { allStats } from "../../src/store/stats.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const cfg: LabellensConfig = {
  task: "multi-label",
  labels: ["spam", "toxicity"],
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

test("basic source-count stats render under multi-label fixture without error", async () => {
  using dir = tmpdir({ prefix: "labellens-stats-ml-" });
  const db = openDb(join(dir.path, "state.db"));
  try {
    const jsonl = join(dir.path, "in.jsonl");
    writeFileSync(
      jsonl,
      `${[
        {
          text: "x",
          predictions: [{ label: ["spam", "toxicity"], source: "modelA", confidence: 0.9 }],
        },
        { text: "y", predictions: [{ label: ["toxicity"], source: "modelB", confidence: 0.6 }] },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n")}\n`,
      "utf8",
    );
    await ingestFile(db, jsonl, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(cfg));
    const ids = db.all<{ id: string }>(sql`SELECT id FROM records`);
    insertReview(db, {
      record_id: ids[0]!.id,
      status: "accepted",
      final_label: '["spam","toxicity"]',
      prev_label: null,
      source_of_truth: "human",
    });
    const stats = allStats(db);
    expect(stats.sections.length).toBeGreaterThan(0);
    // No crash on json-array final_label is the regression assertion.
  } finally {
    db.$client.close();
  }
});
