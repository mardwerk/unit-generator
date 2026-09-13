# Reference design and pipeline review

Reviewed 2026-09-09 with the requested Astra High peer planner and Astra High BTD6 expert. No generator or paid execution-model calls were made for this review. The [Luffy design](references/luffy-unit-design-v0.1.md) was authored directly for user verification.

Follow-up: the user approved Luffy's design direction and the [two-lane approach](dsl-two-lanes.md), including an Astra Low versus Luna High workflow comparison. Both candidate contracts are now implemented within declared scopes. The review below records the evidence that led to that decision; requests for design approval at its end are now resolved. Neither contract is final.

Neither the pipeline nor the schema is final. The experiments identify useful improvements, but accepted output still omits or misrepresents important behavior. The next step is to agree on intended reference behavior, qualify a small BTD6 subset, and use both to establish a supported schema version. Do not declare an optimal pipeline from repeated attempts at one character.

## What the experiments support

The [comparison report](luffy-pipeline-comparison.md) records 32 streamed unit attempts, of which 22 were accepted. Eight earlier nonstream transport failures are separate. All model execution used Luna; Astra agents built and reviewed prototypes.

| Approach                                           | Observed result                                          | Decision                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restricted compact compiler                        | 8/8 accepted across two tracks and four reasoning levels | Keep as evidence that deterministic bookkeeping helps. Its exclusion of forms, resources and other mechanics disqualifies it as the full Luffy solution. |
| Refined full DSL                                   | 4/4 accepted across two tracks at medium/high            | Best available experimental starting point with broad mechanics. Four attempts do not establish reliability or fidelity.                                 |
| Combined feasibility, full draft and atomic review | 5/8 accepted; three source-index planning failures       | Extra planning does not remove bookkeeping failures by itself.                                                                                           |
| Staged ownership                                   | 0/2 accepted                                             | Do not make multiple specialist authors the default without new evidence.                                                                                |

The strongest refined brief result has direct melee, three Haki paths and meaningful form gains, but omits parts of the desired Gear system. Another accepted result describes melee while implementing projectiles. These are reasons to inspect meaning and execution separately from JSON acceptance.

The study exposed specific mechanical problems: extra emitters with no extra emissions under aggregate scheduling, cooldown improvements masked by another timing gate, and resource upgrades bought before a usable spender exists. Source indices can be syntactically valid while citing the wrong fact. Those are better targets for checks than a broad novelty or quality score.

## Recommended pipeline to test next

1. Research the subject's actual mechanics. Retrieve relevant source sections and record attacks, delivery, reach, power families, transformations and limitations. Check missing categories before generation. Research must not prescribe the upgrade tree.
2. Give one Luna author the brief, evidence, exact Definition capabilities and a few qualified design examples. Request the candidate plus a concise mapping of requirements to behavior, authored adaptations and omissions. Start without a mandatory separate planning call.
3. Derive mechanical bookkeeping deterministically where meaning is unambiguous. Stable references, one effective attack cadence, explicit emission policy and absolute upgrade changes are useful starting points. Keep full DSL capability available. Unsupported behavior must be reported, never silently discarded to pass validation.
4. Validate and exercise the candidate. Then review source support and player-facing claims against its final behavior. A structured valid document can still describe the wrong unit.
5. Repair identified failures with bounded atomic edits. Run affected checks and whole-candidate validation again. Retain the last accepted version when a repair fails. Stop after checks pass or return the specific unresolved design conflict.
6. Save evidence, model/reasoning settings, artifacts, failures, cost, latency and approval status with the result.

This is a candidate architecture, not a measured winner. Compare it with the existing refined full-DSL experiment before changing the production default. A separate feasibility call earns its place only if it improves results enough to justify its latency and complexity. Compact authoring earns its place only if it preserves the same behavior and capabilities.

Use Astra for prototype design and independent reviews as requested; pipeline execution remains Luna only. Compare medium and high first, then low or xhigh if results leave a useful question. Keep the existing theoretical $30 per-prototype cap and record unknown usage separately from measured usage.

Predeclare the next comparison's task scope, required behaviors and checks. Repeat each pipeline on the same inputs and reasoning levels, retain failures, and add unrelated concepts. Luffy is now development evidence. In the explicit track, supply the user's requested direction. In the withheld-direction track, neither prompts nor retrieved examples may contain this authored Luffy reference. Judge source-faithful alternatives fairly; resemblance to the withheld preference is an exploratory observation, not an instruction-following requirement.

## Evaluation instead of one quality number

The previous scorer existed, but its 83.2/100 on the weak initial Luffy was misleading. It measured structure and scenario behavior without source fidelity, and the average hid broken or low-value upgrades. The public diagnostic contract now reports findings without an overall quality score. See [the baseline review](luffy-btd6-review.md) and [Unit diagnostics](unit-diagnostics-v0.2.md).

Keep these results separate:

| Question                           | Evidence                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Is the artifact valid?             | Schema, references, legal build rules and compiler checks.                                      |
| Does the mechanic work?            | Measured attacks, timing, eligibility, resource consumption, replacement and state transitions. |
| Does it implement the brief?       | Each explicit request maps to reachable behavior or an acknowledged omission.                   |
| Does it fit the source?            | Relevant source passages support the claimed powers; game adaptations are identified.           |
| Are purchases and branches useful? | Before/after comparisons in relevant scenarios, cost context and independent design review.     |
| Is it balanced?                    | Declared encounter conditions and playtesting. Leave unassessed until those exist.              |

Hard failures should be concrete contract violations. A promised faster attack whose effective period is unchanged is a failure. Detection adding no damage against visible enemies is not. A support upgrade may correctly add no personal damage. A source-fidelity reviewer must assess the evidence, not just whether the citation index exists.

