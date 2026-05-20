import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import {
  MISSING_CONFIG_MESSAGE,
  prepareReviewState,
  ReviewSetupError,
  shouldShowMissingConfigSplash,
} from "../../src/cli/run.ts";
import { readFingerprint } from "../../src/ingest/fingerprint.ts";
import { openDb } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, fixturePath, tmpdir } from "../util/tmp.ts";

const ALL_TINY_LABELS = [
  "food",
  "travel",
  "shopping",
  "utility",
  "salary",
  "rent",
  "other",
  "ENTRY_START",
];

describe("runReview missing-config behavior", () => {
  test("shows splash only when stdin and stdout are TTYs", () => {
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: true, stdoutIsTTY: true })).toBe(true);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: false, stdoutIsTTY: true })).toBe(false);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: true, stdoutIsTTY: false })).toBe(false);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: undefined, stdoutIsTTY: true })).toBe(false);
  });

  test("keeps the non-TTY error guidance actionable", () => {
    expect(MISSING_CONFIG_MESSAGE).toContain("no labellens.config.json");
    expect(MISSING_CONFIG_MESSAGE).toContain("labellens init <file.jsonl>");
  });
});

function writeConfig(
  dir: string,
  inputPath: string,
  overrides: Partial<Record<string, unknown>> = {},
): void {
  const config = {
    task: "classification",
    labels: ALL_TINY_LABELS,
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: join(dir, "reviewed.jsonl"), format: "jsonl" },
    ...overrides,
  };
  writeFileSync(join(dir, "labellens.config.json"), `${JSON.stringify(config)}\n`);
}

async function prepareAndClose(dir: string) {
  const messages: string[] = [];
  const prepared = await prepareReviewState({
    cwd: dir,
    stderr: { error: (message) => messages.push(message) },
  });
  prepared.db.$client.close();
  return { prepared, messages };
}

describe("prepareReviewState orchestration", () => {
  test("first launch ingests, computes signals, writes fingerprint, and starts at queue overlay", async () => {
    using project = tmpdir({ prefix: "labellens-run-first-" });
    const inputPath = join(project.path, "tiny.jsonl");
    copyFileSync(fixturePath("tiny.jsonl"), inputPath);
    writeConfig(project.path, inputPath);

    const { prepared, messages } = await prepareAndClose(project.path);

    expect(prepared.initialScreen).toBe("queue");
    expect(messages).toContain(`Ingesting ${inputPath}...`);
    expect(messages).toContain("Computing prioritization signals...");

    const db = openDb(join(project.path, ".labellens", "state.db"));
    try {
      expect(db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n).toBe(10);
      expect(db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM issues`)[0]!.n).toBeGreaterThan(0);
      expect(readFingerprint(db, inputPath)).not.toBeNull();
    } finally {
      db.$client.close();
    }
  });

  test("existing DB with matching fingerprint skips ingest and re-ingest prompt", async () => {
    using project = tmpdir({ prefix: "labellens-run-matched-" });
    const inputPath = join(project.path, "tiny.jsonl");
    copyFileSync(fixturePath("tiny.jsonl"), inputPath);
    writeConfig(project.path, inputPath);
    await prepareAndClose(project.path);

    const messages: string[] = [];
    const prepared = await prepareReviewState({
      cwd: project.path,
      stderr: { error: (message) => messages.push(message) },
      chooseReingest: async () => {
        throw new Error("re-ingest prompt should not open for a matching fingerprint");
      },
    });
    prepared.db.$client.close();

    expect(messages.some((m) => m.startsWith("Ingesting "))).toBe(false);
  });

  test("mtime-only source change refreshes fingerprint without opening re-ingest prompt", async () => {
    using project = tmpdir({ prefix: "labellens-run-touched-" });
    const inputPath = join(project.path, "tiny.jsonl");
    copyFileSync(fixturePath("tiny.jsonl"), inputPath);
    writeConfig(project.path, inputPath);
    await prepareAndClose(project.path);

    const before = openDb(join(project.path, ".labellens", "state.db"));
    const previous = readFingerprint(before, inputPath)!;
    before.$client.close();

    const future = new Date(Date.now() + 60_000);
    utimesSync(inputPath, future, future);
    const prepared = await prepareReviewState({
      cwd: project.path,
      chooseReingest: async () => {
        throw new Error("re-ingest prompt should not open for identical content");
      },
    });
    prepared.db.$client.close();

    const after = openDb(join(project.path, ".labellens", "state.db"));
    try {
      const next = readFingerprint(after, inputPath)!;
      expect(next.contentSha256).toBe(previous.contentSha256);
      expect(next.mtime).not.toBe(previous.mtime);
      expect(after.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n).toBe(10);
    } finally {
      after.$client.close();
    }
  });

  test("unknown stored labels abort with migrate guidance", async () => {
    using project = tmpdir({ prefix: "labellens-run-unknown-" });
    const inputPath = join(project.path, "tiny.jsonl");
    copyFileSync(fixturePath("tiny.jsonl"), inputPath);
    writeConfig(project.path, inputPath, { labels: ["food"] });

    try {
      await prepareReviewState({
        cwd: project.path,
        stderr: { error: () => {} },
      });
      throw new Error("expected prepareReviewState to reject unknown labels");
    } catch (err) {
      expect(err).toBeInstanceOf(ReviewSetupError);
      expect((err as ReviewSetupError).message).toBe(
        "labellens: configured label set is missing values referenced by stored data.",
      );
      expect((err as ReviewSetupError).lines.join("\n")).toContain(
        "labellens migrate --rename travel:<configured-replacement>",
      );
    }
  });

  test("--local-only rejects remote assistant config before opening state DB", async () => {
    using project = tmpdir({ prefix: "labellens-run-localonly-" });
    const inputPath = join(project.path, "tiny.jsonl");
    copyFileSync(fixturePath("tiny.jsonl"), inputPath);
    writeConfig(project.path, inputPath, {
      assistant: {
        enabled: true,
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        privacyAcknowledged: true,
      },
    });

    await expect(prepareReviewState({ cwd: project.path, localOnly: true })).rejects.toThrow(
      /--local-only/,
    );
    expect(existsSync(join(project.path, ".labellens"))).toBe(false);
  });
});
