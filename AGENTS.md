# Agent instructions

Read [README.md](README.md), [CONTEXT.md](CONTEXT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing this repository. These local documents are the contributor reference; Foundation is private and optional. Documents describe intent and can be wrong; when a document and the code disagree, check the code and fix the document.

## Rules

- Build from scratch; use historical work for design context only, without reusing old code.
- Keep the Tool runnable from explicit inputs without Towerright state.
- Name files and modules after the responsibility or domain object they own.
- Keep each module focused on one concern and expose explicit interfaces.
- Keep dependencies directed from interfaces to implementations. Avoid hidden global state.
- Keep unit and mechanic rules in the Engine. Keep orchestration and project history in Towerright.
- Keep CLI and UnitLab in this repository until an independent lifecycle requires a split.
- Preserve evidence and scoped validation findings in Results.
- BTD6 domain facts live in [btd6-atlas](https://github.com/KyleDerZweite/btd6-atlas); see [BTD6-REFERENCE.md](research/BTD6-REFERENCE.md). Do not add new BTD6 facts here; add them there.

Before any agent-initiated OpenRouter call, read [OPENROUTER.md](docs/OPENROUTER.md). Use only its listed exact model IDs. All other OpenRouter models are disallowed. Ask the user before adding another model, then update the list according to their answer before dispatch. This policy does not cover native Codex CLI models.

## Completion

Before committing, confirm that a changed operation documents its inputs and outcome, module boundaries remain clear, links resolve or are intentionally external, and `gofmt -l src`, `go vet ./...`, `go test ./...` and `git diff --check` pass. After changing the web client, also run `pnpm typecheck`, `pnpm format:check` and `pnpm build`, and commit `src/web/dist`.
