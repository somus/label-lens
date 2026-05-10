import { type Action, type Binding, type KeyEvent, resolve, type Scope } from "./engine.ts";

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
};

function parseBindings(bindings: Binding[]): { single: Binding[]; chords: ParsedBinding[] } {
  const single: Binding[] = [];
  const chords: ParsedBinding[] = [];
  for (const b of bindings) {
    if (b.key.includes(" ")) {
      chords.push({
        parts: b.key.split(" ").map((s) => s.toLowerCase()),
        action: b.action,
        scope: b.scope,
      });
    } else {
      single.push(b);
    }
  }
  return { single, chords };
}

function eventKey(event: KeyEvent): string {
  return event.name.toLowerCase();
}

export function createChordResolver(
  bindings: Binding[],
  options: ChordOptions = {},
): ChordResolver {
  const windowMs = options.windowMs ?? 500;
  const clock = options.now ?? (() => Date.now());
  const { single, chords } = parseBindings(bindings);

  let pending: { firstKey: string; scope: Scope; at: number } | null = null;

  function chordCandidates(scope: Scope, firstKey: string): ParsedBinding[] {
    return chords.filter(
      (c) => (c.scope === scope || c.scope === "global") && c.parts[0] === firstKey,
    );
  }

  return {
    feed(scope, event, nowMs) {
      const at = nowMs ?? clock();
      const key = eventKey(event);

      if (pending && at - pending.at <= windowMs && pending.scope === scope) {
        const matches = chordCandidates(scope, pending.firstKey).filter((c) => c.parts[1] === key);
        pending = null;
        if (matches.length > 0) return matches[0]!.action;
        return resolve(single, scope, event);
      }

      pending = null;
      const couldStartChord = chordCandidates(scope, key).length > 0;
      if (couldStartChord) {
        pending = { firstKey: key, scope, at };
        return null;
      }

      return resolve(single, scope, event);
    },
  };
}
