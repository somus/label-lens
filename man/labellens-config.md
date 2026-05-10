# labellens-config(1)

LabelLens reads `labellens.config.json` from the project root.

```json
{
  "task": "classification",
  "labels": ["food", "travel", "other"],
  "guidelines": "./guidelines.md",
  "input": {
    "path": "./data.jsonl",
    "format": "jsonl",
    "fields": {
      "id": "id",
      "text": "text",
      "prediction": "predicted_label",
      "confidence": "confidence"
    }
  },
  "output": { "path": "./reviewed.jsonl", "format": "jsonl" }
}
```

## guidelines

A path to a Markdown file or an inline Markdown string (recognised by a
leading `#`). Open with `g g` or `:guidelines`.

## display

- `color`: `auto | truecolor | 256 | 16 | mono`
- `banding`: `auto | on | off`
- `theme`: `auto | light | dark`
- `candidatePin`: 0.05–0.95 (viewport pin position)
- `layout`: `auto | stack | split`

## boundary task

For boundary annotation, set `task: "boundary"` and:

```json
"boundary": { "documentField": "document_id", "contextLines": 3 }
```
