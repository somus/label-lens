import { expect, test } from "bun:test";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { resolveTaskRenderer } from "../../src/screens/review/tasks/index.ts";

function extractionConfig(): LabellensConfig {
  return {
    task: "extraction",
    labels: ["dummy"],
    extraction: {
      fields: [
        { name: "company", type: "string", required: true },
        { name: "amount", type: "string", required: false },
      ],
    },
    input: { path: "x.jsonl", format: "jsonl", fields: { text: "text" } },
    output: { path: "out.jsonl", format: "jsonl" },
  } as unknown as LabellensConfig;
}

test("resolveTaskRenderer returns id='extraction' when task is extraction", () => {
  const r = resolveTaskRenderer(extractionConfig());
  expect(r.id).toBe("extraction");
});

test("extraction renderer is read-only (no record => empty box, no throw)", () => {
  const r = resolveTaskRenderer(extractionConfig());
  const out = r.renderDecision({
    record: null,
    labels: [],
    display: defaultDisplay(),
    contentWidth: 80,
  });
  expect(out).toBeDefined();
});
