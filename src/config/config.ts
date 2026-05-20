import { type Static, type TSchema, Type } from "@earendil-works/pi-ai";
import { Value } from "typebox/value";
import type { FieldMap } from "./inference.ts";

/**
 * TypeBox is the source of truth for `labellens.config.json`. `Static<>`
 * derives the TS type; `Value.Check` validates at load; `scripts/build-schema.ts`
 * stringifies the schema into `schema/labellens.config.schema.json` for editor
 * autocomplete + external tooling.
 *
 * Keep `description` on every field — those strings surface as hover-help in
 * VS Code / Cursor and in `docs/reference/config.md`. Reserved fields like
 * `glyph` are documented here too; they round-trip through config but have no
 * runtime effect yet.
 */
const SignalKind = Type.Union(
  [
    Type.Literal("lowConfidence"),
    Type.Literal("disagreement"),
    Type.Literal("duplicate"),
    Type.Literal("flagged"),
  ],
  { description: "Identifier for a prioritization signal." },
);

const LabelConfigEntrySchema = Type.Union(
  [
    Type.String({ description: "Label value. Sugar for { name: <string> }." }),
    Type.Object({
      name: Type.String({ description: "Label value stored on reviews.final_label." }),
      key: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 1,
          description: "Per-label keyboard accelerator. Must not collide with built-in bindings.",
        }),
      ),
      color: Type.Optional(
        Type.String({ description: "Reserved for label tinting in the chip rail." }),
      ),
      glyph: Type.Optional(
        Type.String({ description: "Reserved for boundary-task per-label glyphs." }),
      ),
    }),
  ],
  { description: "A configured label." },
);

const FieldMapSchema = Type.Object(
  {
    text: Type.String({ description: "JSONL key holding the candidate text (required)." }),
    prediction: Type.Optional(
      Type.String({ description: "JSONL key for the model's prediction." }),
    ),
    confidence: Type.Optional(
      Type.String({ description: "JSONL key for prediction confidence (0..1)." }),
    ),
    source: Type.Optional(Type.String({ description: "JSONL key tagging the prediction source." })),
    context_before: Type.Optional(
      Type.String({ description: "JSONL key for line above the candidate." }),
    ),
    context_after: Type.Optional(
      Type.String({ description: "JSONL key for line below the candidate." }),
    ),
    id: Type.Optional(Type.String({ description: "JSONL key for a stable record id." })),
  },
  { description: "Maps logical fields onto the actual JSONL keys." },
);

const DisplayConfigSchema = Type.Object(
  {
    color: Type.Optional(
      Type.Union(
        [
          Type.Literal("auto"),
          Type.Literal("truecolor"),
          Type.Literal("256"),
          Type.Literal("16"),
          Type.Literal("mono"),
        ],
        { description: "Force a capability level. Auto reads $COLORTERM / $TERM / $NO_COLOR." },
      ),
    ),
    banding: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("on"), Type.Literal("off")], {
        description: "Banded background per record group. Forced off at 16 / mono.",
      }),
    ),
    theme: Type.Optional(
      Type.Union([Type.Literal("light"), Type.Literal("dark"), Type.Literal("auto")], {
        description: "Light / dark palette. Auto probes the terminal via OSC 11.",
      }),
    ),
    candidatePin: Type.Optional(
      Type.Number({
        minimum: 0.05,
        maximum: 0.95,
        description: "Viewport pin position (fraction of subject height).",
      }),
    ),
    layout: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("stack"), Type.Literal("split")], {
        description: "Stack or split layout. Auto picks split at ≥ 160 cols.",
      }),
    ),
    motion: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("on"), Type.Literal("off")], {
        description: "Fades, flashes, progress tweens. Forced off at 16 / mono.",
      }),
    ),
    sidebar: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("on"), Type.Literal("off")], {
        description: "Right-column chrome. Auto shows at ≥ 120 cols on truecolor / 256.",
      }),
    ),
    queuePreview: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("on"), Type.Literal("off")], {
        description: "Left-column upcoming-record rail. Auto shows at ≥ 200 cols.",
      }),
    ),
    labelChip: Type.Optional(
      Type.Union([Type.Literal("configured"), Type.Literal("both")], {
        description: "Chip rail format. `configured` shows [k] or [N]; `both` shows [N/k].",
      }),
    ),
  },
  { description: "Display + terminal-capability overrides." },
);

