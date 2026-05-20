import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { findUnknownLabels } from "../../src/store/labels.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const CONFIGURED = ["spam", "toxicity"];

async function setup(predLabels: string[][]): Promise<{ db: Db; dispose: () => void }> {
  const dir = tmpdir({ prefix: "labellens-unknown-ml-" });
  const db = openDb(join(dir.path, "state.db"));
  const jsonl = join(dir.path, "in.jsonl");
  writeFileSync(
    jsonl,
    `${predLabels
      .map((label, i) => JSON.stringify({ text: `t-${i}`, predictions: [{ label, source: "a" }] }))
      .join("\n")}\n`,
    "utf8",
  );
  // ingest WITHOUT normalisation so unknown labels survive into storage
  // (otherwise the ingest pipeline would already have dropped them).
  await ingestFile(db, jsonl, DEFAULT_FIELDS, {
    task: "multi-label",
    labels: [...CONFIGURED, "harassment", "promotion"],
  });
  return {
    db,
    dispose: () => {
      db.$client.close();
      dir[Symbol.dispose]();
    },
  };
}

test("findUnknownLabels decodes multi-label JSON sets and reports element-level offenders", async () => {
  const { db, dispose } = await setup([
    ["spam", "toxicity"], // all configured
    ["spam", "harassment"], // harassment unknown
    ["promotion", "harassment"], // both unknown
    [], // empty set is valid
  ]);
  try {
    const out = findUnknownLabels(
      db,
      CONFIGURED.map((n) => n),
    );
    const byLabel = new Map(out.map((u) => [u.label, u.count]));
    expect(byLabel.get("harassment")).toBe(2);
    expect(byLabel.get("promotion")).toBe(1);
    expect(byLabel.has("spam")).toBe(false);
    expect(byLabel.has("toxicity")).toBe(false);
    expect(out.find((u) => u.label === "[]")).toBeUndefined();
  } finally {
    dispose();
  }
});

test("findUnknownLabels checks final_label / prev_label JSON sets too", async () => {
  const { db, dispose } = await setup([["spam"]]);
  try {
    const id = db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(db, {
      record_id: id,
      status: "relabeled",
      final_label: '["spam","harassment"]',
      prev_label: '["spam"]',
      source_of_truth: "human",
    });
    const out = findUnknownLabels(
      db,
      CONFIGURED.map((n) => n),
    );
    const byLabel = new Map(out.map((u) => [u.label, u.count]));
    expect(byLabel.get("harassment")).toBe(1);
    expect(byLabel.has("spam")).toBe(false);
  } finally {
    dispose();
  }
});
