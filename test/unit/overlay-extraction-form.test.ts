import { describe, expect, test } from "bun:test";
import type { ExtractionField } from "../../src/config/config.ts";
import { openExtractionForm, reduceExtractionForm } from "../../src/overlay/extraction-form.ts";
import type { OverlayEvent } from "../../src/overlay/types.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false, key: "amt" },
  { name: "date", type: "string", required: false },
];

function keyEvent(name: string, sequence?: string): OverlayEvent {
  return {
    kind: "key",
    event: { name, sequence: sequence ?? name } as never,
  };
}

describe("extraction form reducer", () => {
  function open(): ExtractionFormStateForTest {
    return openExtractionForm({
      recordId: "rec1",
      fields: FIELDS,
      predicted: { company: "Acme", amount: null, date: null },
      previousReview: null,
    }) as ExtractionFormStateForTest;
  }

  type ExtractionFormStateForTest = ReturnType<typeof openExtractionForm>;

  function dispatch(state: ExtractionFormStateForTest, ...events: OverlayEvent[]) {
    let s: ExtractionFormStateForTest = state;
    const effects = [];
    for (const evt of events) {
      const result = reduceExtractionForm(s, evt);
      if (result.overlay && result.overlay.kind === "extraction-form") {
        s = result.overlay.state;
      }
      effects.push(...result.effects);
    }
    return { state: s, effects };
  }

  test("opens with focus on first field, draft pre-populated from predicted", () => {
    const s = open();
    expect(s.focus).toBe(0);
    expect(s.editing).toBe(false);
    expect(s.draft).toEqual({ company: "Acme", amount: null, date: null });
  });

  test("resumes from previousReview when present", () => {
    const s = openExtractionForm({
      recordId: "rec1",
      fields: FIELDS,
      predicted: { company: "Acme", amount: null, date: null },
      previousReview: { company: "Beta", amount: "100", date: null },
    });
    expect(s.draft).toEqual({ company: "Beta", amount: "100", date: null });
  });

  test("j/k moves focus", () => {
    const { state } = dispatch(open(), keyEvent("j"), keyEvent("j"), keyEvent("k"));
    expect(state.focus).toBe(1);
  });

  test("`e` on a focused field opens edit mode with current value as buffer", () => {
    const { state } = dispatch(open(), keyEvent("e"));
    expect(state.editing).toBe(true);
    expect(state.editBuffer).toBe("Acme");
  });

  test("typing characters in edit appends to buffer; backspace removes", () => {
    const { state } = dispatch(
      open(),
      keyEvent("e"),
      { kind: "key", event: { name: "x", sequence: "x" } as never },
      keyEvent("backspace"),
    );
    expect(state.editBuffer).toBe("Acme");
  });

  test("Enter inside edit commits the value to draft and exits edit", () => {
    const { state } = dispatch(
      open(),
      keyEvent("e"),
      { kind: "key", event: { name: "1", sequence: "1" } as never },
      keyEvent("return"),
    );
    expect(state.editing).toBe(false);
    expect(state.draft.company).toBe("Acme1");
  });

  test("Enter on a focused field commits the Review (no two-press required)", () => {
    const { effects } = dispatch(
      open(),
      keyEvent("e"),
      { kind: "key", event: { name: "1", sequence: "1" } as never },
      keyEvent("return"), // commit edit
      keyEvent("return"), // commit Review
    );
    const commit = effects.find((e) => e.kind === "commitDecision");
    expect(commit).toBeDefined();
    expect((commit as { status: string }).status).toBe("relabeled");
  });

  test("Enter commits the Review even after focus moved post-edit", () => {
    // Reproduces the UX bug from the original two-press design: edit a
    // field, move focus to inspect another, then Enter should still
    // commit the Review.
    const { effects } = dispatch(
      open(),
      keyEvent("e"),
      { kind: "key", event: { name: "1", sequence: "1" } as never },
      keyEvent("return"), // commit edit
      keyEvent("j"), // move focus
      keyEvent("return"), // commit Review
    );
    const commit = effects.find((e) => e.kind === "commitDecision");
    expect(commit).toBeDefined();
    expect((commit as { status: string }).status).toBe("relabeled");
  });

  test("Esc mid-edit cancels the edit only; overlay stays open", () => {
    const result = reduceExtractionForm(
      dispatch(open(), keyEvent("e"), {
        kind: "key",
        event: { name: "x", sequence: "x" } as never,
      }).state,
      keyEvent("escape"),
    );
    expect(result.overlay?.kind).toBe("extraction-form");
    if (result.overlay?.kind === "extraction-form") {
      expect(result.overlay.state.editing).toBe(false);
      expect(result.overlay.state.draft.company).toBe("Acme");
    }
    expect(result.effects).toEqual([]);
  });

  test("Esc with no in-flight edit closes the overlay", () => {
    const result = reduceExtractionForm(open(), keyEvent("escape"));
    expect(result.overlay).toBeNull();
    expect(result.effects).toEqual([{ kind: "close" }]);
  });

  test("commit Review refused when a required field is empty/null", () => {
    // Open, edit company, backspace all 4 chars, commit edit → draft.company=null
    const s1 = dispatch(
      open(),
      keyEvent("e"),
      keyEvent("backspace"),
      keyEvent("backspace"),
      keyEvent("backspace"),
      keyEvent("backspace"),
      keyEvent("return"),
    ).state;
    expect(s1.draft.company).toBeNull();
    const result = reduceExtractionForm(s1, keyEvent("return")); // commit Review attempt
    expect(result.overlay?.kind).toBe("extraction-form");
    expect(result.effects).toEqual([]);
  });

  test("commit Review writes status=accepted when draft equals predicted", () => {
    // Pre-populated draft matches predicted; Enter immediately commits.
    const { effects } = dispatch(open(), keyEvent("return"));
    const commit = effects.find((e) => e.kind === "commitDecision");
    expect(commit).toBeDefined();
    expect((commit as { status: string }).status).toBe("accepted");
    expect((commit as { prevLabel: string | null }).prevLabel).toBeNull();
  });

  test("commit Review tags source_of_truth=human+assistant when assistant was viewed", () => {
    const s = openExtractionForm({
      recordId: "rec1",
      fields: FIELDS,
      predicted: { company: "Acme", amount: null, date: null },
      previousReview: null,
      assistantViewed: true,
    });
    const { effects } = dispatch(s, keyEvent("return"));
    const commit = effects.find((e) => e.kind === "commitDecision");
    expect((commit as { sourceOfTruth: string }).sourceOfTruth).toBe("human+assistant");
  });
});
