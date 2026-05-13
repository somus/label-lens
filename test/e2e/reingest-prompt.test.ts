import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import {
  mountReingestPrompt,
  type ReingestChoice,
  type ReingestPromptCounts,
} from "../../src/screens/reingest-prompt.ts";

async function setup(counts: ReingestPromptCounts) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 24,
  });
  let chosen: ReingestChoice | null = null;
  const handle = mountReingestPrompt({
    renderer,
    counts,
    onChoice: (c) => {
      chosen = c;
    },
  });
  await renderOnce();
  return {
    mockInput,
    renderOnce,
    captureCharFrame,
    chosen: () => chosen,
    destroy: handle.destroy,
  };
}

describe("reingest-prompt screen e2e", () => {
  test("renders PRD §13 block with counts", async () => {
    const { captureCharFrame } = await setup({
      predictionsOnly: 482,
      orphans: 18,
      newRecords: 6,
    });
    const frame = captureCharFrame();
    expect(frame).toContain("Source file has changed since last review");
    expect(frame).toContain("482");
    expect(frame).toContain("18 prior reviews would orphan");
    expect(frame).toContain("6 records — new");
    expect(frame).toContain("[r] Refresh predictions");
    expect(frame).toContain("[f] Fresh re-ingest");
    expect(frame).toContain("[c] Cancel");
    expect(frame).toMatchSnapshot();
  });

  test("r → refresh", async () => {
    const { mockInput, renderOnce, chosen } = await setup({
      predictionsOnly: 1,
      orphans: 0,
      newRecords: 0,
    });
    mockInput.pressKey("r");
    await renderOnce();
    expect(chosen()).toBe("refresh");
  });

  test("f → fresh", async () => {
    const { mockInput, renderOnce, chosen } = await setup({
      predictionsOnly: 1,
      orphans: 0,
      newRecords: 0,
    });
    mockInput.pressKey("f");
    await renderOnce();
    expect(chosen()).toBe("fresh");
  });

  test("c → cancel", async () => {
    const { mockInput, renderOnce, chosen } = await setup({
      predictionsOnly: 1,
      orphans: 0,
      newRecords: 0,
    });
    mockInput.pressKey("c");
    await renderOnce();
    expect(chosen()).toBe("cancel");
  });

  test("escape → cancel", async () => {
    const { mockInput, renderOnce, chosen } = await setup({
      predictionsOnly: 1,
      orphans: 0,
      newRecords: 0,
    });
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(chosen()).toBe("cancel");
  });
});
