import { type LabellensConfig, validateConfigSchema } from "./config.ts";

/**
 * In-memory migration of legacy `signals.lowConfidenceThreshold` to the
 * nested `signals.lowConfidence.default` shape. Nested shape wins when both
 * are present. The legacy key is stripped so downstream code only ever sees
 * one form; persisted writes (e.g. `labellens config set`) emit the nested
 * shape too.
 */
export function normalizeSignalsConfig(config: LabellensConfig): LabellensConfig {
  const signals = config.signals;
  if (!signals) return config;
  const { lowConfidence, lowConfidenceThreshold, ...rest } =
    signals as LabellensConfig["signals"] & {
      lowConfidenceThreshold?: number;
    };
  if (lowConfidence === undefined && lowConfidenceThreshold === undefined) return config;
  const next: LabellensConfig = {
    ...config,
    signals: {
      ...rest,
      ...(lowConfidence !== undefined
        ? { lowConfidence }
        : { lowConfidence: { default: lowConfidenceThreshold as number } }),
    },
  };
  return next;
}

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

/**
 * Parse + schema-validate a labellens config file. Throws `ConfigLoadError`
 * with one line per problem when the file doesn't match
 * `LabellensConfigSchema`. Callers print `.errors` and exit 2.
 *
 * `$schema` is preserved on the returned object (it's a valid optional field
 * on the schema) but has no runtime effect — it exists so editors can hover
 * fields for inline docs and external linters can pick up the same schema.
 */
export async function loadConfig(configPath: string): Promise<LabellensConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.file(configPath).text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigLoadError(`labellens: failed to parse ${configPath}: ${message}`, [message]);
  }
  const errors = validateConfigSchema(raw);
  if (errors.length > 0) {
    throw new ConfigLoadError(`labellens: invalid ${configPath}`, errors);
  }
  return normalizeSignalsConfig(raw as LabellensConfig);
}
