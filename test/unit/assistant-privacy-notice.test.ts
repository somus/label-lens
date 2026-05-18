import { describe, expect, test } from "bun:test";
import { ASSISTANT_PRIVACY_NOTICE } from "../../src/assistant/privacy_notice.ts";

describe("ASSISTANT_PRIVACY_NOTICE", () => {
  test("matches PRD §10.5 verbatim (key phrases)", () => {
    // Lift updates from PRD §10.5 propagate via this single constant. Test
    // pins the load-bearing phrases so any reword surfaces here.
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("candidate text");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("before/after context");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("label definitions");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("prediction metadata");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("does not send the entire dataset");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("(record_id, prompt_hash)");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("--local-only");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("Ollama");
    expect(ASSISTANT_PRIVACY_NOTICE).toContain("no data leaves the machine");
  });
});
