import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 24,
  });

  let quitCalled = false;
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    requestRender: () => {},
    onQuit: () => {
      quitCalled = true;
    },
  });

  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { mockInput, renderOnce, captureCharFrame, quitCalled: () => quitCalled };
}

describe("review screen e2e", () => {
  test("initial render: progress strip + first record + primary prediction", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();

    expect(frame).toContain("LabelLens");
    expect(frame).toContain("tiny.jsonl");
    expect(frame).toContain("Reviewed: 0 / 10");
    expect(frame).toContain("Skipped: 0");
    expect(frame).toContain("Pending: 10");
    expect(frame).toContain("Lunch at Zomato Bangalore");
    expect(frame).toContain("food");
    expect(frame).toContain("(92%)");
    expect(frame).toContain("llm:gpt-4");

    expect(frame).toMatchSnapshot();
  });

  test("pressing 'a' writes an accepted review row and advances counter", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("a");
    await renderOnce();

    const reviewCount =
      store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]?.n ?? 0;
    expect(reviewCount).toBe(1);

    const review = store.db.all<{
      status: string;
      final_label: string;
      source_of_truth: string;
    }>(sql`SELECT status, final_label, source_of_truth FROM reviews LIMIT 1`)[0];
    expect(review?.status).toBe("accepted");
    expect(review?.final_label).toBe("food");
    expect(review?.source_of_truth).toBe("human");

    const frame = captureCharFrame();
    expect(frame).toContain("Reviewed: 1 / 10");
    expect(frame).toMatchSnapshot();
  });

  test("pressing 'j' moves to the next record without writing a review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("j");
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Uber ride to airport");
    expect(frame).toMatchSnapshot();

    const reviewCount =
      store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]?.n ?? 0;
    expect(reviewCount).toBe(0);
  });

  test("pressing 'q' triggers the onQuit callback", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, quitCalled } = await setup(store);
    mockInput.pressKey("q");
    await renderOnce();
    expect(quitCalled()).toBe(true);
  });

  test("pressing 'a' across all records empties pending and shows completion", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    for (let i = 0; i < 10; i++) {
      mockInput.pressKey("a");
      await renderOnce();
    }
    const reviewCount =
      store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]?.n ?? 0;
    expect(reviewCount).toBe(10);

    const frame = captureCharFrame();
    expect(frame).toContain("All records reviewed");
    expect(frame).toContain("Reviewed: 10 / 10");
    expect(frame).toMatchSnapshot();
  });
});
