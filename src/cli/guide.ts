/**
 * `labellens guide` — print the quickstart tutorial to stdout. SSH-friendly
 * offline path; reviewers without web access on the host still get the
 * onboarding doc.
 *
 * GUIDE_TEXT is the tutorial body without the markdown frontmatter so it
 * reads cleanly in a terminal. Keep in sync with `docs/tutorial.md` —
 * a smoke test in test/unit verifies key phrases match.
 */
export const GUIDE_TEXT = `
LabelLens — quickstart tutorial

This is the same content as docs/tutorial.md, printed offline for SSH /
sandboxed environments. For the linkable web version:
  https://github.com/somus/label-lens/blob/main/docs/tutorial.md

============================================================
1. Get some data
============================================================

Save this as transactions.jsonl:

  {"text": "Lunch at Zomato", "prediction": "food", "confidence": 0.92, "source": "llm:gpt-4"}
  {"text": "Uber to airport", "prediction": "travel", "confidence": 0.88, "source": "llm:gpt-4"}
  {"text": "Netflix monthly", "prediction": "shopping", "confidence": 0.45, "source": "llm:gpt-4"}
  {"text": "Salary credit Apr", "prediction": "salary", "confidence": 0.99, "source": "llm:gpt-4"}
  {"text": "Electricity bill", "prediction": "utility", "confidence": 0.81, "source": "llm:gpt-4"}

============================================================
2. Initialise
============================================================

  labellens init transactions.jsonl

This infers the field map, writes labellens.config.json, and exits.
Open the file, tune the labels[] array if needed.

============================================================
3. Review
============================================================

  labellens

For each record:
  a       accept the prediction
  x       reject (prediction is wrong, no replacement)
  1..9    relabel to position N
  r       open relabel picker
  s       skip
  n       attach a note
  i       open LLM assistant (configures on first press)
  u       undo

Navigate without committing:
  j / k        next / previous record
  shift+j / k  document-order (escape hatch from smart-next)
  [ / ]        cycle queues

============================================================
4. Stats
============================================================

Press 't' to see corrections, by-source accuracy, reason
breakdowns, imported issue counts. 'Enter' on any row drills
into the corresponding queue.

============================================================
5. Queues
============================================================

  pending          untouched records (default)
  skipped          you put off (own queue, ADR 0003)
  low-confidence   model unsure, sorted ascending
  disagreements    multi-source records with conflicting labels
  flagged          records with imported issues
  marked           records you tagged with 'm'

Switch via [ / ] or Q (queue overlay).

============================================================
6. LLM assistant (optional)
============================================================

Press 'i'. First press opens the configure wizard:
  1. Pick provider (Anthropic, OpenAI, Google, Groq, Ollama).
  2. Paste API key or enter Ollama URL.
  3. Confirm privacy notice (only the current record + labels
     + guidelines is sent).

Subsequent presses stream a suggestion in the footer.
  Tab     expand reasoning
  Enter   commit suggested action (tagged human+assistant)
  Esc     dismiss (still tagged human+assistant per ADR 0004)

For air-gapped use: pick Ollama and launch with --local-only.

============================================================
7. Export
============================================================

  labellens export jsonl
  labellens export csv
  labellens export stats        # Markdown summary
  labellens export log          # full audit trail

============================================================
Where next
============================================================

Full reference docs:
  https://github.com/somus/label-lens/tree/main/docs/reference

How-to guides:
  https://github.com/somus/label-lens/tree/main/docs/how-to

Help in-app:
  ?       contextual help overlay (lists every binding)
  :       command palette
`;

export function printGuide(): void {
  process.stdout.write(GUIDE_TEXT);
}
