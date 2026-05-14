import { describe, expect, test } from "bun:test";
import {
  createMotionController,
  fadeIn,
  flash,
  lerpHex,
  progressTick,
  pulse,
  spinnerFrame,
} from "../../src/render/anim.ts";

describe("motion scheduler", () => {
  test("disabled controller ignores tokens and does not start a timer", () => {
    let started = 0;
    const motion = createMotionController({
      enabled: false,
      requestRender: () => {},
      setInterval: () => {
        started += 1;
        return 1;
      },
      clearInterval: () => {},
    });

    motion.play("footer.accept", flash(80, "success"));

    expect(started).toBe(0);
    expect(motion.snapshot("footer.accept")).toEqual({
      active: false,
      kind: null,
      progress: 1,
      tone: null,
      value: null,
    });
  });

  test("tokens expose time-based progress and cap ticks at 30fps", () => {
    let now = 1_000;
    let intervalMs = 0;
    let tick: () => void = () => {};
    let renders = 0;
    const motion = createMotionController({
      enabled: true,
      requestRender: () => {
        renders += 1;
      },
      now: () => now,
      setInterval: (fn, ms) => {
        tick = fn;
        intervalMs = ms;
        return 7;
      },
      clearInterval: () => {},
    });

    motion.play("palette", fadeIn(150));
    expect(intervalMs).toBeGreaterThanOrEqual(33);
    expect(motion.snapshot("palette").progress).toBe(0);

    now += 75;
    expect(motion.snapshot("palette").progress).toBeCloseTo(0.5);

    tick();
    expect(renders).toBe(2);

    now += 80;
    expect(motion.snapshot("palette")).toMatchObject({ active: false, progress: 1 });
  });

  test("pending input suppresses scheduled render ticks without freezing token time", () => {
    let now = 0;
    let tick: () => void = () => {};
    let renders = 0;
    const motion = createMotionController({
      enabled: true,
      requestRender: () => {
        renders += 1;
      },
      isInputPending: () => true,
      now: () => now,
      setInterval: (fn) => {
        tick = fn;
        return 1;
      },
      clearInterval: () => {},
    });

    motion.play("queue", pulse(160, "accent"));
    now = 80;
    tick();

    expect(renders).toBe(1);
    expect(motion.snapshot("queue").progress).toBeCloseTo(0.5);
  });

  test("progressTick interpolates a numeric value", () => {
    let now = 0;
    const motion = createMotionController({
      enabled: true,
      requestRender: () => {},
      now: () => now,
      setInterval: () => 1,
      clearInterval: () => {},
    });

    motion.play("progress.reviewed", progressTick(2, 10, 200));
    now = 100;

    expect(motion.snapshot("progress.reviewed").value).toBe(6);
  });

  test("destroy clears the timer and freezes subsequent play/snapshot calls", () => {
    let cleared = 0;
    const now = 1_000;
    const motion = createMotionController({
      enabled: true,
      requestRender: () => {},
      now: () => now,
      setInterval: () => 42,
      clearInterval: () => {
        cleared += 1;
      },
    });

    motion.play("palette.open", fadeIn(150));
    expect(motion.snapshot("palette.open").active).toBe(true);

    motion.destroy();

    expect(cleared).toBe(1);
    expect(motion.snapshot("palette.open").active).toBe(false);

    motion.play("palette.open", fadeIn(150));
    expect(motion.snapshot("palette.open").active).toBe(false);
    expect(cleared).toBe(1);
  });

  test("lerpHex interpolates RGB and falls back to `to` for non-hex inputs", () => {
    expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(lerpHex("#000", "#fff", 0.5)).toBe("#808080");
    expect(lerpHex("transparent", "#202225", 0.5)).toBe("#202225");
    expect(lerpHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(lerpHex("#000000", "#ffffff", -1)).toBe("#000000");
  });

  test("spinner frames use braille for color and ascii for low-capability displays", () => {
    expect(spinnerFrame({ color: "truecolor" }, 0)).toBe("⠋");
    expect(spinnerFrame({ color: "256" }, 1)).toBe("⠙");
    expect(spinnerFrame({ color: "16" }, 1)).toBe("/");
    expect(spinnerFrame({ color: "mono" }, 2)).toBe("-");
  });
});
