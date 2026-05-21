import { expect, test } from "bun:test";
import {
  decodeLabelSet,
  decodeLabelSetStrict,
  encodeLabelSet,
  labelSetsEqual,
  normalizeLabelSet,
} from "../../src/labels/label-set.ts";

const configured = ["spam", "toxicity", "promotion"];

test("encodeLabelSet emits canonical JSON array text", () => {
  expect(encodeLabelSet(["spam", "toxicity"])).toBe('["spam","toxicity"]');
  expect(encodeLabelSet([])).toBe("[]");
});

test("decodeLabelSet round-trips encoded sets and tolerates garbage", () => {
  expect(decodeLabelSet('["spam","toxicity"]')).toEqual(["spam", "toxicity"]);
  expect(decodeLabelSet("[]")).toEqual([]);
  expect(decodeLabelSet("not-json")).toEqual([]);
  expect(decodeLabelSet('"spam"')).toEqual([]);
  expect(decodeLabelSet('["spam",42,"toxicity"]')).toEqual(["spam", "toxicity"]);
});

test("normalizeLabelSet keeps configured labels in configured order", () => {
  const r = normalizeLabelSet(["toxicity", "spam"], configured);
  expect(r.set).toEqual(["spam", "toxicity"]);
  expect(r.dropped).toEqual([]);
  expect(r.duplicates).toEqual([]);
});

test("normalizeLabelSet drops unknown labels and reports them", () => {
  const r = normalizeLabelSet(["spam", "bogus", "toxicity"], configured);
  expect(r.set).toEqual(["spam", "toxicity"]);
  expect(r.dropped).toEqual(["bogus"]);
  expect(r.duplicates).toEqual([]);
});

test("normalizeLabelSet dedupes and reports duplicates", () => {
  const r = normalizeLabelSet(["spam", "spam", "toxicity"], configured);
  expect(r.set).toEqual(["spam", "toxicity"]);
  expect(r.duplicates).toEqual(["spam"]);
});

test("normalizeLabelSet rejects non-array input", () => {
  const r = normalizeLabelSet("spam", configured);
  expect(r.set).toEqual([]);
  expect(r.dropped).toEqual(["spam"]);
});

test("normalizeLabelSet trims whitespace before matching", () => {
  const r = normalizeLabelSet(["  spam  ", "toxicity"], configured);
  expect(r.set).toEqual(["spam", "toxicity"]);
});

test("normalizeLabelSet drops non-string entries with their stringified form", () => {
  const r = normalizeLabelSet(["spam", 42, null], configured);
  expect(r.set).toEqual(["spam"]);
  expect(r.dropped).toEqual(["42", "null"]);
});

test("decodeLabelSetStrict returns the array on canonical input", () => {
  expect(decodeLabelSetStrict('["spam","toxicity"]')).toEqual(["spam", "toxicity"]);
  expect(decodeLabelSetStrict("[]")).toEqual([]);
});

test("decodeLabelSetStrict throws on non-JSON text", () => {
  expect(() => decodeLabelSetStrict("not-json")).toThrow(/malformed/i);
});

test("decodeLabelSetStrict throws on JSON that is not an array", () => {
  expect(() => decodeLabelSetStrict('"spam"')).toThrow(/array/i);
  expect(() => decodeLabelSetStrict("null")).toThrow(/array/i);
  expect(() => decodeLabelSetStrict("{}")).toThrow(/array/i);
});

test("decodeLabelSetStrict throws when any element is not a string", () => {
  expect(() => decodeLabelSetStrict('["spam",42,"toxicity"]')).toThrow(/string/i);
  expect(() => decodeLabelSetStrict("[null]")).toThrow(/string/i);
});

test("decodeLabelSetStrict accepts empty-string elements; configured-label match catches them upstream", () => {
  // Strict decoder validates only the JSON shape. Empty strings are valid
  // strings; ingest/commit normalisation refuses anything not in the
  // configured label set, so an empty string can never reach storage via
  // the supported paths. The decoder must not assume label semantics.
  expect(decodeLabelSetStrict('[""]')).toEqual([""]);
});

test("decodeLabelSetStrict error messages do not embed the raw input text", () => {
  // Stored values could be large or contain sensitive content. The decoder
  // intentionally omits the blob; the export-side wrapper prefixes the
  // record id so callers can still locate the bad row.
  const huge = `"${"x".repeat(5000)}"`;
  try {
    decodeLabelSetStrict(huge);
    throw new Error("expected throw");
  } catch (err) {
    expect((err as Error).message).not.toContain("xxxx");
  }
});

test("labelSetsEqual is order-insensitive", () => {
  expect(labelSetsEqual(["spam", "toxicity"], ["toxicity", "spam"])).toBe(true);
  expect(labelSetsEqual(["spam"], ["spam", "toxicity"])).toBe(false);
  expect(labelSetsEqual([], [])).toBe(true);
});
