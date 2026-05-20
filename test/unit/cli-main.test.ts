import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { tmpdir } from "../util/tmp.ts";

const MAIN = resolve(import.meta.dir, "../..", "src/main.ts");

async function runMain(
  args: string[],
  cwd?: string,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn([process.execPath, MAIN, ...args], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LABELLENS_EXIT_DELAY_MS: "0" },
  });
  proc.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("src/main.ts command dispatch", () => {
  test("--help prints canonical help and exits cleanly", async () => {
    const result = await runMain(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("labellens init <file.jsonl>");
    expect(result.stdout).toContain("EXIT CODES");
    expect(result.stderr).toBe("");
  });

  test("--version prints source-mode version", async () => {
    const result = await runMain(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("labellens dev");
    expect(result.stderr).toBe("");
  });

  test("unknown command exits 2 with usage hint", async () => {
    const result = await runMain(["nope"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("labellens: unknown command 'nope'");
    expect(result.stderr).toContain("Run 'labellens --help' for usage.");
  });

  test("init without input exits 2 before touching the filesystem", async () => {
    using project = tmpdir({ prefix: "labellens-main-init-" });
    const result = await runMain(["init"], project.path);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("usage: labellens init <file.jsonl>");
  });

  test("--local-only is parsed as a global flag, not a subcommand", async () => {
    using project = tmpdir({ prefix: "labellens-main-localonly-" });
    const result = await runMain(["--local-only"], project.path);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("no labellens.config.json");
    expect(result.stderr).not.toContain("unknown command '--local-only'");
  });
});
