# PR 6 review at 3e5d73b

Reviewed September 22, 2026 after the user identified the completed branch experiment. [PR 6](https://github.com/mardwerk/unit-generator/pull/6) was open at inspection, with head `3e5d73bd8ad588067a16e9e47721e797fc09c27b`. The existing local review worktree was clean and updated from detached `d4240b2` to this head. Main remains `b54822c`; no merge or PR comment was made. The PR description still describes the earlier offline-only approach and omits the new source option and simulator. The code and branch evaluation document are the evidence for this review.

The branch experiment is completed and deserves review, not another instruction to perform it. It reports useful generated examples and adds concrete implementation work. It still does not meet the requested automatic source interpretation or replaceable-core contract. Adopt its lessons selectively rather than replacing main wholesale.

## What changed since the earlier review

Commit `eb3e5d3` ranks combat passages and retains their document IDs. Commit `3e5d73b` adds `generate --source`, deterministic technique extraction/grouping, source-directed base-shape checks, eight reference waves and usefulness failures in the repair loop. A compact revision summary now includes feedback and previous names/role. The earlier statements that there is no source route or no revision context are no longer accurate.

The [branch evaluation report](https://github.com/mardwerk/unit-generator/blob/3e5d73bd8ad588067a16e9e47721e797fc09c27b/docs/PIPELINE-EVALUATION.md) reports successful Codex samples, source-based Natsu and Zoro samples, and gallery refinements for Natsu, Luffy, Zoro and Goku. It also reports a failed Zoro run followed by a successful retry. These are branch-reported outcomes, not new generation performed during this review. The report does not establish a matched free-model comparison with main using the same source packets, settings and acceptance rubric.

Independently reproduced here: TypeScript test compilation and the three focused suites `simulation.test`, `spine-intel.test` and `spine-pipeline.test`, totaling 30 passing tests. They use deterministic inputs/model doubles and do not establish live model quality. Four direct simulator probes below were also executed. No provider calls were made.

## Findings relevant to the reshape

| Finding | Evidence at the reviewed head | Consequence |
| --- | --- | --- |
| Name-only generation still defaults to trope intake | `src/cli.ts` uses offline `generateUnit` unless `--source`; `src/core/spines.ts` matches names/keywords to predefined spines | This does not fulfill automatic sourced character interpretation as the normal flow |
| Source-aware generation is real but uses fixed grouping | `src/core/intel.ts` assigns workhorse techniques to path1, modes to path2 manual boosts, support to path3 | It cannot discover a caller-supplied alternative organization through a general layout search |
| Source-derived constants are actually adaptation heuristics | `deriveIntel` uses regex categories and a melee range cap of 25, and `intelIssues` calls that “sourced melee reach” | Keep inferred game mapping separate from source facts; canon does not specify our map units |
| Evidence joins remain positional | `compileCompactToBlueprint` assigns `sourceFactIndices: [index % sourceFacts.length]` | A valid document ID is not evidence for the branch's particular mechanics |
| Revision context is improved but incomplete | `revisionSummary` carries names and role, not prior numerical mechanics or selected interpretation invariants | A request to preserve everything else cannot be verified from the supplied summary alone |
| Candidate constraints are not meaningfully demonstrated by stock coverage text | Compilation gives each constraint the same generic implementation sentence | Claiming coverage is weaker than showing the implementing operation or an unresolved finding |
| The simulator is bound to one fixed model | `simulation.ts` uses a straight lane, fixed offset, eight constant waves and default `resolveUnchecked` calls without the supplied Definition | Custom Definition semantics and maps are not represented by this gate |
| The new pass/fail criterion is narrow | `usefulnessIssues` compares pure T3 to T5 builds with their preceding tiers, using kills or last-kill time | It omits crosspath contributions, cost, purchase economy, placement choice and source fit |

The compact prompt still calls source anchors “flavor only”, demands exact spine prices and a path2 manual boost. These are hardcoded authoring decisions, not evidence of a replaceable core. Several useful restrictions could belong in a particular Profile, but should not govern every Definition.

## Simulator checks and limits

Using the compiled branch modules, take the aimed spine's base attack and run all eight reference waves. Compare it with (a) a boost changing only interval to one tenth for 10 seconds on a 20-second cooldown, (b) a follow-up with count 12, multiplier 100 and radius 100, (c) target priority `last`, and (d) delivery `beam`. The interval-only boost was compared against an otherwise identical identity boost. All four changes produced identical result arrays in these probes.

Code inspection explains the outcomes. Attack timestamps use `k * base.stats.intervalSeconds`, so boosted cadence does not schedule extra attacks. The simulator never consumes `followUp`, `targeting` or delivery semantics. Follow-up radius can fail a hardcoded minimum of four even though follow-up damage is not simulated. These findings demonstrate missing evaluator sensitivity, not that these mechanics lack value.

Control is also applied through a wave-wide speed factor computed from the boosted attack when an ability exists. It affects travel from the start rather than applying per-target status on hit and expiring at the appropriate time. Lead immunity is hardcoded; burn is an immediate damage approximation. Last-kill time at equal partial kill counts is not necessarily full-wave clearance time. Saturating the eight waves can reject a useful upgrade, while a small improvement on one wave can pass despite regressions elsewhere. Some approximations are reasonable for exploration, but they must be visible and should not certify a general unit's usefulness.

A compact reproduction after compiling the branch tests is:

```js
import { simulateWave, referenceWaves } from './.test-build/src/core/mechanics/simulation.js';
import { spines } from './.test-build/src/core/spines.js';
const spine = spines.find(s => s.id === 'aimed');
const base = { ...spine.base, name: 'Probe', cost: 200 };
const results = attack => referenceWaves.map(w => simulateWave(attack, null, w));
const changed = { ...base, followUp: {
  name: 'Extra', count: 12, damageMultiplier: 100, radius: 100, inheritStatuses: true,
} };
console.log(JSON.stringify(results(base)) === JSON.stringify(results(changed))); // true
```

Run this as an ES module from the pinned review checkout. It is a diagnostic of this implementation, not a desired invariant to freeze into a passing regression test. Before using simulation to block publication, add cases where supported effects must change observable outcomes and compare the model against the applicable runtime contract.

## Disposition and next action

Keep the idea of compact model output with code-owned redundant fields, improved combat-passage selection, explicit unsupported-technique proposals and actionable repair diagnostics. Keep the small scenario simulator as experimental evidence infrastructure after fixing its semantics and reporting its scope. Do not adopt positional citations, name-selected whole trees, mandatory burst slots, universal radius thresholds or default-Definition simulation as framework rules.

The next step is offline: correct or disable the simulator's publication gate for unsupported measurements; make it accept the actual Definition; and retain explicit branch-to-source joins and full revision evidence in any candidate route carried forward. Use the four probes as review cases, not another round of prompt tuning to satisfy a blind evaluator. Then assess character organization separately from numerical completion.

A later matched free-model comparison may still be needed to choose a default. That is an evidence gap, not a claim that the completed branch experiment did not happen, and not authorization to repeat the previous 24-call plan automatically. Keep this review pinned: refresh the PR head before implementing or merging anything.
