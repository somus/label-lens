#!/usr/bin/env bun
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const NPM_DIR = resolve(ROOT, "dist", "npm");

const PLATFORMS = [
  { name: "darwin-arm64", os: "darwin", cpu: "arm64" },
  { name: "darwin-x64", os: "darwin", cpu: "x64" },
  { name: "linux-arm64", os: "linux", cpu: "arm64" },
  { name: "linux-x64", os: "linux", cpu: "x64" },
] as const;

async function readVersion(): Promise<string> {
  const pkg = JSON.parse(await Bun.file(resolve(ROOT, "package.json")).text()) as {
    version: string;
  };
  return pkg.version;
}

function buildPlatformPackage(platform: (typeof PLATFORMS)[number], version: string): boolean {
  const srcBuildDir = resolve(ROOT, "dist", `label-lens-${platform.name}`);
  if (!existsSync(join(srcBuildDir, "labellens"))) {
    console.warn(`  skipping ${platform.name}: no build at ${srcBuildDir}`);
    return false;
  }
  const outDir = join(NPM_DIR, `label-lens-${platform.name}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  copyFileSync(join(srcBuildDir, "labellens"), join(outDir, "labellens"));
  copyFileSync(join(srcBuildDir, "labellens.bin"), join(outDir, "labellens.bin"));
  copyFileSync(join(srcBuildDir, "parser.worker.js"), join(outDir, "parser.worker.js"));
  chmodSync(join(outDir, "labellens"), 0o755);
  chmodSync(join(outDir, "labellens.bin"), 0o755);

  const pkg = {
    name: `label-lens-${platform.name}`,
    version,
    description: `LabelLens binary for ${platform.name}`,
    repository: { type: "git", url: "https://github.com/somus/label-lens" },
    license: "MIT",
    os: [platform.os],
    cpu: [platform.cpu],
    files: ["labellens", "labellens.bin", "parser.worker.js"],
  };
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(
    join(outDir, "README.md"),
    `# label-lens-${platform.name}\n\nPlatform binary for [\`label-lens\`](https://github.com/somus/label-lens). Do not install directly — install \`label-lens\` instead.\n`,
  );
  return true;
}

function buildTopLevelPackage(version: string): void {
  const outDir = join(NPM_DIR, "label-lens");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  copyFileSync(resolve(ROOT, "scripts/npm-launcher.mjs"), join(outDir, "cli.mjs"));
  chmodSync(join(outDir, "cli.mjs"), 0o755);
  copyFileSync(resolve(ROOT, "README.md"), join(outDir, "README.md"));

  const optionalDependencies: Record<string, string> = {};
  for (const p of PLATFORMS) {
    optionalDependencies[`label-lens-${p.name}`] = version;
  }

  const pkg = {
    name: "label-lens",
    version,
    description: "Terminal-first review tool for noisy text training data.",
    repository: { type: "git", url: "https://github.com/somus/label-lens" },
    license: "MIT",
    bin: { labellens: "./cli.mjs" },
    files: ["cli.mjs", "README.md"],
    optionalDependencies,
    engines: { node: ">=18" },
  };
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

async function main(): Promise<void> {
  const version = await readVersion();
  console.log(`Building npm packages at version ${version}`);

  rmSync(NPM_DIR, { recursive: true, force: true });
  mkdirSync(NPM_DIR, { recursive: true });

  let built = 0;
  for (const p of PLATFORMS) {
    if (buildPlatformPackage(p, version)) {
      built++;
      console.log(`  built label-lens-${p.name}`);
    }
  }
  if (built === 0) {
    throw new Error(
      "no platform builds found. Run 'bun run build:bin <target>' first or use the release CI.",
    );
  }
  buildTopLevelPackage(version);
  console.log(`  built label-lens (top-level)`);

  console.log(`\nNpm packages staged at ${NPM_DIR}.`);
  console.log("Publish with: cd dist/npm/<pkg> && npm publish --access public");
}

main();
