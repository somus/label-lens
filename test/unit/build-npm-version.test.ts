import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../../scripts/build-npm.ts");

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync("bun", ["run", SCRIPT, ...args], {
    env: { ...process.env, ...env, LL_TEST_NO_BUILD: "1" },
    encoding: "utf8",
  });
}

// Sanity test on a pure helper extracted via dynamic import. We import the
// script's normalizeVersion through Bun's module resolution by re-loading the
// file as a module — the script's `main()` runs on import, so we test the
// pure function via a dedicated entry below instead.

describe("build-npm version resolution", () => {
  test("rejects non-semver tags", () => {
    const result = run(["--version", "release-1"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid semver");
  });

  test("strips leading 'v' from a tag", () => {
    const result = run(["--version", "v1.2.3"]);
    // Will fail later because no build artifacts exist, but the version
    // resolution prints first.
    expect(result.stdout + result.stderr).toContain("1.2.3");
    expect(result.stdout + result.stderr).not.toContain("v1.2.3 (");
  });

  test("accepts plain semver", () => {
    const result = run(["--version", "0.1.0"]);
    expect(result.stdout + result.stderr).toContain("0.1.0");
  });

  test("accepts prerelease semver", () => {
    const result = run(["--version", "v0.1.0-beta.1"]);
    expect(result.stdout + result.stderr).toContain("0.1.0-beta.1");
  });

  test("env GITHUB_REF_NAME used on release event", () => {
    const result = run([], {
      GITHUB_EVENT_NAME: "release",
      GITHUB_REF_NAME: "v2.5.0",
    });
    expect(result.stdout + result.stderr).toContain("2.5.0");
  });

  test("LL_RELEASE_VERSION wins over package.json", () => {
    const result = run([], { LL_RELEASE_VERSION: "9.9.9" });
    expect(result.stdout + result.stderr).toContain("9.9.9");
  });
});