const NavigationConfigSchema = Type.Object(
  {
    smartNext: Type.Optional(
      Type.Boolean({
        description:
          "When true, j/k walks a signal-weighted smart-pending cursor on the pending queue.",
      }),
    ),
    rerankInterval: Type.Optional(
      Type.Integer({
        minimum: 1,
        description:
          "Commit decisions between smart-pending weight refreshes. Session-local active learning re-weights built-in Issue types every N committed decisions. Default 25.",
      }),
    ),
    rerankColdStart: Type.Optional(
      Type.Integer({
        minimum: 0,
        description:
          "Minimum committed decisions before learned smart-pending weights replace the default 1.0 multipliers. Default 50.",
      }),
    ),
  },
  { description: "Navigation-mode toggles." },
);

const BoundaryConfigSchema = Type.Object(
  {
    documentField: Type.String({
      description: "JSONL field name that groups records into documents.",
    }),
    contextLines: Type.Integer({
      minimum: 0,
      description: "Neighbour lines shown above and below the focused row.",
    }),
  },
  { description: "Boundary-task specific config." },
);

const ClassificationConfigSchema = Type.Object(
  {
    previewLines: Type.Integer({
      minimum: 0,
      description: "Queue-sibling rows shown above/below the focused record.",
    }),
  },
  { description: "Classification-task specific config." },
);

const AssistantConfigSchema = Type.Object(
  {
    enabled: Type.Boolean({
      description: "Master switch. When false, pressing `i` opens the configure overlay.",
    }),
    provider: Type.Optional(
      Type.String({
        description: "pi-ai provider id. Known: anthropic, openai, google, groq, ollama.",
      }),
    ),
    model: Type.Optional(
      Type.String({ description: "Provider-specific model id (e.g. claude-sonnet-4-5)." }),
    ),
    apiKeyEnvVar: Type.Optional(
      Type.String({
        description: "Env var name to read the API key from at runtime. Never persisted in config.",
      }),
    ),
    ollamaUrl: Type.Optional(
      Type.String({
        description: "Base URL for the Ollama provider (e.g. http://localhost:11434/v1).",
      }),
    ),
    privacyAcknowledged: Type.Optional(
      Type.Boolean({
        description: "First remote call is blocked until this is true.",
      }),
    ),
    systemPromptAppend: Type.Optional(
      Type.String({
        description:
          "Extra instructions appended to the system prompt for every assistant query (e.g. domain rules). Cache is invalidated when this changes.",
      }),
    ),
  },
  { description: "Optional LLM assistant (PRD §10.5). Off by default." },
);

const LowConfidenceConfigSchema = Type.Object(
  {
    default: Type.Number({
      exclusiveMinimum: 0,
      maximum: 1,
      description:
        "Default confidence under which the `low_confidence` signal fires. Validated as 0 < default ≤ 1.",
    }),
    bySource: Type.Optional(
      Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0, maximum: 1 }), {
        description:
          "Per-Source threshold overrides. Keys are exact Prediction sources or `*`-globs (e.g. `regex.*`, `model-*-prod`). Resolution: exact match wins, else most-specific glob (longest non-wildcard prefix), else config order, else default.",
      }),
    ),
  },
  { description: "Low-confidence threshold tuning." },
);

const SignalsConfigSchema = Type.Object(
  {
    lowConfidence: Type.Optional(LowConfidenceConfigSchema),
    /**
     * Legacy v0.11 shape. Accepted on read for backwards compatibility and
     * migrated to `lowConfidence.default` by `loadConfig` / persisted-write
     * paths. Do not author new configs against this field — `bun run schema`
     * still emits it as optional so older configs validate.
     */
    lowConfidenceThreshold: Type.Optional(
      Type.Number({
        exclusiveMinimum: 0,
        maximum: 1,
        description:
          "Deprecated alias for `lowConfidence.default`. Migrated on load and on the first persisted write.",
      }),
    ),
    enable: Type.Optional(
      Type.Array(SignalKind, {
        description: "Subset of signals to compute. Omit to compute all four.",
      }),
    ),
  },
  { description: "Prioritization signal tuning." },
);

const OutputFieldOverridesSchema = Type.Object(
  {
    id: Type.Optional(Type.String({ description: "Rename the `id` column on export." })),
    text: Type.Optional(Type.String({ description: "Rename the `text` column on export." })),
    label: Type.Optional(Type.String({ description: "Rename the `label` column on export." })),
    reviewed_at: Type.Optional(
      Type.String({ description: "Rename the `reviewed_at` column on export." }),
    ),
    document_id: Type.Optional(
      Type.String({ description: "Rename the `document_id` column on boundary exports." }),
    ),
  },
  { description: "Per-column renames applied during export." },
);

