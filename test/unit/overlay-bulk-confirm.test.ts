import { describe, expect, test } from "bun:test";
import { openBulkConfirm, reduceBulkConfirm } from "../../src/overlay/bulk-confirm.ts";
import type { RecordWithPrimaryPrediction } from "../../src/types.ts";

function mkRecord(id: string): RecordWithPrimaryPrediction {
  return {
    id,
    source_path: "x",
    row_index: 0,
    text: id,
    context_before: null,
    context_after: null,
    raw: "{}",
    note: null,
    document_id: null,
    primaryPrediction: null,
    latestReview: null,
  };
}

describe("bulk-confirm overlay reducer", () => {
  test("Enter emits commitBatch effect + close", () => {
    const eligible = [mkRecord("a"), mkRecord("b")];
    const excluded = [mkRecord("c")];
    const state = openBulkConfirm({ action: "accept", eligible, excluded });
    expect(state.action).toBe("accept");
    expect(state.eligible.length).toBe(2);
    expect(state.excluded.length).toBe(1);

    const result = reduceBulkConfirm(state, {
      kind: "key",
      event: { name: "return" },
    });
    expect(result.overlay).toBeNull();
    expect(result.effects).toContainEqual({
      kind: "commitBatch",
      action: "accept",
      eligible,
      label: undefined,
    });
    expect(result.effects).toContainEqual({ kind: "close" });
  });

  test("Esc emits close, no commitBatch", () => {
    const eligible = [mkRecord("a")];
    const state = openBulkConfirm({ action: "reject", eligible, excluded: [] });
    const result = reduceBulkConfirm(state, {
      kind: "key",
      event: { name: "escape" },
    });
    expect(result.overlay).toBeNull();
    expect(result.effects).toEqual([{ kind: "close" }]);
  });

  test("relabel preserves label in commitBatch effect", () => {
    const eligible = [mkRecord("a")];
    const state = openBulkConfirm({
      action: "relabel",
      eligible,
      excluded: [],
      label: "other",
    });
    const result = reduceBulkConfirm(state, {
      kind: "key",
      event: { name: "return" },
    });
    expect(result.effects).toContainEqual({
      kind: "commitBatch",
      action: "relabel",
      eligible,
      label: "other",
    });
  });

  test("unmark emits commitBulkUnmark, not commitBatch", () => {
    const eligible = [mkRecord("a"), mkRecord("b")];
    const state = openBulkConfirm({ action: "unmark", eligible, excluded: [] });
    const result = reduceBulkConfirm(state, {
      kind: "key",
      event: { name: "return" },
    });
    expect(result.effects).toContainEqual({ kind: "commitBulkUnmark", eligible });
    expect(result.effects).toContainEqual({ kind: "close" });
  });
});
