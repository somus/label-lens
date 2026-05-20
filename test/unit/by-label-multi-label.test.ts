import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile, ingestTaskOptionsFromConfig } from "../../src/ingest/ingest.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { DEFAULT_FIELDS, tmpdir } from "../util/tmp.ts";

const CONFIGURED = ["spam", "toxicity", "promotion"];

const cfg: LabellensConfig = {
  task: "multi-label",
  labels: CONFIGURED,
  input: { path: "x.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

async function makeStore(): Promise<{ db: Db; dispose: () => void }> {
  const dir = tmpdir({ prefix: "labellens-by-label-" });
  const db = openDb(join(dir.path, "state.db"));
  const jsonl = join(dir.path, "in.jsonl");
  writeFileSync(
    jsonl,
    `${[
      { text: "spam+tox", predictions: [{ label: ["spam", "toxicity"], source: "a" }] },
      { text: "tox only", predictions: [{ label: ["toxicity"], source: "a" }] },
      { text: "promo", predictions: [{ label: ["promotion"], source: "a" }] },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
    "utf8",
  );
  await ingestFile(db, jsonl, DEFAULT_FIELDS, ingestTaskOptionsFromConfig(cfg));
  return {
    db,
    dispose: () => {
      db.$client.close();
      dir[Symbol.dispose]();
    },
  };
}

test("by-label:spam matches multi-label records whose primary set contains spam", async () => {
  const store = await makeStore();
  try {
    const q = resolveQueue("by-label:spam");
    const rows = queueRecords(store.db, q.query);
    expect(rows.length).toBe(1);
    expect(rows[0]?.text).toBe("spam+tox");
  } finally {
    store.dispose();
  }
});

test("by-label:toxicity matches multi-label set membership", async () => {
  const store = await makeStore();
  try {
    const q = resolveQueue("by-label:toxicity");
    const rows = queueRecords(store.db, q.query);
    expect(rows.map((r) => r.text).sort()).toEqual(["spam+tox", "tox only"].sort());
  } finally {
    store.dispose();
  }
});
