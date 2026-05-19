/**
 * --help text shown by `labellens --help` / `labellens -h` and embedded into
 * the generated man page (scripts/build-man.ts reads HELP_TEXT). Follow
 * clig.dev's help-output checklist: short usage line, named flags, env vars,
 * exit codes, copy-paste examples.
 *
 * Keep this string the canonical source — README quickstart links here, the
 * man page reads here, the `labellens guide` subcommand prints the tutorial
 * separately.
 */
export const HELP_TEXT = `labellens — terminal-first review tool for noisy text training data

USAGE
  labellens                           open the review screen
  labellens init <file.jsonl>         bootstrap a new project
  labellens export [format] [flags]   export reviewed data
  labellens migrate --rename <from>:<to>
                                      rename a label across the DB
  labellens config set signals.lowConfidence.default <v>
                                      tune the low-confidence threshold
  labellens config set signals.lowConfidence.bySource <pat>=<v> [...]
                                      override threshold per Prediction source
  labellens guide                     print the quickstart tutorial
  labellens --version                 print version
  labellens --help                    print this help

EXPORT FORMATS
  jsonl      one row per reviewed record (default)
  csv        same shape, CSV-encoded
  stats      Markdown summary report
  review-log full audit trail (every review row)

GLOBAL FLAGS
  --local-only         refuse remote LLM providers. Launch aborts if the
                       configured assistant.provider isn't ollama.

ENVIRONMENT
  ANTHROPIC_API_KEY    Anthropic provider
  OPENAI_API_KEY       OpenAI provider
  GEMINI_API_KEY       Google provider (pi-ai canonical name)
  GROQ_API_KEY         Groq provider
  COLORTERM, TERM      capability detection (truecolor / 256 / 16 / mono)
  NO_COLOR             when set, forces mono palette
  LABELLENS_EXIT_DELAY_MS
                       post-quit terminal-drain delay in ms (default 30)

EXIT CODES
  0    success / clean shutdown
  1    generic runtime error
  2    user-visible config error: missing config, invalid labels[].key,
       --local-only vs remote provider mismatch, unknown labels in DB,
       unknown subcommand

EXAMPLES
  Bootstrap a project:
    labellens init transactions.jsonl
    $EDITOR labellens.config.json       # tune labels, guidelines

  Review with the assistant against local Ollama:
    ollama serve &
    labellens --local-only              # press 'i' to configure on first use

  Export reviewed data + a stats summary:
    labellens export jsonl
    labellens export stats --output review.md

  Rename a label after deciding to consolidate:
    labellens migrate --rename shopping:utility

  Tune the low-confidence threshold for a noisy regex source:
    labellens config set signals.lowConfidence.bySource "regex.*=0.3"

DOCS
  Tutorial:  https://github.com/somus/label-lens/blob/main/docs/tutorial.md
  Reference: https://github.com/somus/label-lens/tree/main/docs/reference
  How-to:    https://github.com/somus/label-lens/tree/main/docs/how-to

  Or print the tutorial offline:
    labellens guide
`;

export function printHelp(): void {
  process.stdout.write(HELP_TEXT);
}
