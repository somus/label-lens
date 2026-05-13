# Test fixtures

Five JSONL files shared by unit, integration, and perf tests. All five are committed; the four generated fixtures are byte-reproducible from `scripts/gen-fixtures.ts` against fixed seeds.

| File | Records | Source | Seed | Purpose |
| --- | ---: | --- | ---: | --- |
| `tiny.jsonl` | 10 | hand-written | — | Walking-skeleton + per-slice unit tests. Covers every schema variation in one file. |
| `small.jsonl` | 1,000 | generator | 1 | Integration tests. Two prediction sources + ~5% imported `issues[]`. |
| `medium.jsonl` | 10,000 | generator | 2 | Canonical perf target (PRD §16.1). |
| `large.jsonl` | 50,000 | generator | 3 | Upper-bound perf target (PRD §16.1). |
| `boundary.jsonl` | 450 | generator | 1 | 3 docs × 150 lines. Exercises `task: "boundary"` end-to-end via `meta.document_id` + `context_before` / `context_after`. |

## Schema variations covered by `tiny.jsonl`

- Missing `confidence` (record 9).
- Missing `context_before` / `context_after` (records 1–7, 9).
- Multi-prediction `predictions[]` (records 7, 10).
- Imported `issues[]` (record 10).
- Legacy flat shape (`prediction` / `confidence` / `source`) alongside `predictions[]`.

## Generator

```
bun scripts/gen-fixtures.ts small         # one target
bun scripts/gen-fixtures.ts --all         # all four generated fixtures
bun scripts/gen-fixtures.ts boundary --out /tmp/out.jsonl
```

The generator lives in `scripts/fixtures/generator.ts` and is shared with `scripts/seed-dev.ts` (dev playground). Deterministic mulberry32 PRNG; bit-stable across Bun versions.

## Source-accuracy distribution (small/medium/large)

- `llm:gpt-4` — on every record, numeric confidence, ~85% match against hidden truth label.
- `regex.simple` — on ~40% of records, no confidence, ~55% match.
- `model_v1` — on ~20% of records, numeric confidence, always matches truth.

## What asserts what

`test/unit/fixtures.test.ts` locks all invariants: schema variations, source distribution, accuracy windows, ~5% issues passthrough, exact record counts, byte-for-byte reproducibility, and boundary ingest under `task: "boundary"`. Run it after touching any fixture or the generator.
