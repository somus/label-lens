import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/config/config.ts";

const FIELDS = { text: "text" };

describe("defaultConfig assistant defaults", () => {
  test("includes assistant block with enabled: false", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS });
    expect(cfg.assistant).toEqual({ enabled: false });
  });
});
