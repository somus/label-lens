## How-to: edit `labellens.config.json` with autocomplete

`labellens init` writes a `$schema` URL into every project config:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json",
  "task": "classification",
  ...
}
```

Editors that honour the `$schema` field will pull the JSON Schema from that URL and offer field-name autocomplete, hover descriptions, and inline validation — no plugin or extra config needed.

LabelLens itself runs the same schema at startup (`Value.Check`); a malformed config exits 2 with the field path + reason. The schema is the single source of truth — `src/config/config.ts` generates it via `bun run schema`.

## VS Code / Cursor

Out of the box. The bundled JSON language service reads `$schema` automatically. Open `labellens.config.json` → start typing inside the top-level object → autocomplete + hover descriptions appear.

If you maintain configs without a `$schema` field (legacy projects), add a workspace mapping:

```jsonc
// .vscode/settings.json
{
  "json.schemas": [
    {
      "fileMatch": ["labellens.config.json"],
      "url": "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json"
    }
  ]
}
```

## Helix

Configure `jsonls` in `~/.config/helix/languages.toml`:

```toml
[language-server.jsonls.config.json.schemas]
"labellens.config.json" = "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json"
```

Restart Helix; open `labellens.config.json`; `<space>k` shows hover docs, `<C-x>` triggers completion.

## Neovim

With `nvim-lspconfig` + the [SchemaStore](https://github.com/b0o/schemastore.nvim) plugin, point `jsonls` at the schema for matching files:

```lua
require("lspconfig").jsonls.setup({
  settings = {
    json = {
      schemas = {
        {
          fileMatch = { "labellens.config.json" },
          url = "https://raw.githubusercontent.com/somus/label-lens/main/schema/labellens.config.schema.json",
        },
      },
      validate = { enable = true },
    },
  },
})
```

## JetBrains (IntelliJ, WebStorm, PyCharm)

Honours `$schema` automatically. If the file is named something other than `labellens.config.json`, register the mapping under **Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings**.

## Validate from the shell

```sh
npx -y ajv-cli@5 validate \
  --spec=draft2020 \
  -s ./schema/labellens.config.schema.json \
  -d ./labellens.config.json
```

Useful when scripting (CI, pre-commit). LabelLens runs the equivalent check at startup, so the shell call is only needed when editing the config without launching the TUI.

## Pinning a specific version

The URL in `$schema` tracks `main`. To pin to a release tag, replace `main` with the tag in the URL — useful when freezing a project against an older LabelLens version:

```jsonc
"$schema": "https://raw.githubusercontent.com/somus/label-lens/v0.1.2/schema/labellens.config.schema.json"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No autocomplete in VS Code | Workspace trust prompt blocked the fetch | Click "Trust" on the URL bar; reload window. |
| Stale completions after editing config | Editor cached the schema | Restart the language server (VS Code: `Developer: Restart Extension Host`). |
| `labellens` exits 2 on launch but VS Code shows no errors | Editor schema is older than the binary | Run `bun run schema` from the LabelLens checkout to regenerate, then point `$schema` at your local file path (`file:///path/to/schema/labellens.config.schema.json`). |
| Schema URL returns 404 | Repo moved or the file was renamed | Check the URL in [`docs/reference/config.md`](../reference/config.md). |
