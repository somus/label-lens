# `source_of_truth = 'human+assistant'` whenever the assistant was viewed, not only when its suggestion was accepted

A review entry is tagged `human+assistant` whenever the assistant panel was rendered for that record before the action was committed — including the case where the reviewer read the suggestion, dismissed it with `Esc`, and then chose a different label. `human` is reserved for actions taken without ever opening the panel for that record.

The alternative — only flipping the tag when the reviewer literally accepts the assistant's suggestion via `Enter` — undercounts assistant influence and weakens the audit story for downstream "did an LLM contaminate this dataset?" reviews. Reading a suggestion is influence, even when the reviewer disagrees.

## Consequences

- Implementation tracks per-record assistant exposure for the duration of the focus session, not just the suggestion-accept gesture. Cleared when the reviewer moves to the next record.
- The data model stays a clean two-state enum (no third "human-saw-assistant" value). If downstream consumers want finer granularity later, the cached assistant query joined to the review entry's `reviewed_at` timestamp recovers the detail.
- This is the conservative choice for personal/small-ML training data where contamination claims matter; if the project ever needs the opposite default (e.g., to highlight only acted-on assistant influence), revisit by superseding this ADR rather than overloading the enum.
