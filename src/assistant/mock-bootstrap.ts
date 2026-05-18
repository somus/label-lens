import { readFileSync } from "node:fs";
import { __setAssistantQueryFn } from "../actions/record/open-assistant.ts";
import type { QueryAssistantArgs } from "./provider.ts";
import type { AssistantResponse } from "./schema.ts";

// Demo / docs-recording seam. When `LABELLENS_ASSISTANT_MOCK_FILE` points at a
// JSON file matching `MockFile`, the assistant overlay replays the canned
// response instead of calling pi-ai. Used by `docs/casts/` vhs tapes so the
// recording is deterministic and offline. Never set in production binaries.
type MockFile = {
  tokens?: string[];
  tokenDelayMs?: number;
  response: AssistantResponse;
};

export function installAssistantMockIfRequested(): void {
  const path = process.env.LABELLENS_ASSISTANT_MOCK_FILE;
  if (!path) return;
  const cfg = JSON.parse(readFileSync(path, "utf8")) as MockFile;
  if (!cfg.response) {
    throw new Error(`LABELLENS_ASSISTANT_MOCK_FILE ${path}: missing 'response'`);
  }
  const delay = cfg.tokenDelayMs ?? 30;
  __setAssistantQueryFn(async (args: QueryAssistantArgs) => {
    if (cfg.tokens) {
      for (const t of cfg.tokens) {
        args.onToken?.(t);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    }
    return { response: cfg.response, wasCached: false };
  });
}