const OutputConfigSchema = Type.Object(
  {
    path: Type.String({ description: "Destination for `labellens export`." }),
    format: Type.Union([Type.Literal("jsonl"), Type.Literal("csv")], {
      description: "Default format when `labellens export` runs without a positional argument.",
    }),
    includeRejected: Type.Optional(
      Type.Boolean({
        description: "Include rejected records (label:null) in default exports.",
      }),
    ),
    includeSkipped: Type.Optional(
      Type.Boolean({
        description: "Include skipped records (label:null) in default exports.",
      }),
    ),
    csvMultiLabelSeparator: Type.Optional(
      Type.String({
        minLength: 1,
        description: "Separator used when joining multi-label arrays in CSV exports. Default ';'.",
      }),
    ),
    fieldOverrides: Type.Optional(OutputFieldOverridesSchema),
  },
  { description: "Default export behaviour. CLI flags still override these." },
);

const NotesConfigSchema = Type.Object(
  {
    presets: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "Quick-attach phrases offered in the note overlay (digit accelerators). Cuts repetitive typing.",
      }),
    ),
  },
  { description: "Note-overlay config." },
);

const BindingValueSchema = Type.Union(
  [Type.String({ minLength: 1 }), Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })],
  {
    description:
      "A keybinding string (e.g. `y`, `ctrl+x`, `g d`) or an array of such strings to bind several keys to the same command.",
  },
);

const PresetMapSchema = Type.Record(Type.String(), BindingValueSchema, {
  description: "Map of command name to binding string(s).",
});

const KeysConfigSchema = Type.Object(
  {
    preset: Type.Optional(
      Type.String({
        description:
          "Which preset to load: `simple` (default), `vim`, or the name of a custom preset under `keys.presets`.",
      }),
    ),
    overrides: Type.Optional(PresetMapSchema),
    presets: Type.Optional(
      Type.Record(Type.String(), PresetMapSchema, {
        description:
          "Project-defined presets. Each inherits from the `vim` baseline for unspecified commands. Selected by name via `keys.preset`.",
      }),
    ),
  },
  {
    additionalProperties: false,
    description:
      "Keybinding configuration. Use `preset` to pick built-in or custom mapping; `overrides` to retune individual commands.",
  },
);

export const LabellensConfigSchema = Type.Object(
  {
    $schema: Type.Optional(Type.String({ description: "URI of this config's JSON Schema." })),
    task: Type.Union(
      [Type.Literal("classification"), Type.Literal("boundary"), Type.Literal("multi-label")],
      {
        description: "Task kind.",
      },
    ),
    labels: Type.Array(LabelConfigEntrySchema, {
      minItems: 1,
      description: "Configured label set. Used for review, queues, and exports.",
    }),
    guidelines: Type.Optional(
      Type.String({
        description: "Inline markdown or path to a markdown file. Rendered in the guidelines view.",
      }),
    ),
    boundary: Type.Optional(BoundaryConfigSchema),
    classification: Type.Optional(ClassificationConfigSchema),
    input: Type.Object(
      {
        path: Type.String({ description: "Source JSONL. Resolved relative to the config file." }),
        format: Type.Literal("jsonl", { description: "Only `jsonl` is supported in MVP." }),
        fields: FieldMapSchema,
      },
      { description: "Source dataset + field mapping." },
    ),
    output: OutputConfigSchema,
    display: Type.Optional(DisplayConfigSchema),
    navigation: Type.Optional(NavigationConfigSchema),
    assistant: Type.Optional(AssistantConfigSchema),
    signals: Type.Optional(SignalsConfigSchema),
    notes: Type.Optional(NotesConfigSchema),
    keys: Type.Optional(KeysConfigSchema),
  },
  {
    $id: "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json",
    title: "LabelLens project config",
    description: "Configuration for labellens, written next to your dataset by `labellens init`.",
  },
);

export type LabellensConfig = Static<typeof LabellensConfigSchema>;
export type LabelConfigEntry = Static<typeof LabelConfigEntrySchema>;
export type DisplayConfig = Static<typeof DisplayConfigSchema>;
export type NavigationConfig = Static<typeof NavigationConfigSchema>;
export type BoundaryConfig = Static<typeof BoundaryConfigSchema>;
export type ClassificationConfig = Static<typeof ClassificationConfigSchema>;
export type AssistantConfig = Static<typeof AssistantConfigSchema>;
export type SignalsConfig = Static<typeof SignalsConfigSchema>;
export type LowConfidenceConfig = Static<typeof LowConfidenceConfigSchema>;
export type OutputConfig = Static<typeof OutputConfigSchema>;
export type OutputFieldOverrides = Static<typeof OutputFieldOverridesSchema>;
export type NotesConfig = Static<typeof NotesConfigSchema>;
export type KeysConfig = Static<typeof KeysConfigSchema>;
export type SignalKindName = Static<typeof SignalKind>;

export const CONFIG_SCHEMA_URL =
  "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json";

/**
 * Validate a freshly-parsed config against the TypeBox schema. Returns a list
 * of human-readable error strings; empty array means valid.
 */
