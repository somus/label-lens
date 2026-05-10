import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { GuidelinesState } from "../../src/overlay/guidelines.ts";
import { openGuidelines, reduceGuidelines } from "../../src/overlay/guidelines.ts";
import { DEFAULT_FIELDS } from "../util/tmp.ts";

function cfg(guidelines?: string): LabellensConfig {
  return {
    task: "classification",
    labels: ["food"],
    guidelines,
    input: { path: "x", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "x", format: "jsonl" },
  };
}

describe("openGuidelines", () => {
  test("inline markdown (starts with '#') is used as content directly", () => {
    const s = openGuidelines(cfg("## Inline guidelines\n- item"));
    expect(s.source).toBe("config");
    expect(s.content).toBe("## Inline guidelines\n- item");
    expect(s.scroll).toBe(0);
  });

  test("missing guidelines field shows the placeholder", () => {
    const s = openGuidelines(cfg());
    expect(s.source).toBe("missing");
    expect(s.content).toContain("No guidelines configured");
  });

  test("file path is loaded into content", () => {
    const dir = mkdtempSync(join(tmpdir(), "ll-guide-"));
    const path = join(dir, "guide.md");
    writeFileSync(path, "# From disk\n\ndo X");
    const s = openGuidelines(cfg(path));
    expect(s.source).toBe("config");
    expect(s.content).toContain("From disk");
  });

  test("nonexistent path falls back to placeholder + flagged source", () => {
    const s = openGuidelines(cfg("/definitely/not/here.md"));
    expect(s.source).toBe("missing");
    expect(s.content).toContain("could not read");
  });
});

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

describe("reduceGuidelines", () => {
  test("Down/Up adjusts scroll, clamped at 0", () => {
    let s = openGuidelines(cfg("# h\n\nbody"));
    s = reduceGuidelines(s, key("down")).overlay!.state as GuidelinesState;
    expect(s.scroll).toBe(1);
    s = reduceGuidelines(s, key("up")).overlay!.state as GuidelinesState;
    s = reduceGuidelines(s, key("up")).overlay!.state as GuidelinesState;
    expect(s.scroll).toBe(0);
  });

  test("PgDn / PgUp scrolls by 10", () => {
    let s = openGuidelines(cfg("# h\n\nbody"));
    s = reduceGuidelines(s, key("pagedown")).overlay!.state as GuidelinesState;
    expect(s.scroll).toBe(10);
    s = reduceGuidelines(s, key("pageup")).overlay!.state as GuidelinesState;
    expect(s.scroll).toBe(0);
  });

  test("Esc closes", () => {
    const s = openGuidelines(cfg("# x"));
    const r = reduceGuidelines(s, key("escape"));
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });
});
