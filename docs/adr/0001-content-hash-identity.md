# Record identity: content-hash by default, orphan-on-edit accepted for MVP

When an input record has no `id` field, LabelLens derives one as `sha256(normalize(text) + 0x1F + normalize(context_before) + 0x1F + normalize(context_after))`. Context is included in the hash so identical lines in different documents stay distinct (essential for the boundary task — the strongest wedge).

The consequence: editing source text after review begins produces a *new* record from LabelLens's perspective, and the prior review is preserved as an **orphan** rather than carried forward. This was accepted for MVP because the target user (solo dev cleaning noisy LLM/rule output) edits source text mid-review only rarely; smart text-edit merge is V1 work (see ADR 0002 for the related re-ingest behavior).

## Considered options

- **Require upstream `id`** — rejected: breaks the 2-minute activation goal; target users rarely pre-stamp IDs in JSONL.
- **Stamp UUID at first ingest, fuzzy rebind on edit** — rejected for MVP: pulls partial smart-merge logic forward, increases ingest complexity. Reconsider if user pain is real.
- **Hash text only, drop context from hash** — rejected: collisions on the boundary task (same line in different docs would alias).
- **Row-index ID** — rejected: silently corrupts review state when records are added/removed/reordered upstream.

## Consequences

- The re-ingest UI must surface orphans explicitly so users understand why a previously-reviewed record disappeared.
- Documentation and `init` output must say plainly: "fix source text BEFORE first review; edits after review begins lose those reviews unless you provide stable upstream IDs."
- Users who need durable identity across text edits add their own `id` field — this stays the documented escape hatch.
