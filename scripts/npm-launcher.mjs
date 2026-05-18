#!/usr/bin/env node
// Top-level launcher: detects platform/arch and execs the matching
// platform sub-package's labellens shim.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// All four targets ship as prebuilt binaries. darwin-x64 used to be omitted
// (see superseded ADR 0006) — current Bun (≥1.3.11) handles foreign-arch
// optional-dep installs cleanly so the cross-compile from arm64 → x64 now
// works in CI.
const PLATFORM_MAP = {
  "darwin-arm64": "label-lens-darwin-arm64",
  "darwin-x64": "label-lens-darwin-x64",
  "linux-arm64": "label-lens-linux-arm64",
  "linux-x64": "label-lens-linux-x64",
};

function detect() {
  const os = process.platform;
  const arch = process.arch;
  const key = `${os}-${arch}`;
  const pkg = PLATFORM_MAP[key];
  if (!pkg) {
    console.error(
      `label-lens: no prebuilt binary for ${key}. Supported: ${Object.keys(PLATFORM_MAP).join(", ")}.`,
    );
    process.exit(1);
  }
  return pkg;
}

function locateBinary(pkgName) {
  let pkgPath;
  try {
    pkgPath = dirname(require.resolve(`${pkgName}/package.json`));
  } catch {
    console.error(
      `label-lens: optional dependency '${pkgName}' was not installed. Re-install with 'npm install --force' or use the curl installer.`,
    );
    process.exit(1);
  }
  const shim = join(pkgPath, "labellens");
  if (!existsSync(shim)) {
    console.error(`label-lens: binary missing at ${shim}.`);
    process.exit(1);
  }
  return shim;
}

const pkg = detect();
const binary = locateBinary(pkg);
const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
