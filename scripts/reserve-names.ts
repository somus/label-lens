#!/usr/bin/env bun
/**
 * Stage 0.0.0 stub packages so we can reserve npm names.
 *
 * Run order:
 *   1. npm login                     (one-time, interactive)
 *   2. bun run scripts/reserve-names.ts        (stages stubs in dist/reserve/)
 *   3. bun run scripts/reserve-names.ts publish (publishes each stub)
 *
 * After publish, configure npm's OIDC trusted publisher on npmjs.com for
 * each package: package settings → "Trusted Publishers" → GitHub Actions
 * → repo somus/label-lens, workflow .github/workflows/release.yml.
 *
 * Once trusted publishers are configured, release.yml can drop NPM_TOKEN
 * entirely (it already passes id-token: write + --provenance).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const STAGE = join(ROOT, "dist", "reserve");

const PLATFORMS = [
  { name: "darwin-arm64", os: "darwin", cpu: "arm64" },
  { name: "darwin-x64", os: "darwin", cpu: "x64" },
  { name: "linux-arm64", os: "linux", cpu: "arm64" },
  { name: "linux-x64", os: "linux", cpu: "x64" },
] as const;

type Pkg = {
  name: string;
  version: string;
  description: string;
  repository: { type: string; url: string };
  license: string;
  os?: string[];
  cpu?: string[];
  files?: string[];
};

function topLevelStub(): Pkg {
  return {
    name: "label-lens",
    version: "0.0.0",
    description:
      "Terminal-first review tool for noisy text training data. Name reservation; not a usable release.",
    repository: { type: "git", url: "https://github.com/somus/label-lens" },
    license: "MIT",
  };
}

function platformStub(p: (typeof PLATFORMS)[number]): Pkg {
  return {
    name: `label-lens-${p.name}`,
    version: "0.0.0",
    description: `Platform binary placeholder for label-lens (${p.name}). Name reservation; not a usable release.`,
    repository: { type: "git", url: "https://github.com/somus/label-lens" },
    license: "MIT",
    os: [p.os],
    cpu: [p.cpu],
  };
}

const README = (name: string) =>
  `# ${name}\n\nReserved name for [\`label-lens\`](https://github.com/somus/label-lens). 0.0.0 is a placeholder; use the real release.\n`;

function stage(): { dir: string; pkgName: string }[] {
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  const out: { dir: string; pkgName: string }[] = [];
  const all: Pkg[] = [topLevelStub(), ...PLATFORMS.map(platformStub)];
  for (const pkg of all) {
    const dir = join(STAGE, pkg.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    writeFileSync(join(dir, "README.md"), README(pkg.name));
    out.push({ dir, pkgName: pkg.name });
    console.log(`  staged ${pkg.name} at ${dir}`);
  }
  return out;
}

function publish(packages: { dir: string; pkgName: string }[]): void {
  console.log("\nPublishing stubs (npm publish --access public)...");
  for (const p of packages) {
    console.log(`\n=== ${p.pkgName} ===`);
    const result = spawnSync("npm", ["publish", "--access", "public"], {
      cwd: p.dir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error(`  FAILED publishing ${p.pkgName}; aborting.`);
      process.exit(result.status ?? 1);
    }
  }
  console.log("\nAll 5 packages published as 0.0.0 stubs.");
  console.log("Next: configure trusted publishers on npmjs.com per package.");
}

const cmd = process.argv[2] ?? "stage";
const packages = stage();
if (cmd === "publish") {
  publish(packages);
} else {
  console.log("\nStubs staged at dist/reserve/. To publish (after `npm login`):");
  console.log("  bun run scripts/reserve-names.ts publish");
}
