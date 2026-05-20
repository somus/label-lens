import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigLoadError, loadConfig } from "../../src/config/load.ts";

function writeTmp(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "labellens-cfg-"));
  const path = join(dir, "labellens.config.json");
  writeFileSync(path, body, "utf8");
  return path;
}

describe("loadConfig", () => {
  test("parses + validates a well-formed config", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
      }),
    );
    const config = await loadConfig(path);
    expect(config.labels).toEqual(["food"]);
  });

  test("accepts task: 'multi-label'", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "multi-label",
        labels: ["spam", "toxicity"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
      }),
    );
    const config = await loadConfig(path);
    expect(config.task).toBe("multi-label");
  });

  test("throws ConfigLoadError with parse hint on malformed JSON", async () => {
    const path = writeTmp("{ this is not json");
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigLoadError);
  });

  test("throws ConfigLoadError with schema messages on missing required field", async () => {
    const path = writeTmp(JSON.stringify({ labels: ["food"] }));
    try {
      await loadConfig(path);
      throw new Error("expected loadConfig to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoadError);
      expect((err as ConfigLoadError).errors.length).toBeGreaterThan(0);
    }
  });

  test("migrates legacy signals.lowConfidenceThreshold to nested shape", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
        signals: { lowConfidenceThreshold: 0.7 },
      }),
    );
    const config = await loadConfig(path);
    expect(config.signals?.lowConfidence?.default).toBe(0.7);
    expect(
      (config.signals as { lowConfidenceThreshold?: number }).lowConfidenceThreshold,
    ).toBeUndefined();
  });

  test("nested signals.lowConfidence wins when both legacy and nested present", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
        signals: { lowConfidenceThreshold: 0.4, lowConfidence: { default: 0.7 } },
      }),
    );
    const config = await loadConfig(path);
    expect(config.signals?.lowConfidence?.default).toBe(0.7);
  });

  test("flat 'keys' object is rejected with a migration error", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
        keys: { "record.accept": "y" },
      }),
    );
    try {
      await loadConfig(path);
      throw new Error("expected loadConfig to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoadError);
      const msg = (err as ConfigLoadError).errors.join("\n");
      expect(msg).toContain("keys.overrides");
    }
  });

  test("structured 'keys' shape parses successfully", async () => {
    const path = writeTmp(
      JSON.stringify({
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
        keys: {
          preset: "simple",
          overrides: { "record.accept": "y" },
          presets: { dvorak: { "record.accept": ";" } },
        },
      }),
    );
    const config = await loadConfig(path);
    expect(config.keys?.preset).toBe("simple");
    expect(config.keys?.overrides?.["record.accept"]).toBe("y");
  });

  test("$schema field round-trips without rejecting validation", async () => {
    const path = writeTmp(
      JSON.stringify({
        $schema: "https://example.org/schema.json",
        task: "classification",
        labels: ["food"],
        input: { path: "./x.jsonl", format: "jsonl", fields: { text: "text" } },
        output: { path: "./out.jsonl", format: "jsonl" },
      }),
    );
    const config = await loadConfig(path);
    expect(config.$schema).toBe("https://example.org/schema.json");
  });
});
