# Reference: keybindings

LabelLens scopes its keymap by screen / overlay. Press `?` in any scope for the live, filterable version of this table — the in-app help reads the same registry.

<a href="../media/notes-undo-history.webm">
  <img src="../media/notes-undo-history.gif" alt="Adding a note, making decisions, and undoing through review history" width="800">
</a>

## Review scope

The default scope when no overlay or screen is open.

### Decisions

| Key | Action | Notes |
|---|---|---|
| `a` | Accept the prediction | Status `accepted`. Refuses with a flash if the record has no prediction. |
| `r` | Open relabel picker | Fuzzy-search the full label set. `Enter` commits. `Esc` cancels. |
| `1`–`9` | Relabel by position | Maps to `config.labels[N-1]`. If matched label = prediction, status is `accepted`; else `relabeled`. |
| `<key>` | Per-label key accelerator | Configured via `config.labels[].key`. Same effect as the digit shortcut for that label. |
| `x` | Reject | Status `rejected`; `final_label` is `null`, `prev_label` is the prior prediction. |
| `s` | Skip | Status `skipped`. Excluded from `pending` queue per ADR 0003. Own queue. |
| `m` | Toggle the `marked` tag | Additive — orthogonal to review state. Tagged records appear in the `marked` queue. |
| `n` | Open note prompt | Writes to `reviews.note`. Pre-fills on re-edit. |
| `u` | Undo | Inserts a compensating review row per PRD §11.4. Current state reads from `effective_reviews` (ADR 0007). |
| `i` | Open assistant | First press with `assistant.enabled = false` routes through the configure overlay. |

### Navigation

| Key | Action | Notes |
|---|---|---|
| `j` | Next record | Walks the active cursor. With `navigation.smartNext`, opens the signal-weighted `smart-pending` cursor when the queue is `pending`. |
| `k` | Previous record | Same. |
| `shift+j` | Next in document order | Escape hatch when `smartNext` is on. Plain document index. |
| `shift+k` | Previous in document order | Same. |
| `[` | Previous queue | Cycles built-in queues. Cursors are memoised so re-entering resumes position. |
| `]` | Next queue | Same. |

### Surfaces

| Key | Action |
|---|---|
| `:` | Command palette |
| `?` | Help overlay (contextual; lists every binding for the active scope) |
| `t` | Stats overlay |
| `g d` | Document view (boundary task) |
| `g g` | Guidelines viewer |
| `Q` (`shift+q`) | Queue overlay |
| `q` | Quit |

## Relabel picker (`r`)

| Key | Action |
|---|---|
| `1`–`9` | Pick visible candidate at that position |
| `<key>` | Configured per-label key |
| `<char>` | Type into filter; candidates re-rank |
| `backspace` | Pop one filter char |
| `↑` / `↓` | Move highlight |
| `Enter` | Commit highlighted label |
| `Esc` | Cancel |

## Assistant overlay (`i`)

| Key | Action |
|---|---|
| `Tab` | Toggle reasoning expand |
| `Enter` | Commit recommended action (tagged `human+assistant` per ADR 0004) |
| `Esc` | Dismiss (still tags this record as viewed) |

## Configure-assistant overlay (first `i` press)

| Step | Keys |
|---|---|
| Pick provider | `1`–`9` selects from the list, `Enter` advances |
| Auth field | Type or paste your API key / Ollama URL. `Backspace` pops a char. `Enter` advances. |
| Privacy notice | `y` / `Enter` accept and commit. `n` / `Esc` cancel. |

Paste works via bracketed paste (`Cmd+V`, `Ctrl+Shift+V`). Control chars stripped automatically.

## Note overlay (`n`)

| Key | Action |
|---|---|
| `Enter` | Save note |
| `shift+Enter` | Insert newline |
| `Esc` | Cancel |

## Queue overlay (`Q`)

| Key | Action |
|---|---|
| `j` / `k` | Navigate queue list |
| `Enter` | Switch to selected queue |
| `Esc` | Cancel |

## Stats overlay (`t`)

| Key | Action |
|---|---|
| `j` / `k` | Navigate stat row |
| `Enter` | Drill into queue for the focused row |
| `Esc` | Close |

## Doc view (`g d`, boundary task)

| Key | Action |
|---|---|
| `j` / `k` | Scroll one row |
| `space` / `pgdn` | Scroll one page |
| `b` / `pgup` | Scroll one page back |
| `Esc` | Back to review |

## Help overlay (`?`)

| Key | Action |
|---|---|
| `↑` / `↓` | Scroll |
| `pgup` / `pgdn` | Page |
| `Esc` | Close |

## Guidelines viewer (`g g`)

| Key | Action |
|---|---|
| `↑` / `↓` | Scroll |
| `pgup` / `pgdn` | Page |
| `Esc` | Close |

Reviewers who prefer paginated reading can open guidelines in `less` via `:help guidelines`.

## Reserved keys (per-label `key` validation)

Any of these keys is rejected as a per-label `config.labels[].key` because it would shadow a built-in:

- Decisions: `a`, `x`, `s`, `r`, `m`, `n`, `u`, `i`
- Navigation: `j`, `k`
- Digits: `1`–`9`
- Surfaces: `:`, `?`, `t`, `q`
- Chord starters: `g`

The full set is derived from the command registry at startup (`reservedReviewKeys()` in `src/actions/registry.ts`), so if a new built-in command lands the validation auto-updates.
