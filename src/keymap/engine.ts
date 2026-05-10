export type Action = string;

export type Scope = "global" | "review" | "queue" | "stats" | "palette" | "assistant" | "doc-view";

export type Binding = {
  key: string;
  action: Action;
  scope: Scope;
};

export type KeyEvent = {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
};

function eventMatchesKey(event: KeyEvent, key: string): boolean {
  const parts = key.toLowerCase().split("+");
  const wantCtrl = parts.includes("ctrl");
  const wantShift = parts.includes("shift");
  const wantMeta = parts.includes("meta");
  const wantName = parts[parts.length - 1];

  if (!!event.ctrl !== wantCtrl) return false;
  if (!!event.shift !== wantShift) return false;
  if (!!event.meta !== wantMeta) return false;
  return event.name.toLowerCase() === wantName;
}

export function resolve(bindings: Binding[], scope: Scope, event: KeyEvent): Action | null {
  for (const b of bindings) {
    if (b.scope !== scope && b.scope !== "global") continue;
    if (eventMatchesKey(event, b.key)) return b.action;
  }
  return null;
}
