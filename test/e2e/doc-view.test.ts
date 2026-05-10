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

function boundaryConfig(inputPath: string): LabellensConfig {
  return {
    task: "boundary",
    labels: ["NOISE"],
    boundary: { documentField: "document_id", contextLines: 3 },
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup() {
  const dir = mkdtempSync(join(osTmpdir(), "ll-docview-"));
  const inputPath = join(dir, "data.jsonl");
  const dbPath = join(dir, "state.db");

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push({ text: `DOC1_LINE_${i}`, meta: { document_id: "doc-1" } });
  }
  for (let i = 0; i < 5; i++) {
    rows.push({ text: `DOC2_LINE_${i}`, meta: { document_id: "doc-2" } });
  }
  await Bun.write(inputPath, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);

  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);

  const { renderer, mockInput, captureCharFrame, renderOnce } = await createTestRenderer({
    width: 100,
    height: 30,
  });

  const app = createAppContext({
    db,
    config: boundaryConfig(inputPath),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, captureCharFrame, renderOnce };
}

describe("doc-view screen via g d", () => {
  test("g d opens doc view, shows all lines for the focused document", async () => {
    const { app, mockInput, renderOnce, captureCharFrame } = await setup();
    // initial focused record is the first row → doc-1
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("d");
    await renderOnce();

    expect(app.docView).not.toBeNull();
    expect(app.docView?.documentId).toBe("doc-1");
    const frame = captureCharFrame();
    expect(frame).toContain("Doc view");
    expect(frame).toContain("doc-1");
    for (let i = 0; i < 5; i++) {
      expect(frame).toContain(`DOC1_LINE_${i}`);
    }
    expect(frame).not.toContain("DOC2_LINE_0");
  });

  test("Esc closes doc view, returns to review screen", async () => {
    const { app, mockInput, renderOnce, captureCharFrame } = await setup();
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("d");
    await renderOnce();
    expect(app.docView).not.toBeNull();

    mockInput.pressKey("q");
    await renderOnce();
    expect(app.docView).toBeNull();
    const frame = captureCharFrame();
    expect(frame).toContain("LabelLens");
    expect(frame).not.toContain("Doc view");
  });

  test("entering and leaving doc view preserves queue position; j/k still walks queue order", async () => {
    const { app, mockInput, renderOnce, captureCharFrame } = await setup();

    mockInput.pressKey("j");
    await renderOnce();
    expect(captureCharFrame()).toContain("DOC1_LINE_1");

    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("d");
    await renderOnce();
    expect(app.docView).not.toBeNull();

    mockInput.pressKey("q");
    await renderOnce();
    expect(app.docView).toBeNull();
    expect(captureCharFrame()).toContain("DOC1_LINE_1");

    mockInput.pressKey("j");
    await renderOnce();
    expect(captureCharFrame()).toContain("DOC1_LINE_2");
  });

  test("g d is disabled when record has no document_id; flash shown", async () => {
    const dir = mkdtempSync(join(osTmpdir(), "ll-docview-noid-"));
    const inputPath = join(dir, "data.jsonl");
    const dbPath = join(dir, "state.db");
    await Bun.write(inputPath, `${JSON.stringify({ text: "lone line" })}\n`);
    const db = openDb(dbPath);
    await ingestFile(db, inputPath, DEFAULT_FIELDS);

    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 100,
      height: 24,
    });
    const app = createAppContext({
      db,
      config: boundaryConfig(inputPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app });
    await renderOnce();

    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("d");
    await renderOnce();

    expect(app.docView).toBeNull();
    expect(app.flash?.message).toContain("Doc-view unavailable");
  });
});
