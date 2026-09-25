# mardwerk-unit

Unit Generator adapts an existing character into a Tower Defense unit. Give it a character name (or your own source text) and a Profile with the game's rules; it finds sources, drafts a unit with a model, checks the draft against the rules, and renders a readable unit sheet with its evidence and findings. Passing checks means the unit follows the rules it was checked against, not that it is balanced or good.

It has a command-line interface and a local web app (UnitLab) that share one Engine. The numerical Engine supports three upgrade paths of five tiers.

## Status

The code is TypeScript today. It is being restructured into one Go binary, `mardwerk-unit`, with CLI commands and a `serve` HTTP API that the web app uses as a pure client. [ARCHITECTURE.md](docs/ARCHITECTURE.md) describes that target and [RESTRUCTURE-PLAN.md](docs/RESTRUCTURE-PLAN.md) the steps. The commands below are today's.

## Try it

Requires Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4317`, enter a character name and select Generate. `pnpm dev` rebuilds and restarts on source changes, which interrupts running generations. For a fixed build use `pnpm build` then `pnpm start`.

Model calls go through OpenRouter by default (`openrouter/free`, free models only, no paid fallback). Put `OPENROUTER_API_KEY` in a local `.env` (see [.env.example](.env.example)) or enter it in Settings. To use an existing Codex login instead, run `pnpm start --provider codex`.

From the terminal:

```sh
pnpm build
pnpm cli generate "Monkey D. Luffy" -o data/runs/luffy.json
pnpm cli render data/runs/luffy.json -o data/runs/luffy.md
pnpm cli build data/runs/luffy.json --tiers 5,2,0
```

Generated files belong in `data/runs/`, which Git ignores. See [CLI.md](docs/CLI.md) and [LAB.md](docs/LAB.md).

## Development

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm format` after editing TypeScript or JSON. Tests use model doubles and recorded HTTP responses; they need no account or network. They check software behavior, not the quality of generated units.

## Documentation

| Document | Answers |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | What do the terms mean, and who owns what? |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What is the recommended structure? |
| [docs/RESTRUCTURE-PLAN.md](docs/RESTRUCTURE-PLAN.md) | How do we get there, and what gets cut? |
| [docs/CLI.md](docs/CLI.md) | How do I use today's CLI? |
| [docs/LAB.md](docs/LAB.md) | How do I use today's web app? |
| [docs/MECHANICS.md](docs/MECHANICS.md) | What can the numerical Engine resolve and check? |
| [docs/OPENROUTER.md](docs/OPENROUTER.md) | Which models may agents call? |
| [AGENTS.md](AGENTS.md) | Rules for contributors and agents |
| [data/README.md](data/README.md), [research/README.md](research/README.md) | Example requests and research material |

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
