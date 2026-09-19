# Unit Generator

Unit Generator turns supplied character evidence and Tower Defense game rules into a connected Unit draft. It proposes a role, basic attack, upgrade paths, abilities and required mechanics, then returns deterministic checks and a separate model review. Confirmed choices, proposals and open specifications remain distinct.

The CLI and future UnitLab share a [typed generator core](docs/API.md). Applications call it directly with structured inputs and Results. The core has no console, filesystem, subprocess or hidden project history.

## Try it

Requires Node.js 24 or newer, pnpm, and an installed, configured Codex CLI. Generation uses your existing Codex model connection and authentication.

```sh
pnpm install
pnpm build
codex login status
pnpm cli author examples/mira.request.json --output .runs/mira-v1.json
pnpm cli render .runs/mira-v1.json --output .runs/mira-v1.md
```

Mira is an original public example and needs no private repositories. The result JSON retains inputs, evidence and findings; Markdown provides a readable view. Output files are never overwritten. Inspect the findings before accepting content. A completed authoring run does not certify runtime behavior or game balance.

To revise a candidate, supply its Result and explicit feedback:

```sh
pnpm cli author examples/mira.request.json --previous .runs/mira-v1.json --feedback "Give the support path a clearer team role while preserving personal wall detection." --output .runs/mira-v2.json
```

Read [CLI usage](docs/CLI.md) for independently runnable stages, source files, URLs and Luffy inputs. Local generated content belongs in ignored `.runs/`. The optional UnitLab will retain local work; Towerright owns project history and wider evaluation. No UI is implemented yet.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests use explicit model doubles and local HTTP fixtures; they require neither a model account nor external network access. Production generation uses the configured Codex connection. Build after changing source files before running `pnpm cli`.

Read [PRODUCT.md](docs/PRODUCT.md), [CONTEXT.md](CONTEXT.md) and [AGENTS.md](AGENTS.md) for scope, vocabulary and contributor rules. Public contributors do not need access to Foundation or Towerright.
