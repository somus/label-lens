import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";

/** Build a ResolvedDisplay for tests. Defaults to mono+light+stack-eligible;
 * override only what the test cares about so adding a new ResolvedDisplay
 * field doesn't churn every literal across the suite. */
export function displayFor(overrides: Partial<ResolvedDisplay> = {}): ResolvedDisplay {
  return { ...defaultDisplay(), ...overrides };
}
