import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { openDb } from "../../src/store/db.ts";
import { DEFAULT_FIELDS } from "../util/tmp.ts";

function makeBoundaryConfig(inputPath: string): LabellensConfig {
  return {
    task: "boundary",
    labels: ["SECTION_HEADER", "ENTRY_START", "CONTINUATION", "NOISE"],
    boundary: { documentField: "document_id", contextLines: 3 },
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setupBoundary() {
  const dir = mkdtempSync(join(osTmpdir(), "ll-boundary-"));
  const inputPath = join(dir, "data.jsonl");
  const dbPath = join(dir, "state.db");

  const rows = [
    {
      text: "CANDIDATE_LINE_HERE",
      context_before: "BEFORE_ALPHA\nBEFORE_BRAVO\nBEFORE_CHARLIE\nBEFORE_DELTA",
      context_after: "AFTER_XRAY\nAFTER_YANKEE\nAFTER_ZULU\nAFTER_QUEBEC",
      meta: { document_id: "doc-1" },
      prediction: "ENTRY_START",
      source: "rule.entry_boundary",
    },
  ];
  await Bun.write(inputPath, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);

  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);

  const { renderer, captureCharFrame, renderOnce } = await createTestRenderer({
    width: 100,
    height: 30,
  });

  const app = createAppContext({
    db,
    config: makeBoundaryConfig(inputPath),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();

  return { frame: captureCharFrame(), db };
}

describe("review screen — boundary task context strip", () => {
  test("renders last 3 lines of context_before above focus, first 3 of context_after below", async () => {
    const { frame } = await setupBoundary();

    expect(frame).toContain("CANDIDATE_LINE_HERE");
    // context_before: last 3 of 4 lines → BRAVO/CHARLIE/DELTA (drop ALPHA)
    expect(frame).toContain("BEFORE_BRAVO");
    expect(frame).toContain("BEFORE_CHARLIE");
    expect(frame).toContain("BEFORE_DELTA");
    expect(frame).not.toContain("BEFORE_ALPHA");
    // context_after: first 3 of 4 lines → XRAY/YANKEE/ZULU (drop QUEBEC)
    expect(frame).toContain("AFTER_XRAY");
    expect(frame).toContain("AFTER_YANKEE");
    expect(frame).toContain("AFTER_ZULU");
    expect(frame).not.toContain("AFTER_QUEBEC");
  });

  test("action bar shows [gd] doc hint for boundary task", async () => {
    const { frame } = await setupBoundary();
    expect(frame).toContain("[gd] doc");
  });
});
