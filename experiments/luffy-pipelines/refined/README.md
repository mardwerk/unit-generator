# Bounded feasibility correction and exact upgrade vocabulary

This revision wraps the frozen combined prototype. It makes two targeted changes suggested by live failures. No existing prototype, validator, source material or evaluation protocol is edited.

Every feasibility `claimIndices` field has a schema maximum equal to the last numbered source claim. With no claims, those arrays must be empty. The returned plan is checked before the combined workflow receives it. Invalid schema or source references allow one correction call containing the exact previous artifact, validation issues and numbered facts. Invalid correction ends the run before a unit draft. The workflow does not silently remove citations or use a substitute plan.

The normal run still uses three calls: feasibility, full DSL draft and atomic review. One feasibility correction and one existing outer unit repair can raise the total to five calls. Configure the caller's model budget to five. Core counts feasibility correction as a model call; its repair counter measures the outer unit repair only. This wrapper adds no transport retries.

All model stages receive upgrade operation names and mutable parameter enums extracted from the actual loaded output schema. The exact `modify-action` parameters are `cooldownSeconds`, `rangeWorldUnits`, `emitterCount`, `projectilesPerCycle` and `maximumTargetsPerProjectile`. Projectile travel speed is a fixed action delivery declaration, not one of those parameters. More shots and more collateral targets cannot be described as faster projectiles. A separately declared replacement action can change fixed delivery fields only where existing replacement, ownership, reference and lifecycle rules permit it. The full DSL remains available.

The wording directs planning, drafting and atomic review to align speed claims with executable changes, or revise the promised upgrade honestly. It is a prompt improvement, not an automatic semantic guarantee. The original unchanged validators still cannot certify prose accuracy. Independent final content review must inspect the generated operations.

`refined-feasibility-N-call.json`, `-raw.json` and `-issues.json` preserve each planner attempt. `refined-feasibility-attempts.json` retains its outcome, including exhausted failures. `refined-upgrade-vocabulary.json` records the exact enum evidence. Successful results expose final `design.feasibility`, `design.feasibilityAttempts`, `design.upgradeVocabulary` and the five-call ceiling. Failed planning has no candidate or core design envelope; its raw attempts remain on disk. All combined and patch artifacts remain available. The coordinator's numbered call files record actual final model requests.

Run offline checks:

```sh
node --test experiments/luffy-pipelines/refined/offline.test.mjs
```

Six real-core checks cover the normal three-call workflow, targeted correction with retained original evidence, the maximum five-call path including outer repair, exhausted correction with no draft, every bounded citation location and an executable shot-count counterexample. The counterexample compiles real base and tier-five builds. Shots increase from one to two while travel speed remains unchanged.

This prototype makes no live calls. The coordinator supplies Luna and controls reasoning, streaming and the monetary budget. Freeze `refined/prototype.mjs` with the original combined, patch, critique-evaluator and execution-inspector dependencies before comparison.
