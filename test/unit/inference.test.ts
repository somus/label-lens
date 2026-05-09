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

  test("throws when text field is unfindable", async () => {
    const tmp = `/tmp/labellens-test-${Date.now()}.jsonl`;
    await Bun.write(tmp, '{"foo": "bar"}\n');
    await expect(inferSchema(tmp)).rejects.toThrow(InferenceError);
  });
});
