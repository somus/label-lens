import { describe, expect, test } from "bun:test";
import { checkPerf, REGRESSION_HEADROOM } from "../perf/_util.ts";

describe("checkPerf — regression detection", () => {
  test("reports missing when baseline absent", () => {
    const result = checkPerf("unknown_metric", 100, {});
    expect(result.kind).toBe("missing");
  });

  test("passes exactly at baseline (well under limit)", () => {
    const result = checkPerf("m", 100, { m: 100 });
    expect(result.kind).toBe("pass");
  });

  test("passes just under the 1.2x limit", () => {
    // limit = 120; 119.999 < 120
    const baseline = 100;
    const result = checkPerf("m", baseline * REGRESSION_HEADROOM - 0.001, { m: baseline });
    expect(result.kind).toBe("pass");
  });

  test("fails at the limit (strict less-than)", () => {
    const baseline = 100;
    const result = checkPerf("m", baseline * REGRESSION_HEADROOM, { m: baseline });
    expect(result.kind).toBe("fail");
  });

  test("fails just over the limit", () => {
    const baseline = 100;
    const result = checkPerf("m", baseline * REGRESSION_HEADROOM + 0.001, { m: baseline });
    expect(result.kind).toBe("fail");
  });

  test("includes baseline + limit in pass result", () => {
    const result = checkPerf("m", 50, { m: 100 });
    if (result.kind !== "pass") throw new Error("expected pass");
    expect(result.baseline).toBe(100);
    expect(result.limit).toBeCloseTo(120, 5);
    expect(result.elapsedMs).toBe(50);
  });

  test("REGRESSION_HEADROOM is the documented 1.2x", () => {
    expect(REGRESSION_HEADROOM).toBe(1.2);
  });
});
