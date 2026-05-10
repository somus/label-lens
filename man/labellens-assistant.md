# labellens-assistant(1)

The LLM assistant suggests a label and a short reason for the focused
record. Slice 11 will plug it in; for now the surface is a stub.

## Toggling

- `:assistant on` — enable
- `:assistant off` — disable

When enabled, viewing the assistant panel for a record marks the record's
source-of-truth as `human+assistant` for the next decision (ADR 0004).

## Configuration

Configured via `pi-ai`. Set the model and provider in the project
`labellens.config.json` under an `assistant` block (TBD in slice 11).
