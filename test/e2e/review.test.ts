import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { FieldMap } from "../../src/config/inference.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { applySchema } from "../../src/store/schema.ts";

const FIELDS: FieldMap = {
  text: "text",
  prediction: "prediction",
  confidence: "confidence",
  source: "source",
  context_before: "context_before",
  context_after: "context_after",
};

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup() {
  const db = new Database(":memory:");
  applySchema(db);
  await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);

  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 24,
  });

  let quitCalled = false;
  mountReviewScreen({
    renderer,
    db,
    config: makeConfig(),
    onQuit: () => {
      quitCalled = true;
    },
  });

  await renderOnce();
  return { db, renderer, mockInput, renderOnce, captureCharFrame, quitCalled: () => quitCalled };
}

describe("review screen e2e", () => {
  test("renders top strip with progress and dataset name", async () => {
    const { captureCharFrame } = await setup();
    const frame = captureCharFrame();
    expect(frame).toContain("LabelLens");
    expect(frame).toContain("tiny.jsonl");
    expect(frame).toContain("0 / 10");
  });

  test("renders the first record's text and primary prediction", async () => {
    const { captureCharFrame } = await setup();
    const frame = captureCharFrame();
    expect(frame).toContain("Lunch at Zomato Bangalore");
    expect(frame).toContain("food");
    expect(frame).toContain("(92%)");
    expect(frame).toContain("llm:gpt-4");
  });

  test("pressing 'a' writes an accepted review row and advances counter", async () => {
    const { db, mockInput, renderOnce, captureCharFrame } = await setup();
    mockInput.pressKey("a");
    await renderOnce();

    const reviewCount = (
      db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM reviews").get() ?? { n: 0 }
    ).n;
    expect(reviewCount).toBe(1);

    const review = db
      .query<{ status: string; final_label: string; source_of_truth: string }, []>(
        "SELECT status, final_label, source_of_truth FROM reviews LIMIT 1",
      )
      .get();
    expect(review?.status).toBe("accepted");
    expect(review?.final_label).toBe("food");
    expect(review?.source_of_truth).toBe("human");

    const frame = captureCharFrame();
    expect(frame).toContain("1 / 10");
  });

  test("pressing 'j' moves to the next record without writing a review", async () => {
    const { db, mockInput, renderOnce, captureCharFrame } = await setup();
    mockInput.pressKey("j");
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Uber ride to airport");

    const reviewCount = (
      db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM reviews").get() ?? { n: 0 }
    ).n;
    expect(reviewCount).toBe(0);
  });

  test("pressing 'q' triggers the onQuit callback", async () => {
    const { mockInput, renderOnce, quitCalled } = await setup();
    mockInput.pressKey("q");
    await renderOnce();
    expect(quitCalled()).toBe(true);
  });

  test("pressing 'a' across all records empties pending and shows completion", async () => {
    const { db, mockInput, renderOnce, captureCharFrame } = await setup();
    for (let i = 0; i < 10; i++) {
      mockInput.pressKey("a");
      await renderOnce();
    }
    const reviewCount = (
      db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM reviews").get() ?? { n: 0 }
    ).n;
    expect(reviewCount).toBe(10);

    const frame = captureCharFrame();
    expect(frame).toContain("All records reviewed");
    expect(frame).toContain("10 / 10");
  });
});
