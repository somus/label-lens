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
