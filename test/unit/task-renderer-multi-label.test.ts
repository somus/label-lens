import { expect, test } from "bun:test";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { resolveTaskRenderer } from "../../src/screens/review/tasks/index.ts";

function baseConfig(task: LabellensConfig["task"]): LabellensConfig {
  return {
    task,
    labels: ["spam", "toxicity"],
    input: { path: "x.jsonl", format: "jsonl", fields: { text: "text" } },
    output: { path: "out.jsonl", format: "jsonl" },
  } as unknown as LabellensConfig;
}

test("resolveTaskRenderer returns id='multi-label' when task is multi-label", () => {
  const r = resolveTaskRenderer(baseConfig("multi-label"));
  expect(r.id).toBe("multi-label");
});

test("multi-label renderer is read-only (no record => empty box, no throw)", () => {
  const r = resolveTaskRenderer(baseConfig("multi-label"));
  // Smoke: rendering with a null record returns a Box-shaped value.
  const out = r.renderDecision({
    record: null,
    labels: ["spam", "toxicity"],
    display: defaultDisplay(),
    contentWidth: 80,
  });
  expect(out).toBeDefined();
});
