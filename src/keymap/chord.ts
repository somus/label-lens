import {
  type Action,
  type Binding,
  eventMatchesKey,
  type KeyEvent,
  resolve,
  type Scope,
} from "./engine.ts";

export type ChordOptions = {
  windowMs?: number;
  now?: () => number;
};

type ParsedBinding = {
  parts: string[];
  action: Action;
  scope: Scope;
};

export type ChordResolver = {
  feed(scope: Scope, event: KeyEvent, nowMs?: number): Action | null;
  /** Drop any pending first-key buffer. Call when the active scope changes
   *  for reasons other than the buffered first keystroke (e.g. an overlay
   *  opens, a queue switch fires) so a stale chord-start can't combine with
   *  a fresh second key in a different scope. */
  reset(): void;
  /** Display label for the currently-buffered first key, or `null` when no
   *  chord is in flight. Used by the footer to show a `(g…)` chip while
   *  the reviewer is mid-chord (plan I2). */
  pendingKey(nowMs?: number): string | null;
};

function parseBindings(bindings: Binding[]): { single: Binding[]; chords: ParsedBinding[] } {
  const single: Binding[] = [];
  const chords: ParsedBinding[] = [];
  for (const b of bindings) {
    if (b.key.includes(" ")) {
      // Keep raw modifier-aware tokens (e.g. "ctrl+g", "g", "shift+g").
      chords.push({
        parts: b.key.split(" "),
        action: b.action,
        scope: b.scope,
      });
    } else {
      single.push(b);
    }
  }
  return { single, chords };
}

export function createChordResolver(
  bindings: Binding[],
  options: ChordOptions = {},
): ChordResolver {
  const windowMs = options.windowMs ?? 500;
  const clock = options.now ?? (() => Date.now());
  const { single, chords } = parseBindings(bindings);

  let pending: { firstPart: string; event: KeyEvent; scope: Scope; at: number } | null = null;

  function chordCandidatesByFirstKey(scope: Scope, event: KeyEvent): ParsedBinding[] {
    return chords.filter(
      (c) => (c.scope === scope || c.scope === "global") && eventMatchesKey(event, c.parts[0]!),
    );
  }

  return {
    feed(scope, event, nowMs) {
      const at = nowMs ?? clock();

      if (pending && at - pending.at <= windowMs && pending.scope === scope) {
        const candidates = chords.filter(
          (c) =>
            (c.scope === scope || c.scope === "global") &&
            c.parts[0] === pending!.firstPart &&
            eventMatchesKey(event, c.parts[1]!),
        );
        pending = null;
        if (candidates.length > 0) return candidates[0]!.action;
        return resolve(single, scope, event);
      }

      pending = null;
      const candidates = chordCandidatesByFirstKey(scope, event);
      if (candidates.length > 0) {
        // The first key matched a chord prefix; buffer it.
        pending = { firstPart: candidates[0]!.parts[0]!, event, scope, at };
        return null;
      }

      return resolve(single, scope, event);
    },
    reset() {
      pending = null;
    },
    pendingKey(nowMs) {
      if (!pending) return null;
      const at = nowMs ?? clock();
      // Expire stale chord buffers proactively so the footer chip
      // disappears when the window lapses without a follow-up.
      if (at - pending.at > windowMs) return null;
      return pending.firstPart;
    },
  };
}
