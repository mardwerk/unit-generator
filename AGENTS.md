# Agent instructions

Read [README.md](README.md) and [CONTEXT.md](CONTEXT.md) before changing this repository. `CONTEXT.md` is the complete contributor reference; Foundation is private and optional.

## Rules

- Keep the Tool runnable from explicit inputs without Towerright state.
- Name files and modules after the responsibility or domain object they own.
- Keep each module focused on one concern and expose explicit interfaces.
- Keep dependencies directed from interfaces to implementations. Avoid hidden global state.
- Keep unit and mechanic rules in the Engine. Keep orchestration and project history in Towerright.
- Keep CLI and UnitLab in this repository until an independent lifecycle requires a split.
- Preserve evidence and scoped validation findings in Results.

## Completion

Before committing, confirm that a changed operation documents its inputs and outcome, module boundaries remain clear, links resolve or are intentionally external, and `git diff --check` passes.
