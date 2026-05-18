import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setAssistantQueryFn } from "../../src/actions/record/open-assistant.ts";
import { installAssistantMockIfRequested } from "../../src/assistant/mock-bootstrap.ts";
import type { QueryAssistantArgs } from "../../src/assistant/provider.ts";
import type { AssistantResponse } from "../../src/assistant/schema.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "labellens-mock-bootstrap-"));
});

afterEach(() => {
  delete process.env.LABELLENS_ASSISTANT_MOCK_FILE;
  __setAssistantQueryFn(null);
  rmSync(tmp, { recursive: true, force: true });
});

const validResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "demo",
  evidenceFor: ["cafe"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

function makeArgs(): QueryAssistantArgs {
  return {
    db: null as unknown as QueryAssistantArgs["db"],
    recordId: "rec-1",
    assistant: { enabled: true, provider: "anthropic", privacyAcknowledged: true },
    localOnly: false,
    model: null as unknown as QueryAssistantArgs["model"],
    promptInput: null as unknown as QueryAssistantArgs["promptInput"],
    labelNames: ["food", "travel"],
  };
}

describe("installAssistantMockIfRequested", () => {
  test("no-op when env var unset", () => {
    delete process.env.LABELLENS_ASSISTANT_MOCK_FILE;
    expect(() => installAssistantMockIfRequested()).not.toThrow();
  });

  test("installs replacement that returns canned response", async () => {
    const path = join(tmp, "mock.json");
    writeFileSync(path, JSON.stringify({ response: validResponse, tokenDelayMs: 0 }));
    process.env.LABELLENS_ASSISTANT_MOCK_FILE = path;
    installAssistantMockIfRequested();

    const { __getAssistantQueryFn } = await import("../../src/actions/record/open-assistant.ts");
    const fn = __getAssistantQueryFn();
    const result = await fn(makeArgs());
    expect(result.response).toEqual(validResponse);
    expect(result.wasCached).toBe(false);
  });

  test("streams tokens to onToken before resolving", async () => {
    const path = join(tmp, "mock.json");
    writeFileSync(
      path,
      JSON.stringify({
        response: validResponse,
        tokens: ["Look", "ing ", "at ", "cafe"],
        tokenDelayMs: 0,
      }),
    );
    process.env.LABELLENS_ASSISTANT_MOCK_FILE = path;
    installAssistantMockIfRequested();

    const { __getAssistantQueryFn } = await import("../../src/actions/record/open-assistant.ts");
    const fn = __getAssistantQueryFn();
    const tokens: string[] = [];
    const args = makeArgs();
    args.onToken = (t) => tokens.push(t);
    const result = await fn(args);
    expect(tokens.join("")).toBe("Looking at cafe");
    expect(result.response).toEqual(validResponse);
  });

  test("throws when response field missing", () => {
    const path = join(tmp, "mock.json");
    writeFileSync(path, JSON.stringify({ tokens: ["x"] }));
    process.env.LABELLENS_ASSISTANT_MOCK_FILE = path;
    expect(() => installAssistantMockIfRequested()).toThrow(/missing 'response'/);
  });
});
