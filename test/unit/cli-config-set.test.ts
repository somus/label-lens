import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigCliError, runConfigCli } from "../../src/cli/config.ts";
import { openDb } from "../../src/store/db.ts";
import { getMeta } from "../../src/store/meta.ts";

function setup(configBody: object): { cwd: string; configPath: string; dbPath: string } {
  const cwd = mkdtempSync(join(tmpdir(), "labellens-config-cli-"));
  const configPath = join(cwd, "labellens.config.json");
  writeFileSync(configPath, JSON.stringify(configBody, null, 2), "utf8");
  const stateDir = join(cwd, ".labellens");
  mkdirSync(stateDir, { recursive: true });
  const dbPath = join(stateDir, "state.db");
  // Touch the db so the CLI can open it.
  const db = openDb(dbPath);
  db.$client.close();
  return { cwd, configPath, dbPath };
}

const BASE = {
  task: "classification" as const,
  labels: ["food"],
  input: { path: "./x.jsonl", format: "jsonl" as const, fields: { text: "text" } },
  output: { path: "./out.jsonl", format: "jsonl" as const },
};

describe("labellens config set", () => {
  test("writes signals.lowConfidence.default in nested shape", async () => {
    const { cwd, configPath } = setup({ ...BASE });
    await runConfigCli({ args: ["set", "signals.lowConfidence.default", "0.6"], cwd });
    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.signals.lowConfidence.default).toBe(0.6);
  });

  test("rejects out-of-range default before touching disk", async () => {
    const { cwd, configPath } = setup({ ...BASE });
    const before = readFileSync(configPath, "utf8");
    await expect(
      runConfigCli({ args: ["set", "signals.lowConfidence.default", "1.5"], cwd }),
    ).rejects.toBeInstanceOf(ConfigCliError);
    expect(readFileSync(configPath, "utf8")).toBe(before);
  });

  test("strips legacy lowConfidenceThreshold from persisted JSON", async () => {
    const { cwd, configPath } = setup({
      ...BASE,
      signals: { lowConfidenceThreshold: 0.4 },
    });
    await runConfigCli({ args: ["set", "signals.lowConfidence.default", "0.6"], cwd });
    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.signals.lowConfidence.default).toBe(0.6);
    expect(written.signals.lowConfidenceThreshold).toBeUndefined();
  });

  test("records applied fingerprint after a successful write", async () => {
    const { cwd, dbPath } = setup({ ...BASE });
    await runConfigCli({ args: ["set", "signals.lowConfidence.default", "0.6"], cwd });
    const db = openDb(dbPath);
    try {
      const stored = getMeta(db, "signals.lowConfidence.applied");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!).default).toBe(0.6);
    } finally {
      db.$client.close();
    }
  });

  test("adds bySource override with pattern=value syntax", async () => {
    const { cwd, configPath } = setup({ ...BASE });
    await runConfigCli({
      args: ["set", "signals.lowConfidence.bySource", "regex.*=0.3", "model-prod=0.7"],
      cwd,
    });
    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.signals.lowConfidence.default).toBeDefined();
    expect(written.signals.lowConfidence.bySource["regex.*"]).toBe(0.3);
    expect(written.signals.lowConfidence.bySource["model-prod"]).toBe(0.7);
  });

  test("config unset removes a bySource entry", async () => {
    const { cwd, configPath } = setup({
      ...BASE,
      signals: { lowConfidence: { default: 0.5, bySource: { "regex.*": 0.3, "model:x": 0.6 } } },
    });
    await runConfigCli({
      args: ["unset", "signals.lowConfidence.bySource", "regex.*"],
      cwd,
    });
    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.signals.lowConfidence.bySource["regex.*"]).toBeUndefined();
    expect(written.signals.lowConfidence.bySource["model:x"]).toBe(0.6);
  });
});
