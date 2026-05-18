import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LabellensConfigSchema } from "../../src/config/config.ts";

const SCHEMA_PATH = resolve(import.meta.dir, "..", "..", "schema", "labellens.config.schema.json");

describe("committed JSON Schema stays in sync with TypeBox source", () => {
  test("schema/labellens.config.schema.json matches LabellensConfigSchema (run `bun run schema`)", () => {
    const committed = readFileSync(SCHEMA_PATH, "utf8");
    const emitted = `${JSON.stringify(LabellensConfigSchema, null, 2)}\n`;
    expect(committed).toBe(emitted);
  });
});
