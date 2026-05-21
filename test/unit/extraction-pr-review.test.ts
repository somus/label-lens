import { describe, expect, test } from "bun:test";
import { validateConfigSchema } from "../../src/config/config.ts";
import { canonicalizeExtractionObject } from "../../src/labels/extraction-object.ts";
import { openExtractionForm, reduceExtractionForm } from "../../src/overlay/extraction-form.ts";
import type { OverlayEvent } from "../../src/overlay/types.ts";

const FIELDS = [
  { name: "company", type: "string" as const, required: true },
  { name: "amount", type: "string" as const, required: false, key: "amt" },
];

function key(name: string): OverlayEvent {
  return { kind: "key", event: { name, sequence: name } as never };
}

describe("canonicalizeExtractionObject — alias fallback (thread 1)", () => {
  test("reads from `key` when source uses alias", () => {
    const { object } = canonicalizeExtractionObject({ company: "Acme", amt: "100" }, FIELDS);
    expect(object).toEqual({ company: "Acme", amount: "100" });
  });

  test("falls back to canonical name when re-encoding an already-canonical object", () => {
    const { object } = canonicalizeExtractionObject({ company: "Acme", amount: "100" }, FIELDS);
    expect(object).toEqual({ company: "Acme", amount: "100" });
  });

  test("alias wins when both alias and canonical name are present", () => {
    const { object } = canonicalizeExtractionObject(
      { company: "Acme", amt: "alias-wins", amount: "canonical-loses" },
      FIELDS,
    );
    expect(object).toEqual({ company: "Acme", amount: "alias-wins" });
  });
});

describe("extraction form — space key in edit mode (thread 9)", () => {
  test("typing space appends a space character to editBuffer", () => {
    const initial = openExtractionForm({
      recordId: "r1",
      fields: FIELDS,
      predicted: { company: "Acme", amount: null },
      previousReview: null,
      hadPrediction: true,
    });
    const edit = reduceExtractionForm(initial, key("e"));
    const s1 = (edit.overlay as { state: typeof initial }).state;
    const typed = reduceExtractionForm(s1, key("space"));
    const s2 = (typed.overlay as { state: typeof initial }).state;
    expect(s2.editBuffer).toBe("Acme ");
  });
});

describe("extraction form — no-prediction commit (threads 6, 17)", () => {
  test("commit on no-prediction record records relabeled with null prev_label", () => {
    const initial = openExtractionForm({
      recordId: "r1",
      fields: FIELDS,
      predicted: {},
      previousReview: null,
      hadPrediction: false,
    });
    // Fill required field so commit passes the gate.
    const e = reduceExtractionForm(initial, key("e"));
    const s1 = (e.overlay as { state: typeof initial }).state;
    let s = s1;
    for (const ch of "Acme") {
      s = (reduceExtractionForm(s, key(ch)).overlay as { state: typeof initial }).state;
    }
    s = (reduceExtractionForm(s, key("return")).overlay as { state: typeof initial }).state;
    const final = reduceExtractionForm(s, key("return"));
    const commit = final.effects.find((x) => x.kind === "commitDecision");
    expect(commit).toBeDefined();
    expect((commit as { status: string }).status).toBe("relabeled");
    expect((commit as { prevLabel: string | null }).prevLabel).toBeNull();
  });
});

describe("validateConfigSchema — extraction duplicates (threads 12, 20)", () => {
  const base = {
    task: "extraction" as const,
    labels: [],
    input: { path: "in.jsonl", format: "jsonl" as const, fields: { text: "text" } },
    output: { path: "out.jsonl", format: "jsonl" as const },
  };

  test("duplicate canonical name rejected", () => {
    const errs = validateConfigSchema({
      ...base,
      extraction: {
        fields: [
          { name: "amount", type: "string", required: true },
          { name: "amount", type: "string", required: false },
        ],
      },
    });
    expect(errs.join("\n")).toContain('duplicate field name "amount"');
  });

  test("duplicate input key (alias) rejected", () => {
    const errs = validateConfigSchema({
      ...base,
      extraction: {
        fields: [
          { name: "amount", type: "string", required: true, key: "amt" },
          { name: "total", type: "string", required: false, key: "amt" },
        ],
      },
    });
    expect(errs.join("\n")).toContain('duplicate input key "amt"');
  });

  test("unique fields validate clean", () => {
    const errs = validateConfigSchema({
      ...base,
      extraction: {
        fields: [
          { name: "amount", type: "string", required: true },
          { name: "company", type: "string", required: false },
        ],
      },
    });
    expect(errs).toEqual([]);
  });
});
