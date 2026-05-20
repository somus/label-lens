# Reference: keybindings

LabelLens scopes its keymap by screen / overlay. Press `?` in any scope for the live, filterable version of this table — the in-app help reads the same registry.

LabelLens ships two built-in presets:

- **`simple`** (default) — arrow-key navigation, mnemonic action keys, no chords. Best for new reviewers.
- **`vim`** — j/k navigation, `[` / `]` queue cycle, `g d` / `g g` chords, `:` palette. Best for vim users.

Select via [`keys.preset`](./config.md#keys) in `labellens.config.json`. Custom presets are also configurable there. The tables below show every preset's binding for each command; bindings under `keys.overrides` win over the preset.

<a href="../media/notes-undo-history.webm">
  <img src="../media/notes-undo-history.gif" alt="Adding a note, making decisions, and undoing through review history" width="800">
</a>

## Review scope

The default scope when no overlay or screen is open.

### Decisions (same in both presets)

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

| Action | `simple` | `vim` |
|---|---|---|
| Next record | `↓` | `j` |
| Previous record | `↑` | `k` |
| Next in document order | `shift+↓` | `shift+j` |
| Previous in document order | `shift+↑` | `shift+k` |
| Next queue | `→` | `]` |
| Previous queue | `←` | `[` |

### Surfaces

| Action | `simple` | `vim` |
|---|---|---|
| Command palette | `ctrl+p` | `:` |
| Help overlay | `?` | `?` |
| Stats overlay | `t` | `t` |
| Document view (boundary task) | `d` | `g d` |
| Guidelines viewer | `g` | `g g` |
| Queue overlay | `shift+q` | `shift+q` |
| Quit | `q` | `q` |

## Relabel picker (`r`)

Under `task: "classification"` / `"boundary"` (single-label).

| Key | Action |
|---|---|
| `1`–`9` | Pick visible candidate at that position |
| `<key>` | Configured per-label key |
| `<char>` | Type into filter; candidates re-rank |
| `backspace` | Pop one filter char |
| `↑` / `↓` | Move highlight |
| `Enter` | Commit highlighted label |
| `Esc` | Cancel |

## Multi-label picker (`r` under `task: "multi-label"`)

| Key | Action |
|---|---|
| `Space` | Toggle highlighted label in / out of the selected set |
| `1`–`9` | Move highlight to that position (does not toggle / commit) |
| `<key>` | Configured per-label key — toggles that label |
| `<char>` | Type into filter; candidates re-rank |
| `backspace` | Pop one filter char |
| `↑` / `↓` | Move highlight |
| `Enter` | Commit current selected set (`accepted` if set equals primary Prediction, else `relabeled`). Empty selected set is refused — use `x` (reject) instead. |
| `Esc` | Cancel |

Under `task: "multi-label"`, the review-scope `1`–`9` and per-label-key shortcuts are intentionally disabled (they would otherwise commit a single label and violate the multi-label invariants). Use `r` to open the picker.

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

## Queue overlay (`shift+q`)

| Action | `simple` | `vim` |
|---|---|---|
| Navigate queue list | `↑` / `↓` | `j` / `k` (also `↑` / `↓`) |
| Switch to selected queue | `Enter` | `Enter` |
| Cancel | `Esc` | `Esc` |

## Stats overlay (`t`)

| Action | `simple` | `vim` |
|---|---|---|
| Navigate stat row | `↑` / `↓` | `j` / `k` (also `↑` / `↓`) |
| Drill into queue | `Enter` | `Enter` |
| Close | `Esc` | `Esc` |

## Doc view

| Action | `simple` | `vim` |
|---|---|---|
| Scroll one row | `↑` / `↓` | `j` / `k` (also `↑` / `↓`) |
| Scroll one page | `pgup` / `pgdn` | `ctrl+u` / `ctrl+d` (also `pgup` / `pgdn`) |
| Jump to top / bottom | `home` / `end` | `g g` / `shift+g` |
| Back to review | `Esc` or `q` | `Esc` or `q` |

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

A per-label `config.labels[].key` is rejected when it would shadow a built-in binding under the **active preset**. The reserved set is derived from the resolved command registry at startup (`reservedReviewKeys()` in `src/actions/registry.ts`), so switching presets or adding `keys.overrides` changes what's reserved without manual tracking.

Under `simple`, examples of reserved single-char keys:

- Decisions: `a`, `x`, `s`, `r`, `m`, `n`, `u`, `i`
- Digits: `1`–`9`
- Surfaces: `?`, `t`, `q`, `d`, `g`

Under `vim`, additionally: `j`, `k`, `:`, `[`, `]`, plus chord starter `g`.
