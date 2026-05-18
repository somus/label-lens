#!/usr/bin/env bun
/**
 * Generate `labellens.1` from HELP_TEXT in src/cli/help.ts. Writes to
 * dist/label-lens-<target>/labellens.1 so release.yml bundles it in the
 * tarball; install.sh symlinks it into ~/.local/share/man/man1 (or the
 * /usr/local equivalent for root installs).
 *
 * Format: groff -man, the standard man(7) macro set. Section 1 = user
 * commands. Headers use `.SH`; flags use `.TP` with the flag on its own
 * line. Keep this minimal — `man` already handles wrapping.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HELP_TEXT } from "../src/cli/help.ts";

const ROOT = resolve(import.meta.dir, "..");

function target(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${platform}-${arch}`;
}

function version(): string {
  return (process.env.LL_RELEASE_VERSION ?? "dev").replace(/^v/, "");
}

function buildManPage(): string {
  const v = version();
  const date = new Date().toISOString().slice(0, 10);
  const head = `.TH LABELLENS 1 "${date}" "labellens ${v}" "User Commands"
.SH NAME
labellens \\- terminal-first review tool for noisy text training data
.SH SYNOPSIS
.B labellens
.RI [ SUBCOMMAND ]
.RI [ ARGS ]
.RI [ FLAGS ]
.SH DESCRIPTION
LabelLens reviews and cleans text classification / boundary datasets produced by
rules, LLMs, weak supervision, or early model predictions. It runs over SSH,
keeps state in a sidecar SQLite database, and ships as a single compiled
binary.
.PP
With no subcommand it opens the interactive review screen against
.I labellens.config.json
in the current directory.
`;

  // Convert HELP_TEXT into man-style sections. Each upper-case header line
  // becomes an .SH; body content is wrapped in .nf / .fi (no-fill) so
  // multi-line aligned content (flag tables, examples) preserves layout.
  const sections: string[] = [];
  const lines = HELP_TEXT.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]?.trim() === "") i++;
  i++; // skip the title line; already in `head`.

  let inSection = false;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^[A-Z][A-Z ]+$/.test(line.trim()) && line.trim() === line.trim().toUpperCase()) {
      if (inSection) sections.push(".fi");
      sections.push(`.SH ${line.trim()}`);
      sections.push(".nf");
      inSection = true;
      i++;
      continue;
    }
    // Strip the leading two-space indent from HELP_TEXT — `.nf` already
    // preserves the rest of the layout. Escape backslashes for groff.
    const body = line.replace(/^ {2}/, "").replace(/\\/g, "\\\\");
    sections.push(body);
    i++;
  }
  if (inSection) sections.push(".fi");

  const tail = `.SH AUTHOR
Maintained by Somasundaram Ayyappan.
.SH SEE ALSO
.UR https://github.com/somus/label-lens
project home
.UE
,
.UR https://github.com/somus/label-lens/blob/main/docs/tutorial.md
quickstart tutorial
.UE
`;

  return `${head}${sections.join("\n")}\n${tail}`;
}

function main(): void {
  const targetName = target();
  const outDir = resolve(ROOT, "dist", `label-lens-${targetName}`);
  mkdirSync(outDir, { recursive: true });
  const manPath = join(outDir, "labellens.1");
  writeFileSync(manPath, buildManPage());
  console.log(`Wrote ${manPath}`);
}

main();
