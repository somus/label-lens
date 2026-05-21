import { describe, expect, test } from "bun:test";
import type { ExtractionField } from "../../src/config/config.ts";
import {
  canonicalizeExtractionObject,
  decodeExtractionObject,
  decodeExtractionObjectStrict,
  encodeExtractionObject,
  extractionObjectsEqual,
  validateExportExtractionObject,
} from "../../src/labels/extraction-object.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false, key: "amt" },
  { name: "date", type: "string", required: false },
];

describe("encodeExtractionObject", () => {
  test("emits keys in configured field order, resolving `key` aliases on input", () => {
    expect(
      encodeExtractionObject({ date: "2026-05-21", company: "Acme", amt: "100" }, FIELDS),
    ).toBe('{"company":"Acme","amount":"100","date":"2026-05-21"}');
  });

  test("emits nulls for missing configured fields", () => {
    expect(encodeExtractionObject({ company: "Acme" }, FIELDS)).toBe(
      '{"company":"Acme","amount":null,"date":null}',
    );
  });

  test("coerces blank strings, numbers, and other non-strings to null", () => {
    expect(encodeExtractionObject({ company: "  ", amt: 100, date: true }, FIELDS)).toBe(
      '{"company":null,"amount":null,"date":null}',
    );
  });
});

describe("canonicalizeExtractionObject", () => {
  test("reports unknown source keys in `dropped`, but keeps canonical object configured-only", () => {
    const { object, dropped } = canonicalizeExtractionObject(
      { company: "Acme", amt: "100", notes: "n/a" },
      FIELDS,
    );
    expect(object).toEqual({ company: "Acme", amount: "100", date: null });
    expect(dropped).toEqual(["notes"]);
  });

  test("non-object input yields all-null canonical object", () => {
    const { object } = canonicalizeExtractionObject(null, FIELDS);
    expect(object).toEqual({ company: null, amount: null, date: null });
  });
});

describe("decodeExtractionObject (lenient)", () => {
  test("returns string|null values for configured fields; missing become null", () => {
    expect(
      decodeExtractionObject('{"company":"Acme","amount":null,"date":"2026"}', FIELDS),
    ).toEqual({ company: "Acme", amount: null, date: "2026" });
  });

  test("malformed text returns all-null configured object (no throw)", () => {
    expect(decodeExtractionObject("not json", FIELDS)).toEqual({
      company: null,
      amount: null,
      date: null,
    });
  });
});

describe("decodeExtractionObjectStrict", () => {
  test("returns the parsed object on valid input", () => {
    expect(decodeExtractionObjectStrict('{"company":"Acme","amount":null}')).toEqual({
      company: "Acme",
      amount: null,
    });
  });

  test("throws on non-JSON text", () => {
    expect(() => decodeExtractionObjectStrict("not json")).toThrow(/malformed.*JSON/);
  });

  test("throws on non-object JSON", () => {
    expect(() => decodeExtractionObjectStrict('"x"')).toThrow(/expected JSON object/);
    expect(() => decodeExtractionObjectStrict("[]")).toThrow(/expected JSON object/);
    expect(() => decodeExtractionObjectStrict("null")).toThrow(/expected JSON object/);
  });

  test("throws when any field value is not string or null", () => {
    expect(() => decodeExtractionObjectStrict('{"x":42}')).toThrow(/string or null/);
    expect(() => decodeExtractionObjectStrict('{"x":true}')).toThrow(/string or null/);
    expect(() => decodeExtractionObjectStrict('{"x":{"y":"z"}}')).toThrow(/string or null/);
  });

  test("error messages do not embed the raw input text", () => {
    const huge = `"${"x".repeat(5000)}"`;
    try {
      decodeExtractionObjectStrict(huge);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("xxxx");
    }
  });
});

describe("validateExportExtractionObject", () => {
  test("returns the object in configured order on valid input", () => {
    const out = validateExportExtractionObject(
      '{"date":"2026","amount":"100","company":"Acme"}',
      "rec1",
      FIELDS,
    );
    expect(Object.keys(out)).toEqual(["company", "amount", "date"]);
    expect(out).toEqual({ company: "Acme", amount: "100", date: "2026" });
  });

  test("aborts with record id when a required field is null", () => {
    expect(() => validateExportExtractionObject('{"amount":"100"}', "rec1", FIELDS)).toThrow(
      /rec1.*required.*company/,
    );
  });

  test("aborts on malformed stored value, prefixing record id", () => {
    expect(() => validateExportExtractionObject("not json", "rec1", FIELDS)).toThrow(
      /rec1.*malformed/,
    );
  });

  test("drops unknown stored keys from the exported object", () => {
    // The corrected export shape is configured-only. Raw source JSON
    // still lives in `predictions.raw` / `records.raw` for forensics.
    const out = validateExportExtractionObject(
      '{"company":"Acme","amount":"1","date":"2026","_extra":"v"}',
      "rec1",
      FIELDS,
    );
    expect(Object.keys(out)).toEqual(["company", "amount", "date"]);
    expect("_extra" in out).toBe(false);
  });
});

describe("extractionObjectsEqual", () => {
  test("treats null and missing as the same", () => {
    expect(
      extractionObjectsEqual({ company: "Acme", amount: null }, { company: "Acme", amount: null }),
    ).toBe(true);
  });

  test("differs when any value differs", () => {
    expect(
      extractionObjectsEqual({ company: "Acme", amount: null }, { company: "Acme", amount: "1" }),
    ).toBe(false);
  });
});
