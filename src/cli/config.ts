import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type LabellensConfig, validateConfigSchema } from "../config/config.ts";
import { loadConfig } from "../config/load.ts";
import { recomputeLowConfidence } from "../signals/run.ts";
import { recordAppliedThresholds } from "../signals/startup.ts";
import { thresholdsFromConfig } from "../signals/threshold.ts";
import { openDb } from "../store/db.ts";

export class ConfigCliError extends Error {
  readonly code: number;
  constructor(message: string, code = 2) {
    super(message);
    this.code = code;
    this.name = "ConfigCliError";
  }
}

export type RunConfigCliArgs = {
  args: string[];
  cwd: string;
};

const SUPPORTED_KEYS = new Set(["signals.lowConfidence.default", "signals.lowConfidence.bySource"]);

export async function runConfigCli({ args, cwd }: RunConfigCliArgs): Promise<void> {
  const [verb, key, ...rest] = args;
  if (verb !== "set" && verb !== "unset") {
    throw new ConfigCliError(`usage: labellens config <set|unset> <key> <value>\n\n${usageText()}`);
  }
  if (!key) throw new ConfigCliError(`labellens config ${verb}: missing <key>`);
  if (!SUPPORTED_KEYS.has(key)) {
    throw new ConfigCliError(
      `labellens config: unsupported key '${key}'. Supported: ${[...SUPPORTED_KEYS].join(", ")}`,
    );
  }

  const configPath = resolve(cwd, "labellens.config.json");
  if (!existsSync(configPath)) {
    throw new ConfigCliError(
      `no labellens.config.json found in ${cwd}. Run 'labellens init <file.jsonl>' first.`,
    );
  }
  const config = await loadConfig(configPath);

  let next: LabellensConfig;
  if (key === "signals.lowConfidence.default") {
    if (verb !== "set") {
      throw new ConfigCliError(
        `labellens config unset: '${key}' is required — set it instead of unsetting`,
      );
    }
    const [valueStr] = rest;
    if (valueStr === undefined) {
      throw new ConfigCliError(`labellens config set ${key}: expected a number`);
    }
    next = applyDefault(config, parseThreshold(valueStr, key));
  } else {
    // signals.lowConfidence.bySource
    if (rest.length === 0) {
      throw new ConfigCliError(
        `labellens config ${verb} ${key}: expected one or more <pattern>${verb === "set" ? "=<value>" : ""} arguments`,
      );
    }
    next = applyBySource(config, verb, rest);
  }

  const errors = validateConfigSchema(next);
  if (errors.length > 0) {
    throw new ConfigCliError(`invalid resulting config:\n  ${errors.join("\n  ")}`);
  }

  await Bun.write(configPath, `${JSON.stringify(stripLegacyFields(next), null, 2)}\n`);

  const stateDbPath = join(dirname(configPath), ".labellens", "state.db");
  if (existsSync(stateDbPath)) {
    const db = openDb(stateDbPath);
    try {
      const thresholds = thresholdsFromConfig(next.signals?.lowConfidence);
      recomputeLowConfidence(db, thresholds);
      recordAppliedThresholds(db, thresholds);
    } finally {
      db.$client.close();
    }
  }
}

function parseThreshold(raw: string, key: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new ConfigCliError(`labellens config set ${key}: '${raw}' is not a number`);
  }
  if (!(n > 0 && n <= 1)) {
    throw new ConfigCliError(`labellens config set ${key}: ${raw} is out of range (0 < value ≤ 1)`);
  }
  return n;
}

function applyDefault(config: LabellensConfig, value: number): LabellensConfig {
  const signals = config.signals ?? {};
  return {
    ...config,
    signals: {
      ...signals,
      lowConfidence: {
        ...(signals.lowConfidence ?? {}),
        default: value,
      },
    },
  };
}

function applyBySource(
  config: LabellensConfig,
  verb: "set" | "unset",
  args: string[],
): LabellensConfig {
  const signals = config.signals ?? {};
  const existing = signals.lowConfidence ?? { default: 0.5 };
  const bySource: Record<string, number> = { ...(existing.bySource ?? {}) };

  if (verb === "set") {
    for (const arg of args) {
      const eq = arg.indexOf("=");
      if (eq < 0) {
        throw new ConfigCliError(
          `labellens config set signals.lowConfidence.bySource: expected <pattern>=<value>, got '${arg}'`,
        );
      }
      const pattern = arg.slice(0, eq);
      const value = parseThreshold(arg.slice(eq + 1), "signals.lowConfidence.bySource");
      if (pattern.length === 0) {
        throw new ConfigCliError(
          `labellens config set signals.lowConfidence.bySource: empty pattern in '${arg}'`,
        );
      }
      bySource[pattern] = value;
    }
  } else {
    for (const pattern of args) {
      delete bySource[pattern];
    }
  }

  return {
    ...config,
    signals: {
      ...signals,
      lowConfidence: {
        default: existing.default,
        ...(Object.keys(bySource).length > 0 ? { bySource } : {}),
      },
    },
  };
}

function stripLegacyFields(config: LabellensConfig): LabellensConfig {
  if (!config.signals) return config;
  const { lowConfidenceThreshold, ...rest } = config.signals as LabellensConfig["signals"] & {
    lowConfidenceThreshold?: number;
  };
  void lowConfidenceThreshold;
  return { ...config, signals: rest };
}

export function usageText(): string {
  return `usage:
  labellens config set signals.lowConfidence.default <value>
  labellens config set signals.lowConfidence.bySource <pattern>=<value> [...]
  labellens config unset signals.lowConfidence.bySource <pattern> [...]

Thresholds are validated as 0 < value ≤ 1.

On success:
  - labellens.config.json is rewritten in the nested shape (legacy
    'signals.lowConfidenceThreshold' is dropped).
  - The 'low_confidence' Issue rows are recomputed against the new
    thresholds; imported Issues and other computed signals are preserved.`;
}
