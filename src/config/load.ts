import { type LabellensConfig, validateConfigSchema } from "./config.ts";

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
  return raw as LabellensConfig;
}
