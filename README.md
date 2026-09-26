# mardwerk-unit

Unit Generator adapts an existing character into a Tower Defense unit. Give it a character name (or your own source text) and a Profile with the game's rules. It finds sources, drafts a unit with a model, checks the draft against the rules, and renders a readable unit sheet with its evidence and findings. Passing checks means the unit follows the rules it was checked against, not that it is balanced or good.

It is one Go binary, `mardwerk-unit`, with CLI commands and a local web app (`serve`) that share one Engine. The numerical Engine supports three upgrade paths of five tiers.

## Try it

Requires Go 1.24 or newer. The web client is already built into the binary.

```sh
go build -o mardwerk-unit ./src/cli
./mardwerk-unit serve
```

Open `http://127.0.0.1:4317`, enter a character name and select Generate.

Model calls go through OpenRouter by default (`openrouter/free`, free models only, no paid fallback). Put `OPENROUTER_API_KEY` in a `.env` file in the working directory (see [.env.example](.env.example)), set it in the environment, or enter it in Settings. To use an existing Codex login instead, run `./mardwerk-unit serve --provider codex`.

From the terminal:

```sh
./mardwerk-unit research "Monkey D. Luffy" -o data/runs/luffy.sources.json
./mardwerk-unit generate data/runs/luffy.sources.json -o data/runs/luffy.json
./mardwerk-unit render data/runs/luffy.json -o data/runs/luffy.md
./mardwerk-unit build data/runs/luffy.json --tiers 5,2,0
```

`research` makes no model call; its Sources can be prepared again under another Profile without researching again. Generated files belong in `data/runs/`, which Git ignores. See [CLI.md](docs/CLI.md) and [LAB.md](docs/LAB.md).

## Layout

| Path | Content |
| --- | --- |
| `src/cli/` | The Go program: the `mardwerk-unit` command and its internal packages |
| `src/web/` | The web app: React client (`client/`), static files (`public/`) and the embedded build (`dist/`) |
| `data/` | Example requests, saved Profiles (`data/profiles`) and local runs (`data/runs`, ignored) |
| `testdata/parity/` | Recorded behavior of the former TypeScript Tool that the Go tests replay |
| `research/` | BTD6 reference material and design research |

## Development

```sh
gofmt -l src
go vet ./...
go test ./...
```

The tests need no account or network: model calls replay recorded responses, and OpenRouter, Codex, Wikipedia and Fandom are replaced by local fakes. They check software behavior, not the quality of generated units.

The web client needs Node.js 22 or newer and pnpm only when you change it:

```sh
pnpm install
pnpm typecheck
pnpm format:check
pnpm build        # rewrites src/web/dist, which the binary embeds; commit it
```

## What is verified, and what still needs live testing

Verified without network access:

- **Parity with the TypeScript Tool.** The Go Engine replays the [parity corpus](testdata/parity/README.md):
  - schema checks on about 26,000 cases;
  - every mechanics function;
  - request preparation and hashing;
  - drafting with plans, repairs and failures, where every model request matches the recording byte for byte;
  - checks, reviews, Markdown renders, usage summaries and kit stats.
- **Adapters.** The TypeScript tests for OpenRouter, Codex, images, research, documents, evidence, library, Profiles, the HTTP API and the CLI are ported. They run against a fake OpenRouter server, a fake `codex` executable and a fixture HTTP transport.
- **Web app.** In Chromium against the Go server, with a recorded model and fixture research ([browser_test.go](src/cli/internal/server/browser_test.go), opt-in with `UNIT_BROWSER_PORT`):
  - Profile selection;
  - the masked key from `.env`;
  - a name-only run that fails, then a new run hiding it;
  - a full generation from imported inputs with kit stats;
  - the library with Sources and a Result, and the Profiles view.

Needs live testing (not possible from the development container):

- **OpenRouter text generation** with a real key: request shape, usage and cost reporting, error classification against real provider responses, and a free and a paid model from [OPENROUTER.md](docs/OPENROUTER.md).
- **OpenRouter image generation** (`meta/muse-image` and one other listed model), including the endpoint preflight and PNG conversion of real outputs.
- **Codex** with a real `codex` CLI and login, including MCP-server disabling against a real `config.toml`.
- **Character research** against live Wikipedia, Wikidata and Fandom. The rules were ported and tested on fixtures only; real pages may differ.
- **Windows**: Codex process cleanup uses process groups on Unix only.
- **A quality reference.** The parity corpus says nothing about unit quality. A useful next step is a reference built from real BTD6 towers ([research/btd6](research/btd6)): generate, for example, Dart Monkey from its sources, then compare structure, prices and specializations with the real tower.

## Documentation

| Document | Answers |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | What do the terms mean, and who owns what? |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How is the Tool structured? |
| [docs/CLI.md](docs/CLI.md) | How do I use the CLI? |
| [docs/LAB.md](docs/LAB.md) | How do I use the web app? |
| [docs/MECHANICS.md](docs/MECHANICS.md) | What can the numerical Engine resolve and check? |
| [docs/OPENROUTER.md](docs/OPENROUTER.md) | Which models may agents call? |
| [AGENTS.md](AGENTS.md) | Rules for contributors and agents |
| [data/README.md](data/README.md), [research/README.md](research/README.md) | Example requests, Profiles and research material |

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
