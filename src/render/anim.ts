import type { CapabilityColor } from "./capability.ts";
import type { Tone } from "./chrome/status-bar.ts";

export type FeedbackTone = Extract<Tone, "accent" | "success" | "danger" | "info">;

export type MotionToken =
  | { kind: "fadeIn"; durationMs: number }
  | { kind: "flash"; durationMs: number; tone: FeedbackTone }
  | { kind: "pulse"; durationMs: number; tone: Tone }
  | { kind: "progressTick"; durationMs: number; from: number; to: number };

export type MotionSnapshot = {
  active: boolean;
  kind: MotionToken["kind"] | null;
  progress: number;
  tone: FeedbackTone | Tone | null;
  value: number | null;
};

export type MotionController = {
  enabled: boolean;
  play(key: string, token: MotionToken): void;
  snapshot(key: string): MotionSnapshot;
  destroy(): void;
};

type RunningToken = {
  token: MotionToken;
  startedAt: number;
  endsAt: number;
};

export type MotionSchedulerOptions = {
  enabled: boolean;
  requestRender: () => void;
  isInputPending?: () => boolean;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  frameMs?: number;
};

const MIN_FRAME_MS = 33;
// Returned by reference from snapshot() in the hot path (every render queries
// the footer / status entries). Frozen so callers can't mutate the singleton.
const INACTIVE: MotionSnapshot = Object.freeze({
  active: false,
  kind: null,
  progress: 1,
  tone: null,
  value: null,
}) as MotionSnapshot;

export function fadeIn(durationMs = 200): MotionToken {
  return { kind: "fadeIn", durationMs };
}

export function flash(durationMs = 80, tone: FeedbackTone = "accent"): MotionToken {
  return { kind: "flash", durationMs, tone };
}

export function pulse(durationMs = 160, tone: Tone = "accent"): MotionToken {
  return { kind: "pulse", durationMs, tone };
}

export function progressTick(from: number, to: number, durationMs = 200): MotionToken {
  return { kind: "progressTick", from, to, durationMs };
}

export function createMotionController(options: MotionSchedulerOptions): MotionController {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = options.clearInterval ?? ((handle) => clearInterval(handle as Timer));
  const frameMs = Math.max(MIN_FRAME_MS, options.frameMs ?? MIN_FRAME_MS);
  const running = new Map<string, RunningToken>();
  let timer: unknown = null;
  let destroyed = false;

  const stopTimerIfIdle = () => {
    if (running.size > 0 || timer === null) return;
    clearTimer(timer);
    timer = null;
  };

  const sweepExpired = () => {
    const t = now();
    for (const [key, item] of running) {
      if (item.endsAt <= t) running.delete(key);
    }
    stopTimerIfIdle();
  };

  const tick = () => {
    if (destroyed) return;
    sweepExpired();
    if (running.size === 0) return;
    if (options.isInputPending?.()) return;
    try {
      options.requestRender();
    } catch {
      // Tests and shutdown paths can outlive the sqlite handle behind a render.
      // Motion ticks are cosmetic, so a failed late repaint should not crash.
    }
  };

  const ensureTimer = () => {
    if (timer !== null || destroyed) return;
    timer = setTimer(tick, frameMs);
    if (timer && typeof timer === "object" && "unref" in timer) {
      (timer as { unref: () => void }).unref();
    }
  };

  return {
    enabled: options.enabled,
    play(key, token) {
      if (!options.enabled || destroyed) return;
      const startedAt = now();
      const durationMs = Math.max(1, token.durationMs);
      running.set(key, { token, startedAt, endsAt: startedAt + durationMs });
      ensureTimer();
      options.requestRender();
    },
    snapshot(key) {
      if (!options.enabled || destroyed) return INACTIVE;
      const item = running.get(key);
      if (!item) return INACTIVE;
      const t = now();
      if (item.endsAt <= t) {
        running.delete(key);
        stopTimerIfIdle();
        return INACTIVE;
      }
      const progress = Math.max(
        0,
        Math.min(1, (t - item.startedAt) / Math.max(1, item.token.durationMs)),
      );
      const tone =
        item.token.kind === "flash" || item.token.kind === "pulse" ? item.token.tone : null;
      const value =
        item.token.kind === "progressTick"
          ? item.token.from + (item.token.to - item.token.from) * progress
          : null;
      return { active: true, kind: item.token.kind, progress, tone, value };
    },
    destroy() {
      destroyed = true;
      running.clear();
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

function parseHex(s: string): [number, number, number] | null {
  if (s.length !== 4 && s.length !== 7) return null;
  if (s[0] !== "#") return null;
  const hex = s.length === 4 ? `${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s.slice(1);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function lerpHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return to;
  const k = Math.max(0, Math.min(1, t));
  return toHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

const BRAILLE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MONO_SPINNER = ["|", "/", "-", "\\"];

export function spinnerFrame(display: { color: CapabilityColor }, index: number): string {
  const frames =
    display.color === "truecolor" || display.color === "256" ? BRAILLE_SPINNER : MONO_SPINNER;
  return frames[Math.abs(index) % frames.length]!;
}
