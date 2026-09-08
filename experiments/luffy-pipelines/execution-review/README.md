# Execution review prototype

`inspectExecution(unit)` returns deterministic execution facts for a raw UnitSpec. Import it from `index.mjs`. It makes no model calls and returns no score. This is a separate prospective inspection tool. It does not change the frozen common evaluator, its rubric, or historical results.

```js
import { inspectExecution } from './index.mjs';
const review = inspectExecution(candidate);
const masked = review.findings.filter((f) => f.code === 'COOLDOWN_REDUCTION_MASKED_BY_INTERVAL');
```

The inspector runs the real `validateUnitSpec`, `representativeSelections`, `validateBuildSelection`, and `compileResolvedSelection` implementations from the built workspace packages. The compiler validates compiled builds. Invalid input returns validation issues and no findings. Compilation failures produce a partial report with their selections and issues. No schema or validation rules are relaxed.

## Cadence findings

The simulator's `actionPeriod` uses `max(trigger.intervalSeconds, timing.cooldownSeconds)`. The primary scheduling loop starts enabled interval actions at zero and repeats attempts by that period. A finding compares the same action ID in real parent and child builds. Both actions must be enabled primary interval actions, and the child must have a lower cooldown.

- `COOLDOWN_REDUCTION_MASKED_BY_INTERVAL` means cooldown fell while the effective scheduled period stayed equal.
- `INTERVAL_SCHEDULE_PERIOD_CHANGED` records a changed scheduled period and its signed delta. It does not assert a measured damage benefit.

Each finding includes the changed upgrade or form, its operations, complete before/after selections, build fingerprints, action ID, cooldowns, triggers, effective periods, windups, and whether the trigger stayed unchanged. There is no inference from names, summaries, source character, or promised quality.

The inspector starts from real representative selections and their form-free variants. It removes one selected upgrade at a time and compares only legal compiled parents. The report lists inspected edges and excluded parents. Forms stay identical across an upgrade edge. Form-free variants let an upgrade remain inspectable when removing it would otherwise invalidate a granted form.

## Form inventory

For each representative upgrade selection, the inspector compares no forms with each legal single form. It records enabled action IDs and effect IDs/types before and after, newly enabled actions, and disabled actions. Existing enabled actions do not count as newly enabled. Invalid redundant `enable-action` operations still fail the real validator. These are compiled encounter choices, not proof of runtime activation. Cadence findings also inspect these form comparisons.

## Limits

Findings apply to recurring scheduled attempts. Windup independently delays resolution. Costs, conditions, state interactions, targets, delivery, scenario duration, and other action changes can affect successful attacks even when the scheduled period stays equal. Ability cooldowns and secondary/summon invocation paths differ, so a masked primary period does not establish that a cooldown change has no effect through every route. Disabled and non-interval cooldown changes appear in coverage exclusions.

Representative sampling and legal single-upgrade removals do not cover every build. Single-form inventory does not cover every form combination. Action replacements with different IDs have no same-action cadence comparison. Whole upgrades can provide other benefits alongside a masked cooldown change.

Primary target selection and collateral projectile pierce are separate in the simulator. The inspector does not infer `min(targeting.maximumTargets, delivery.maximumTargetsPerProjectile)` or any combined target cap.

## Offline verification

`node experiments/luffy-pipelines/execution-review/inspect-saved.mjs` inspects every retained `runs/<runId>/unit.json` under the study directory. It writes full reports to `candidates/<runId>.json` and a compact `candidate-summary.json` inside this prototype directory. Reports record candidate and inspector hashes. Comparison counts describe sampled contexts and are not independent defect counts. The driver does not edit candidate or frozen evaluation files.

From the repository root with workspace packages built:

```sh
node --test experiments/luffy-pipelines/execution-review/offline.test.mjs
```

The regression uses a real validated fixture and real compiled base/upgrade builds. With trigger interval 2 seconds and cooldown 2 to 1 second, both simulations produce six direct hits over ten seconds and identical reports apart from their build fingerprints. With the trigger floor lowered to 0.05 seconds, the same cooldown operation changes six hits to eleven. Another case includes windup, demonstrating delayed first effects and five resolved hits within the same duration. Additional checks cover actual form enablement, disabled actions, invalid input, and input immutability.
