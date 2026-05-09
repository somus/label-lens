import { describe, expect, test } from "bun:test";
import { InferenceError, inferSchema } from "../../src/config/inference.ts";

describe("schema inference", () => {
  test("infers tiny.jsonl fields", async () => {
    const result = await inferSchema("test/fixtures/tiny.jsonl");
    expect(result.fields.text).toBe("text");
    expect(result.fields.prediction).toBe("prediction");
    expect(result.fields.confidence).toBe("confidence");
    expect(result.fields.source).toBe("source");
    expect(result.fields.context_before).toBe("context_before");
    expect(result.fields.context_after).toBe("context_after");
  });

  test("collects distinct labels from flat prediction and predictions[] arrays", async () => {
    const result = await inferSchema("test/fixtures/tiny.jsonl");
    // tiny.jsonl uses: food, travel, shopping, utility, salary, rent, other, ENTRY_START
    expect(result.labels).toContain("food");
    expect(result.labels).toContain("travel");
    expect(result.labels).toContain("shopping");
    expect(result.labels).toContain("utility");
    expect(result.labels).toContain("salary");
    expect(result.labels).toContain("rent");
    expect(result.labels).toContain("other");
    expect(result.labels).toContain("ENTRY_START");
    // most-frequent first: 'food' appears in 3 records (lines 1, 7, 9)
    expect(result.labels[0]).toBe("food");
  });

  test("throws when text field is unfindable", async () => {
    const tmp = `/tmp/labellens-test-${Date.now()}.jsonl`;
    await Bun.write(tmp, '{"foo": "bar"}\n');
    await expect(inferSchema(tmp)).rejects.toThrow(InferenceError);
  });
});
