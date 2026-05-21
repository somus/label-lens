import { describe, expect, test } from "bun:test";
import { summarizeProviderError } from "../../src/assistant/provider.ts";

describe("summarizeProviderError", () => {
  test("collapses Google-style 502 JSON payloads to status + code", () => {
    const raw =
      '{"error":{"message":"<!DOCTYPE html>\\n<html lang=en>\\n<title>Error 502 (Server Error)!!1</title>","code":502,"status":"Bad Gateway"}}';
    expect(summarizeProviderError(raw)).toBe("provider error: Bad Gateway (502)");
  });

  test("uses status when only status is present", () => {
    const raw = '{"error":{"status":"Service Unavailable"}}';
    expect(summarizeProviderError(raw)).toBe("provider error: Service Unavailable");
  });

  test("uses code when only code is present", () => {
    const raw = '{"error":{"code":429}}';
    expect(summarizeProviderError(raw)).toBe("provider error: code 429");
  });

  test("summarises bare HTML error pages without parsing", () => {
    const raw = "<!DOCTYPE html><html lang=en><title>502</title>";
    expect(summarizeProviderError(raw)).toBe(
      "provider returned an HTML error page (likely a 5xx upstream failure)",
    );
  });

  test("HTML detection is case-insensitive", () => {
    expect(summarizeProviderError("<HTML><body>oops</body></HTML>")).toContain("HTML error page");
  });

  test("plain short messages pass through unchanged", () => {
    expect(summarizeProviderError("rate_limit_exceeded")).toBe("rate_limit_exceeded");
  });

  test("very long messages are truncated to keep the overlay row sane", () => {
    const long = "x".repeat(500);
    const out = summarizeProviderError(long);
    expect(out.length).toBeLessThanOrEqual(241);
    expect(out.endsWith("…")).toBe(true);
  });

  test("empty input returns a generic message instead of an empty string", () => {
    expect(summarizeProviderError("")).toBe("provider stream error (no message)");
  });

  test("malformed JSON falls through to truncation", () => {
    const raw = "{not json but starts with brace";
    expect(summarizeProviderError(raw)).toBe(raw);
  });
});
