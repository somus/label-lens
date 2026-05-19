import { describe, expect, test } from "bun:test";
import { getMeta, setMeta } from "../../src/store/meta.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("meta kv", () => {
  test("getMeta returns null for an unset key", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(getMeta(store.db, "signals.lowConfidence.applied")).toBeNull();
  });

  test("setMeta then getMeta round-trips a value", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    setMeta(store.db, "signals.lowConfidence.applied", '{"default":0.5}');
    expect(getMeta(store.db, "signals.lowConfidence.applied")).toBe('{"default":0.5}');
  });

  test("setMeta overwrites an existing value", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    setMeta(store.db, "k", "v1");
    setMeta(store.db, "k", "v2");
    expect(getMeta(store.db, "k")).toBe("v2");
  });
});
