import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";

/**
 * Build a ResolvedDisplay for tests. Defaults to mono+light+stack-eligible
 * AND `sidebar: "off"` so legacy snapshot tests don't gain a sidebar
 * column overnight. Sidebar-specific tests opt in with `sidebar: "on"`
 * (or "auto" + appropriate width / color).
 *
 * Override only what the test cares about so adding a new ResolvedDisplay
 * field doesn't churn every literal across the suite.
 */
export function displayFor(overrides: Partial<ResolvedDisplay> = {}): ResolvedDisplay {
  return { ...defaultDisplay(), sidebar: "off", ...overrides };
}
