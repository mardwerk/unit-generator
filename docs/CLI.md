# CLI

Build the binary with Go 1.24 or newer, then run `mardwerk-unit <command> [input] [options]`. `mardwerk-unit --help` lists everything.

```sh
go build -o mardwerk-unit ./src/cli
```

## Commands

| Command | Input → output | Model calls |
| --- | --- | --- |
| `research NAME` | Character name → Sources (identity, retrieved documents, source images) | none (network lookup) |
| `prepare INPUT` | Sources (under `--profile`) or a request file → prepared request with its input hash | none (URLs are fetched) |
| `generate NAME\|SOURCES` | `research` if given a name, then `prepare` + `draft` + `check` → checked artifact | 2–6 |
| `author INPUT` | Sources or a request file → `prepare` + `draft` + `check` + `review` → Result | 3–7 |
| `edit RESULT --feedback TEXT` | A Result revised with the feedback, keeping its decisions and findings → new Result | 3–7 |
| `draft PREPARED` | → draft | 2–6 |
| `check DRAFT` | → checked artifact with deterministic findings | none |
| `review CHECKED` | → Result with a model review | 1 |
| `render ARTIFACT` | → Markdown unit sheet; `--details` adds purchases, usage, evidence and findings | none |
| `build ARTIFACT --tiers 5,2,0` | → resolved stats and costs for one purchased build | none |
| `inspect FILE` | → kind, validity and character of a saved file | none |
| `definition` | → the bundled mechanics Definition | none |
| `profiles` | → the bundled and saved Profiles | none |
| `library [list]`, `library save FILE`, `library load ID`, `library delete ID...` | the local library | none |
| `serve` | the local web app ([LAB.md](LAB.md)) | per request |

Drafting makes a planning call and a mechanics call, each allowed one repair by default (`--repairs 0|1|2`).

## Options

| Option | Applies to | Meaning |
| --- | --- | --- |
| `-o, --output FILE` | all but `serve` | Write a new file; an existing file is never replaced |
| `--profile ID` | `prepare`, `generate`, `author` | The Profile to prepare under (default: the bundled `default`) |
| `--profiles DIR` | `prepare`, `generate`, `author`, `profiles`, `serve` | Saved Profiles (default `data/profiles`) |
| `--library DIR` | `library`, `serve` | Library folder (default `data/runs/library`) |
| `--provider openrouter\|codex` | model commands, `serve` | OpenRouter (default) or an existing Codex login |
| `--model NAME`, `--reasoning LEVEL`, `--timeout SECONDS` | model commands | Model, reasoning (`low`, `medium`, `high`, plus `none` for OpenRouter) and per-call timeout (OpenRouter 120 s, Codex 600 s) |
| `--codex FILE` | model commands | Codex executable |
| `--choice ID` | `research`, `generate` | Pick a character when the name is ambiguous |
| `--previous FILE`, `--feedback TEXT` | `prepare`, `author` (request files); `--feedback` also `edit` | Revise an earlier Result |
| `--repairs 0\|1\|2` | `draft`, `generate`, `author`, `edit` | Repair budget per model stage |
| `--evidence-dir DIR` | `draft`, `generate`, `author`, `edit`, `review` | Keep exact model inputs and raw outputs |
| `--tiers A,B,C` | `build` | Purchased tiers, each 0–5 |
| `--details` | `render` | Expanded report |
| `--port PORT` | `serve` | Port (default 4317) |

## Examples

```sh
mardwerk-unit research "Monkey D. Luffy" -o data/runs/luffy.sources.json
mardwerk-unit generate data/runs/luffy.sources.json -o data/runs/luffy.json
mardwerk-unit generate data/runs/luffy.sources.json --profile my-copy -o data/runs/luffy-mine.json
mardwerk-unit review data/runs/luffy.json -o data/runs/luffy-reviewed.json
mardwerk-unit render data/runs/luffy-reviewed.json -o data/runs/luffy.md
mardwerk-unit edit data/runs/luffy-reviewed.json --feedback "Give path 2 a clearer support role." -o data/runs/luffy-v2.json

mardwerk-unit prepare data/reference/dart-monkey.request.json --profile default -o data/runs/prepared.json
mardwerk-unit draft data/runs/prepared.json -o data/runs/draft.json
mardwerk-unit check data/runs/draft.json -o data/runs/checked.json
```

## Request files

A request file has `schemaVersion: "1"`, a `task`, the character (`name`, `work`, `scope`) and a list of documents. Each document has an `id`, a `kind` (`source`, `rules` or `decisions`) and exactly one of `text`, `file` or `url`; `sourceUrl` attributes pasted text. File paths resolve relative to the request file. `constraints` lists confirmed decisions by ID. Examples are in [data/reference](../data/reference); [dart-monkey.source-file.request.json](../data/reference/dart-monkey.source-file.request.json) is a template for your own text.

A request needs a mechanics Definition to be drafted. Prepare a request file with `--profile` (for example `--profile default`): the Profile replaces its task, progression, Definition and rules document and keeps its character, sources, decisions and revision context. `prepare` prints a note when the result has no Definition.

## Output and exit codes

Without `-o`, stdout carries the complete JSON artifact (Markdown for `render`) and stderr carries diagnostics. Exit `0` means the operation completed; findings can still fail. Exit `1` means it failed and no output file was written. Ctrl+C cancels.

Model inputs and raw outputs are recorded only with `--evidence-dir`: each run gets a new folder with the input, a manifest (the binary's build and SHA-256), every request, raw answer, output and outcome.

Configuration: existing environment variables win over `.env` in the working directory; command-line options win over both. `.env` is read from the working directory only, as UTF-8 or UTF-16 with a byte-order mark; a line it cannot read is an error that names the line. `serve` prints the model and the OpenRouter key it uses, the key masked, and the `.env` file or variable it came from. `UNIT_DATA_DIR` moves `data/`, and `UNIT_RUNS_DIR` moves `data/runs/`. Credentials never enter artifacts. Agents must follow [OPENROUTER.md](OPENROUTER.md).
