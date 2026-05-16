import type { Segment } from "./chrome/status-bar.ts";

/**
 * Split a namespaced value (e.g. `policy:spam`, `llm:gpt-4`, `rule.entry_boundary`)
 * into [prefix-with-separator, value] segments so the prefix can render dim and
 * the value default/accent. Splits on the **first** namespace separator only —
 * deep namespaces (`a:b:c`) render as `a:` (dim) + `b:c` (value) to keep the
 * value the eye-catching part.
 *
 * Returns a 1-segment result when no separator is present.
 *
 * `valueTone` defaults to `"default"`; pass `"accent"` for highlighted contexts
 * (focused picker row, focused prediction card) so the value pops while the
 * namespace stays quiet.
 */
export function foldNamespace(value: string, valueTone: Segment["tone"] = "default"): Segment[] {
  // Match either `:` or `.` as the separator. `:` wins when both appear.
  const colonAt = value.indexOf(":");
  const dotAt = value.indexOf(".");
  const sepAt = colonAt === -1 ? dotAt : dotAt === -1 ? colonAt : Math.min(colonAt, dotAt);
  if (sepAt <= 0) return [{ text: value, tone: valueTone }];
  const prefix = value.slice(0, sepAt + 1);
  const tail = value.slice(sepAt + 1);
  if (tail.length === 0) return [{ text: value, tone: valueTone }];
  return [
    { text: prefix, tone: "dim" },
    { text: tail, tone: valueTone },
  ];
}

/** Render the folded value as a single string (for places that can't accept segments). */
export function foldedPlain(value: string): string {
  return value;
}
