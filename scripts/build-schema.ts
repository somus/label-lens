#!/usr/bin/env bun
/**
 * Emit `schema/labellens.config.schema.json` from `LabellensConfigSchema`.
 * The TypeBox object is JSON-Schema-compatible already; we just serialize it.
 *
 * Run `bun run schema` (or `bun scripts/build-schema.ts`) after touching any
 * field in `src/config/config.ts`. The generated file is committed so editors
 * pull it from raw.githubusercontent.com via the `$schema` field that
 * `labellens init` writes into every project config.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LabellensConfigSchema } from "../src/config/config.ts";

const ROOT = resolve(import.meta.dir, "..");
const OUT_PATH = join(ROOT, "schema", "labellens.config.schema.json");

function main(): void {
  const body = `${JSON.stringify(LabellensConfigSchema, null, 2)}\n`;
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, body, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
