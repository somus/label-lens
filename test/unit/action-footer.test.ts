import { describe, expect, test } from "bun:test";
import { buildRegistry, type Command } from "../../src/actions/command.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import {
  collectFooterEntries,
  entriesToSegments,
  splitFooterEntries,
} from "../../src/render/chrome/action-footer.ts";
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
      { binding: "a", label: "accept", order: 10, disabled: false, group: "primary" },
      { binding: "gd", label: "doc", order: 20, disabled: true, group: "primary" },
    ]);
  });

  test("propagates the footer.group field onto entries (utility)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = createAppContext({
      db: store.db,
      config,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const cmd: Command = {
      name: "test.help",
      scope: "review",
      binding: "?",
      footer: { label: "help", order: 90, group: "utility" },
      run: () => {},
    };
    const entries = collectFooterEntries(buildRegistry([cmd]), "review", ctx);
    expect(entries[0]?.group).toBe("utility");
  });
});

describe("entriesToSegments", () => {
  test("renders enabled entries with accent key + muted label", () => {
    const segs = entriesToSegments([
      { binding: "a", label: "accept", order: 0, disabled: false, group: "primary" },
    ]);
    expect(segs).toEqual([
      { text: "[a] ", tone: "accent" },
      { text: "accept", tone: "muted" },
    ]);
  });

  test("renders disabled entries with tone-only dim signal (no text suffix) to preserve single-row footer budget", () => {
    const segs = entriesToSegments([
      { binding: "gd", label: "doc", order: 0, disabled: true, group: "primary" },
    ]);
    expect(segs).toEqual([
      { text: "[gd] ", tone: "dim" },
      { text: "doc", tone: "dim" },
    ]);
  });

  test("separates consecutive entries with a `┊` chip separator", () => {
    const segs = entriesToSegments([
      { binding: "a", label: "accept", order: 0, disabled: false, group: "primary" },
      { binding: "gd", label: "doc", order: 1, disabled: true, group: "primary" },
    ]);
    expect(segs).toEqual([
      { text: "[a] ", tone: "accent" },
      { text: "accept", tone: "muted" },
      { text: " ┊", tone: "dim" },
      { text: "[gd] ", tone: "dim" },
      { text: "doc", tone: "dim" },
    ]);
  });
});

describe("splitFooterEntries", () => {
  test("routes entries by group into primary + utility clusters", () => {
    const { primary, utility } = splitFooterEntries([
      { binding: "a", label: "accept", order: 10, disabled: false, group: "primary" },
      { binding: "?", label: "help", order: 90, disabled: false, group: "utility" },
      { binding: "u", label: "undo", order: 20, disabled: false, group: "primary" },
    ]);
    expect(primary.map((e) => e.binding)).toEqual(["a", "u"]);
    expect(utility.map((e) => e.binding)).toEqual(["?"]);
  });

  test("empty utility cluster returns empty array (not undefined)", () => {
    const { primary, utility } = splitFooterEntries([
      { binding: "a", label: "accept", order: 0, disabled: false, group: "primary" },
    ]);
    expect(primary).toHaveLength(1);
    expect(utility).toEqual([]);
  });
});
