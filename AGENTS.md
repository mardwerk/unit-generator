# Agent instructions

Read [README.md](README.md), [CONTEXT.md](CONTEXT.md) and [docs/PRODUCT.md](docs/PRODUCT.md) before changing this repository. These local documents are the contributor reference; Foundation is private and optional.

## Rules

- Build from scratch; use historical work for design context only, without reusing old code.
- Keep the Tool runnable from explicit inputs without Towerright state.
- Name files and modules after the responsibility or domain object they own.
- Keep each module focused on one concern and expose explicit interfaces.
- Keep dependencies directed from interfaces to implementations. Avoid hidden global state.
- Keep unit and mechanic rules in the Engine. Keep orchestration and project history in Towerright.
- Keep CLI and UnitLab in this repository until an independent lifecycle requires a split.
- Preserve evidence and scoped validation findings in Results.

## Completion

Before committing, confirm that a changed operation documents its inputs and outcome, module boundaries remain clear, links resolve or are intentionally external, and `git diff --check` passes.