export function validateConfigSchema(raw: unknown): string[] {
  if (Value.Check(LabellensConfigSchema as TSchema, raw)) return [];
  const errors: string[] = [];
  let seen = 0;
  for (const e of Value.Errors(LabellensConfigSchema as TSchema, raw)) {
    const path = e.instancePath === "" ? "(root)" : e.instancePath;
    errors.push(`${path}: ${e.message}`);
    seen++;
    if (seen >= 20) {
      errors.push("…(further errors suppressed)");
      break;
    }
  }
  return errors;
}

const DEFAULT_EXPORT_COLUMNS = ["id", "text", "label", "reviewed_at", "document_id"] as const;

/**
 * Reject `output.fieldOverrides` configurations that would produce two columns
 * with the same JSON / CSV header. Two overrides mapped to the same name
 * silently drop the earlier column (last-write-wins on the JSONL object); an
 * override that collides with a *non-overridden* default name does the same.
 * Returns null when clean.
 */
export function validateFieldOverrides(config: LabellensConfig): string | null {
  const overrides = config.output.fieldOverrides;
  if (!overrides) return null;
  const claimed = new Map<string, string>(); // emitted-name -> source column
  const errors: string[] = [];
  for (const column of DEFAULT_EXPORT_COLUMNS) {
    const renamed = overrides[column as keyof typeof overrides];
    const emitted = renamed ?? column;
    const prior = claimed.get(emitted);
    if (prior !== undefined) {
      errors.push(
        `output.fieldOverrides: '${column}' and '${prior}' both map to '${emitted}' on export`,
      );
    }
    claimed.set(emitted, column);
  }
  return errors.length === 0 ? null : errors.join("\n");
}

/**
 * Returns null when the (`--local-only`, `assistant.provider`) combination is
 * valid, else a short error message. Caller logs + exits. Ollama is the only
 * provider that doesn't leave the machine.
 */
export function validateLocalOnly(config: LabellensConfig, localOnly: boolean): string | null {
  if (!localOnly) return null;
  const provider = config.assistant?.provider;
  if (!provider) return null;
  if (provider === "ollama") return null;
  return `--local-only set but assistant.provider is '${provider}' (remote). Use 'ollama' or omit assistant config.`;
}

export function defaultConfig(args: {
  inputPath: string;
  fields: FieldMap;
  labels?: string[];
  outputPath?: string;
  task?: "classification" | "boundary";
}): LabellensConfig {
  const labels = args.labels && args.labels.length > 0 ? [...args.labels] : ["other"];
  const task = args.task ?? "classification";
  return {
    $schema: CONFIG_SCHEMA_URL,
    task,
    labels,
    ...(task === "boundary"
      ? { boundary: { documentField: "document_id", contextLines: 3 } }
      : { classification: { previewLines: 2 } }),
    input: {
      path: args.inputPath,
      format: "jsonl",
      fields: args.fields,
    },
    output: {
      path: args.outputPath ?? "./reviewed.jsonl",
      format: "jsonl",
    },
    display: {
      color: "auto",
      banding: "auto",
      theme: "auto",
      candidatePin: 0.4,
      layout: "auto",
      motion: "auto",
      sidebar: "auto",
      queuePreview: "auto",
      labelChip: "configured",
    },
    navigation: {
      smartNext: false,
    },
    assistant: { enabled: false },
    keys: { preset: "simple" },
  };
}

export function labelName(entry: LabelConfigEntry): string {
  return typeof entry === "string" ? entry : entry.name;
}

export function labelKey(entry: LabelConfigEntry): string | null {
  if (typeof entry === "string") return null;
  return entry.key ?? null;
}

/**
 * Validate `config.labels[].key` against the reserved review-scope key set
 * and against itself (duplicates across labels). Aggregates all violations
 * so the reviewer fixes them in one pass. Returns `null` when clean.
 */
export function validateLabelKeys(
  config: LabellensConfig,
  reservedKeys: Set<string>,
): string | null {
  const errors: string[] = [];
  const byKey = new Map<string, string[]>();
  for (const entry of config.labels) {
    const key = labelKey(entry);
    if (key === null) continue;
    const name = labelName(entry);
    if (reservedKeys.has(key)) {
      errors.push(`label '${name}' uses key '${key}' which is reserved by a built-in command`);
    }
    const seen = byKey.get(key) ?? [];
    seen.push(name);
    byKey.set(key, seen);
  }
  for (const [key, names] of byKey) {
    if (names.length > 1) {
      errors.push(`key '${key}' is configured by multiple labels: ${names.join(", ")}`);
    }
  }
  if (errors.length === 0) return null;
  return errors.join("\n");
}
