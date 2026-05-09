import type { Binding } from "./engine.ts";

export const DEFAULT_BINDINGS: Binding[] = [
  { key: "a", action: "record.accept", scope: "review" },
  { key: "j", action: "record.next", scope: "review" },
  { key: "k", action: "record.prev", scope: "review" },
  { key: "q", action: "app.quit", scope: "global" },
];
