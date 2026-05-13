import { describe, expect, test } from "bun:test";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { drillToQueue, type StatRow } from "../../src/store/stats.ts";

describe("drillToQueue", () => {
  test("top-correction → by-correction:from:to", () => {
    const row: StatRow = {
      kind: "top-correction",
      from: "CONTINUATION",
      to: "SECTION_HEADER",
      count: 96,
    };
    expect(drillToQueue(row)).toBe("by-correction:CONTINUATION:SECTION_HEADER");
  });

  test("acceptance-by-source / relabel-by-source / correction-rate-by-source → by-source:<s>", () => {
    expect(
      drillToQueue({ kind: "acceptance-by-source", source: "llm:gpt-4", rate: 0.5, reviewed: 4 }),
    ).toBe("by-source:llm:gpt-4");
    expect(
      drillToQueue({
        kind: "relabel-by-source",
        source: "rule.entry_boundary",
        rate: 0.8,
        reviewed: 5,
      }),
    ).toBe("by-source:rule.entry_boundary");
    expect(
      drillToQueue({
        kind: "correction-rate-by-source",
        source: "regex.simple",
        rate: 0.3,
        reviewed: 3,
      }),
    ).toBe("by-source:regex.simple");
  });

  test("relabel-by-reason → by-reason:<reason>", () => {
    expect(
      drillToQueue({
        kind: "relabel-by-reason",
        reason: "source_disagreement",
        rate: 0.4,
        reviewed: 5,
      }),
    ).toBe("by-reason:source_disagreement");
  });

  test("correction-rate-by-label → where:final_label != prev_label and prev_label = '<l>'", () => {
    const id = drillToQueue({
      kind: "correction-rate-by-label",
      prevLabel: "ENTRY_START",
      rate: 0.5,
      reviewed: 4,
    });
    expect(id).toBe("where:final_label != prev_label and prev_label = 'ENTRY_START'");
    // and the where parser must accept it
    expect(() => resolveQueue(id!)).not.toThrow();
  });

  test("imported-issue → by-issue:<type>", () => {
    expect(drillToQueue({ kind: "imported-issue", issueType: "label_issue", count: 412 })).toBe(
      "by-issue:label_issue",
    );
  });

  test("suggested-next forwards its queueId verbatim", () => {
    expect(drillToQueue({ kind: "suggested-next", queueId: "by-source:llm:gpt-4", score: 4 })).toBe(
      "by-source:llm:gpt-4",
    );
  });

  test("display-only rows return null", () => {
    expect(drillToQueue({ kind: "progress", bucket: "total", count: 10 })).toBeNull();
    expect(drillToQueue({ kind: "decision", status: "accepted", count: 3 })).toBeNull();
    expect(drillToQueue({ kind: "all-caught-up" })).toBeNull();
  });

  test("labels containing apostrophes blow up loudly instead of producing a broken where", () => {
    expect(() =>
      drillToQueue({
        kind: "correction-rate-by-label",
        prevLabel: "it's",
        rate: 0.5,
        reviewed: 2,
      }),
    ).toThrow(/single quotes and backslashes/);
  });

  test("labels containing backslashes are rejected with the same guidance", () => {
    expect(() =>
      drillToQueue({
        kind: "correction-rate-by-label",
        prevLabel: "a\\b",
        rate: 0.5,
        reviewed: 2,
      }),
    ).toThrow(/single quotes and backslashes/);
  });
});
