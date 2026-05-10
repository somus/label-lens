import { describe, expect, test } from "bun:test";
import { resolveDocumentId } from "../../src/boundary/document.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { RecordWithPrimaryPrediction } from "../../src/types.ts";

function makeRecord(overrides: Partial<RecordWithPrimaryPrediction>): RecordWithPrimaryPrediction {
  return {
    id: "r1",
    source_path: "/x",
    row_index: 0,
    text: "t",
    context_before: null,
    context_after: null,
    raw: "{}",
    note: null,
    document_id: null,
    primaryPrediction: null,
    latestReview: null,
    ...overrides,
  };
}

const BOUNDARY: LabellensConfig = {
  task: "boundary",
  labels: ["NOISE"],
  boundary: { documentField: "document_id", contextLines: 3 },
  input: { path: "/x", format: "jsonl", fields: { text: "text" } },
  output: { path: "/y", format: "jsonl" },
};

describe("resolveDocumentId", () => {
  test("returns view-provided document_id when present (default field)", () => {
    expect(resolveDocumentId(makeRecord({ document_id: "doc-7" }), BOUNDARY)).toBe("doc-7");
  });

  test("returns null when no document_id resolved", () => {
    expect(resolveDocumentId(makeRecord({ raw: "{}" }), BOUNDARY)).toBeNull();
  });

  test("custom documentField: reads from raw JSON top-level", () => {
    const cfg: LabellensConfig = {
      ...BOUNDARY,
      boundary: { documentField: "doc_uuid", contextLines: 3 },
    };
    const rec = makeRecord({ raw: JSON.stringify({ doc_uuid: "abc-123" }) });
    expect(resolveDocumentId(rec, cfg)).toBe("abc-123");
  });

  test("custom documentField: falls back to meta.document_id then meta.doc", () => {
    const cfg: LabellensConfig = {
      ...BOUNDARY,
      boundary: { documentField: "doc_uuid", contextLines: 3 },
    };
    const recA = makeRecord({ raw: JSON.stringify({ meta: { document_id: "m1" } }) });
    expect(resolveDocumentId(recA, cfg)).toBe("m1");
    const recB = makeRecord({ raw: JSON.stringify({ meta: { doc: "m2" } }) });
    expect(resolveDocumentId(recB, cfg)).toBe("m2");
  });

  test("returns null when task is not boundary", () => {
    const cfg: LabellensConfig = { ...BOUNDARY, task: "classification", boundary: undefined };
    expect(resolveDocumentId(makeRecord({ document_id: "doc-7" }), cfg)).toBeNull();
  });

  test("null record returns null", () => {
    expect(resolveDocumentId(null, BOUNDARY)).toBeNull();
  });
});
