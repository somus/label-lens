import { describe, expect, test } from "bun:test";
import { buildRegistry, type Command } from "../../src/actions/command.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { collectFooterEntries, entriesToSegments } from "../../src/render/chrome/action-footer.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("collectFooterEntries", () => {
  test("keeps disabled commands and flags them so the binding stays discoverable", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = createAppContext({
      db: store.db,
      config,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const enabledCmd: Command = {
      name: "test.enabled",
      scope: "review",
      binding: "a",
      footer: { label: "accept", order: 10 },
      run: () => {},
    };
    const disabledCmd: Command = {
      name: "test.disabled",
      scope: "review",
      binding: "g d",
      footer: { label: "doc", order: 20 },
      enabled: () => false,
      run: () => {},
    };
    const registry = buildRegistry([enabledCmd, disabledCmd]);

    const entries = collectFooterEntries(registry, "review", ctx);

    expect(entries).toEqual([
      { binding: "a", label: "accept", order: 10, disabled: false },
      { binding: "gd", label: "doc", order: 20, disabled: true },
    ]);
  });
});

describe("entriesToSegments", () => {
  test("renders enabled entries with accent key + muted label", () => {
    const segs = entriesToSegments([{ binding: "a", label: "accept", order: 0, disabled: false }]);
    expect(segs).toEqual([
      { text: "[a] ", tone: "accent" },
      { text: "accept", tone: "muted" },
    ]);
  });

  test("renders disabled entries dimmed with (unavailable) marker", () => {
    const segs = entriesToSegments([{ binding: "gd", label: "doc", order: 0, disabled: true }]);
    expect(segs).toEqual([
      { text: "[gd] ", tone: "dim" },
      { text: "doc", tone: "dim" },
      { text: " (unavailable)", tone: "dim" },
    ]);
  });

  test("separates consecutive entries with two-space dim gap regardless of state", () => {
    const segs = entriesToSegments([
      { binding: "a", label: "accept", order: 0, disabled: false },
      { binding: "gd", label: "doc", order: 1, disabled: true },
    ]);
    expect(segs).toEqual([
      { text: "[a] ", tone: "accent" },
      { text: "accept", tone: "muted" },
      { text: "  ", tone: "dim" },
      { text: "[gd] ", tone: "dim" },
      { text: "doc", tone: "dim" },
      { text: " (unavailable)", tone: "dim" },
    ]);
  });
});
