import { describe, expect, test } from "bun:test";
import { missingRequiredFields } from "../../src/actions/record/extraction-validate.ts";
import type { ExtractionField } from "../../src/config/config.ts";
import { encodeExtractionObject } from "../../src/labels/extraction-object.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false },
  { name: "country", type: "string", required: true },
];

describe("missingRequiredFields", () => {
  test("returns [] when all required fields have non-empty strings", () => {
    const text = encodeExtractionObject({ company: "Acme", country: "US" }, FIELDS);
    expect(missingRequiredFields(text, FIELDS)).toEqual([]);
  });

  test("names required fields that are null", () => {
    const text = encodeExtractionObject({ company: "Acme" }, FIELDS);
    expect(missingRequiredFields(text, FIELDS)).toEqual(["country"]);
  });

  test("names required fields that are empty strings", () => {
    const text = encodeExtractionObject({ company: "", country: "" }, FIELDS);
    expect(missingRequiredFields(text, FIELDS)).toEqual(["company", "country"]);
  });

  test("treats malformed storage as 'all required fields missing' so accept refuses safely", () => {
    expect(missingRequiredFields("not json", FIELDS)).toEqual(["company", "country"]);
  });

  test("ignores optional fields regardless of value", () => {
    const text = encodeExtractionObject({ company: "Acme", country: "US" }, FIELDS);
    expect(missingRequiredFields(text, FIELDS)).toEqual([]);
  });
});
