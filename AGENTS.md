# Agent instructions

Read [README.md](README.md), [CONTEXT.md](CONTEXT.md) and [Foundation vocabulary](https://github.com/mardwerk/foundation/blob/main/CONTEXT.md) before changing this repository.

## Rules

- Keep the Tool runnable from explicit inputs without Towerright state.
- Keep unit and mechanic rules in the Engine. Keep orchestration and project history in Towerright.
- Keep CLI and UnitLab in this repository until an independent lifecycle requires a split.
- Preserve evidence and scoped validation findings in Results.
- Add a local term only when it has stable Unit Generator meaning.

## Completion

Before committing, confirm that a changed operation documents its inputs and outcome, links resolve or are intentionally external, and `git diff --check` passes.