Use mutations to check that evaluation catches known defects. Remove a form's replacement attack, mask a speed upgrade with a cooldown, put a spender behind a later unlock, or replace direct melee with a projectile while leaving its description unchanged. Also retain valid counterexamples such as numeric upgrades and conditional detection benefits, so stricter diagnostics do not become indiscriminate rejection.

## What was actually verified in BTD6

The expert reran checks against the actual BTD6 56.3 capture, Steam build 24829026, snapshot `btd6-steam-56.3-build-24829026-f5f975f753b1c578`.

- All four existing real-data adapter tests passed with `MARDWERK_MOD_HELPER_EXPORT` explicitly set to this snapshot. The default test path otherwise points to an older capture.
- The built `verifySnapshot` function returned valid with zero errors across 8,821 declared source artifacts. Root hash: `ed73ffd5bfec2fbc359a5b9e252c02cac378b7d032c2f3ab5bfa22dbc5c98baf`.
- Regular units comprise 26 families, 1,664 distinct captured endpoint models and 2,886 transitions. The 11,024 legal builds previously reported are ordered purchase routes, not distinct endpoints.
- The snapshot remains draft, untainted, incomplete and unfinalized. These checks establish recorded-data integrity and the tested normalization behavior. They do not establish executable UnitSpec fidelity, simulator parity or balance calibration.

Relevant implementations in Reference Corpus are `packages/btd6-adapter/test/static-real.test.ts`, `packages/btd6-adapter/src/static-units.ts`, `packages/btd6-adapter/src/unit-normalization.ts` and `packages/corpus-core/src/snapshot.ts`. Raw game captures remain local and outside this repository.

The direct capture contains useful schema probes:

| Example                      | Observed data                                                                                   | Required distinction                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Sniper base                  | Tower range 20, global targeting true, attack range 9,999,999, attack-through-walls false       | Targeting reach, display/placement range and obstacle behavior.                                        |
| Wizard 000 / 002 / 400 / 402 | Range 40 / 50 / 60 / 70                                                                         | Legitimate crosspath changes to the same property need deterministic composition.                      |
| Wizard 050                   | Summon Lord Phoenix cooldown 45, temporary attack removal, display switching and tower creation | Runtime activation, replacement, lifetime and reversion differ from externally chosen encounter forms. |
| Ninja paths                  | Numeric projectile growth alongside support, control and new attack behavior                    | Numeric improvements and new mechanics can both make good purchases.                                   |

BTD6 should be the primary design reference for this three-path ruleset. Calling a selected example a gold design reference requires a scoped review; it does not automatically make its translation a gold executable or balance benchmark. The game's designs depend on its prices, rounds, enemies, maps, immunity rules and activation choices.

## Reference Corpus integration

Preserve source capture, normalization and provenance. Add a versioned translation/export into executable UnitSpec rather than replacing the source model with the generator's current restrictions. Corpus emits `reference.unit`; Unit Generator consumes `mardwerk.unit-spec`. A shared manifest is not payload compatibility.

Start with already inspected Ninja, Sniper, Wizard and Boomerang as development families. Select understood endpoints and a bounded capability subset. Compare actual pure-path and crosspath endpoint captures, and test purchase-order behavior separately. A partial translation must list omitted mechanics; it cannot invent substitute damage and call that parity.

Before inspecting more families for tuning, record prior exposure and allocate whole families to development, calibration and holdout using a declared selection procedure. Examples used in prompts cannot also be unseen evaluation examples. Approving this Luffy draft would make it a development reference.

The next annotation contract should follow the shared Foundation vocabulary by separating source/data qualification, executable fidelity, design qualification, evaluation partition, reference purpose and balance context. Current `annotation-v0.1.corpusRole` mixes `GOLD`, `CALIBRATION`, `HOLDOUT`, `COMPATIBILITY`, `EDGE` and `EXCLUDED`. A gold design example can also be a development example or a holdout, so these cannot be one mutually exclusive field.

A translated export needs source and target schema versions, translator/compiler version, source snapshot/hash, source-to-operation mappings, a support profile and a parity/gap report. Retain compatibility with existing source artifacts. Do not bypass incomplete-snapshot export gates and describe the result as finalized gold data. If unit-only qualification is needed despite unrelated map gaps, implement that scope explicitly.

No Reference Corpus files, snapshots or schema contracts were changed in this review. Its existing uncommitted work remains intact. Reference qualification can begin before a schema freeze; final translated exports should target an agreed version.

## Gates for the next schema version

Freeze a named version with a supported scope, not a permanent final schema. The next candidate must:

- Represent the user-approved Luffy behavior, with any excluded feature explicitly agreed rather than hidden in generation.
- Represent a small BTD6 development subset with checked translation and behavior parity for its declared scope.
- Define runtime form lifecycle, attack replacement, cooldown persistence and modifier composition consistently in compiler and simulator.
- Preserve behavior between compact authoring and full UnitSpec across relevant legal builds.
- Survive unrelated concepts and independent evaluation, including valid conditional upgrades and known failure cases.
- Agree with Reference Corpus on versioned exports, qualifications, compatibility and migration.

Until then, keep the production default and schema unchanged. The next useful decision is approval or revision of the complete Luffy target. It should expose what the system needs to express before another generation experiment tries to fit around today's limitations.

## Review of the authored draft

Both Astra peers reviewed the directly authored Luffy draft. Their feedback prompted higher initial Boundman single-target damage, a Conqueror pulse centered on the stretched contact, a stamina check that prevents guaranteed Technique cancellation, explicit encounter-start state and clearer adaptation labels. Document checks confirm 15 sequential purchases, working local links and consistent arithmetic for the revised comparisons. Formatting and the public-boundary check pass. These checks do not execute or balance the proposed unit.
