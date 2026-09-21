# Unit search program

The human edits this file before each round. The runner executes it. Short supervised rounds replace overnight autonomous runs.

## Frozen for the round

These files stay fixed while a round runs:

- `src/core/blueprint/evidence.ts`
- `src/core/mechanics/validate.ts`
- `src/core/mechanics/resolve.ts`
- `src/core/mechanics/design-policy.ts`
- `scripts/evaluate-unit-pipeline.mjs`

No trial may edit checks to pass. A trial that needs a gate changed stops and records the gate as the finding.

## Editable in the round

One stated hypothesis per trial. At most two prompt files per trial. The current edit target is `src/core/blueprint/plan.ts` plus `src/core/blueprint/plan-schema.ts`. A second file enters only when one file blocks the stated hypothesis.

## Budget for the round

- At most 30 generations, one repair each, as `research/btd6/AUTORESEARCH.md` already caps it.
- Reasonable ceilings per batch cover calls, tokens, wall time and money, including review calls.
- The round stops at the first hit ceiling, or after three straight provider failures, with partial results retained.

## Loop

```sh
node scripts/evaluate-unit-pipeline.mjs --corpus .runs/logic-tuning/corpus-five.json --authoring planned-v1 --repetitions 1 --skip-review
node scripts/evaluate-unit-pipeline.mjs --corpus .runs/logic-tuning/corpus-five.json --authoring planned-v1 --repetitions 1 --skip-review --run --model nex-agi/nex-n2.5-mini:free --max-cost-usd 0
```

The first command prints the plan with no provider calls. The second runs it. Read `report.json` before the next trial. Reflection reads the full retained trace in the saved artifact, with `run.attempts` holding purpose, issues and usage per attempt. Keep the change only when held out cases gain on review. Otherwise drop it and record the one line outcome below.

## Scores kept apart

Structure, source fidelity, distinct path use, price sense and honesty stay separate counts. No single percent decides a round. A structural pass with copied mechanics counts as a fidelity failure, not a win.

## Round log

- No rounds run yet under this file.
