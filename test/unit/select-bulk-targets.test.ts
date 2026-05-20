import { describe, expect, test } from "bun:test";
import { selectBulkTargets } from "../../src/actions/record/bulk.ts";

const r = (id: string) => ({ id });

describe("selectBulkTargets", () => {
  test("review action excludes records that already have an effective review", () => {
    const marked = [r("a"), r("b"), r("c")];
    const reviewed = new Set(["b"]);
    const result = selectBulkTargets({ action: "accept", marked, reviewed });
    expect(result.eligible.map((x) => x.id)).toEqual(["a", "c"]);
    expect(result.excluded.map((x) => x.id)).toEqual(["b"]);
  });

  test("relabel / reject / skip apply the same exclusion as accept", () => {
    const marked = [r("a"), r("b")];
    const reviewed = new Set(["a"]);
    for (const action of ["relabel", "reject", "skip"] as const) {
      const result = selectBulkTargets({ action, marked, reviewed });
      expect(result.eligible.map((x) => x.id)).toEqual(["b"]);
      expect(result.excluded.map((x) => x.id)).toEqual(["a"]);
    }
  });

  test("unmark eligible = every marked record regardless of review state", () => {
    const marked = [r("a"), r("b"), r("c")];
    const reviewed = new Set(["b", "c"]);
    const result = selectBulkTargets({ action: "unmark", marked, reviewed });
    expect(result.eligible.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(result.excluded).toEqual([]);
  });

  test("zero marked yields zero eligible and zero excluded", () => {
    const result = selectBulkTargets({ action: "accept", marked: [], reviewed: new Set() });
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([]);
  });
});
