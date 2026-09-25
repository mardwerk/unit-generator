# CLI

This is today's TypeScript CLI. The planned Go CLI (`mardwerk-unit`) is described in [ARCHITECTURE.md](ARCHITECTURE.md#cli); command names change there (`character` becomes `research`, `--preset`/`--deliverable` become `--profile`).

Run `pnpm install` and `pnpm build` with Node.js 24 or newer, then `pnpm cli <command> <input> [options]`. `pnpm cli --help` lists everything.

## Commands

| Command | Input → output | Model calls |
| --- | --- | --- |
| `character NAME` | Character name → prepared request with retrieved sources and the default rules | none (network lookup) |
| `generate NAME` | `character` + `draft` + `check` → checked artifact | 1–4 |
| `prepare REQUEST.json` | Request file → prepared request with its input hash | none (URLs are fetched) |
| `draft PREPARED.json` | → draft | 1–4 |
| `check DRAFT.json` | → checked artifact with deterministic findings | none |
| `review CHECKED.json` | → Result with a model review | 1 |
| `author REQUEST.json` | `prepare` + `draft` + `check` + `review` → Result | 2–5 |
| `render ARTIFACT.json` | → Markdown unit sheet; `--details` adds evidence and findings | none |
| `build ARTIFACT.json --tiers 5,2,0` | → resolved stats and costs for one purchased build | none |
| `definition` | → the bundled mechanics Definition | none |

Numerical drafting makes a planning call and a mechanics call, each allowed one repair by default (`--repairs 0|1|2`). Qualitative drafting (`--deliverable concept`) makes one call with no repair.

## Options

| Option | Applies to | Meaning |
| --- | --- | --- |
| `-o, --output FILE` | all | Write a new file; an existing file is never replaced |
| `--provider openrouter\|codex` | model commands | OpenRouter (default) or an existing Codex login |
| `--model NAME`, `--reasoning LEVEL`, `--timeout SECONDS` | model commands | Override model, reasoning (`low`, `medium`, `high`, plus `none` for OpenRouter) and per-call timeout (OpenRouter 120 s, Codex 600 s) |
| `--codex FILE` | model commands | Codex executable |
| `--choice ID` | `character`, `generate` | Pick a character when the name is ambiguous |
| `--deliverable concept\|mechanics` | `character`, `generate`, `prepare`, `author` | Qualitative or numerical output |
| `--preset btd6` | `prepare`, `author` | Apply the bundled numerical rules to your own request |
| `--previous FILE --feedback TEXT` | `prepare`, `author` | Revise an earlier Result |
| `--operation generate\|redesign\|prose-edit\|adapt` | `prepare`, `author` | Kind of revision; `adapt` is required when the rules changed |
| `--repairs 0\|1\|2` | `draft`, `author`, `generate` | Repair budget per numerical stage |
| `--evidence-dir DIR` | `draft`, `author`, `generate`, `review` | Keep exact model inputs and raw outputs |
| `--tiers A,B,C` | `build` | Purchased tiers, each 0–5 |
| `--details` | `render` | Expanded report |

## Examples

```sh
pnpm cli generate "Monkey D. Luffy" -o data/runs/luffy.json
pnpm cli render data/runs/luffy.json -o data/runs/luffy.md
pnpm cli review data/runs/luffy.json -o data/runs/luffy-reviewed.json

pnpm cli prepare data/reference/wizard-monkey.concept.request.json -o data/runs/wizard.prepared.json
pnpm cli draft data/runs/wizard.prepared.json -o data/runs/wizard.draft.json
pnpm cli check data/runs/wizard.draft.json -o data/runs/wizard.checked.json

pnpm cli author REQUEST.json --previous data/runs/v1.json --feedback "Give path 2 a clearer support role." -o data/runs/v2.json
```

## Request files

A request file has `schemaVersion: "1"`, a `task`, the character (`name`, `work`, `scope`) and a list of documents. Each document has an `id`, a `kind` (`source`, `rules` or `decisions`) and exactly one of `text`, `file` or `url`; `sourceUrl` attributes pasted text. File paths resolve relative to the request file. `constraints` lists confirmed decisions by ID. Examples are in [data/reference](../data/reference); [dart-monkey.source-file.request.json](../data/reference/dart-monkey.source-file.request.json) is a template for your own text. A request without `mechanicsDefinition` or `--preset btd6` takes the older prose route and produces no numerical mechanics, so `build` cannot use it.

## Output and exit codes

Without `-o`, stdout carries the complete JSON artifact (Markdown for `render`) and stderr carries diagnostics. Exit `0` means the operation completed; findings can still fail. Any nonzero exit means execution failed and no output file was written. Ctrl+C cancels.

Qualitative model runs currently record evidence in `data/runs/evidence` even without `--evidence-dir`; the Go CLI will record evidence only when asked.

Configuration: existing environment variables win over `.env` in the working directory; command-line options win over both. Credentials never enter artifacts. Agents must follow [OPENROUTER.md](OPENROUTER.md).
