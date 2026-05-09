// Render primitives — passthroughs to @opentui/core for now (PRD §16.1).
// Hypothetical seam: a single adapter (OpenTUI) sits behind these wrappers.
// They become a real seam only when a second adapter lands (alternate
// renderer, Ink, pi-tui, or stable-snapshot harness). Until then, do not
// extend these wrappers with project-specific logic — that would prematurely
// deepen a module whose purpose is forward-compatibility, not present
// behaviour. See LANGUAGE-of-architecture: "one adapter = hypothetical seam".

export * from "./box.ts";
export * from "./input.ts";
export * from "./scrollbox.ts";
export * from "./select.ts";
export * from "./text.ts";
