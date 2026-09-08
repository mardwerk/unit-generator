# Luffy generation and BTD6 baseline review

On 2026-09-08, the CLI generated `Monkey D. Luffy` with the default `classic-three-path` definition and the configured `gpt-5.6-luna` connection. The request did not mention Haki paths, Gears or long-range melee. Local experiment artifacts are in `.scratch/luffy-review-20260908/`; they are not committed.

## What the full flow produced

Research succeeded. A provider stream failure interrupted the first draft. Retrying with the same saved research produced a valid unit in one draft, without repair, in about 109 seconds. Independent CLI validation passed.

The result describes a short-range elastic brawler with Stretching Might, Rubberbound Control and Captain's Resolve paths. Primary range grows from 22 to 31. It has no Haki and no Gear forms. Its invented Resolve resource unlocks two tiers before its first consumer. Four consecutive upgrades multiply primary damage. A move named Gatling resolves to one emission and one hit, while Longer Windup changes damage without changing windup.

This misses the user's preferred adaptation, which was withheld from generation. Passing validation established the declared mechanical checks, not a convincing Luffy design.

The draft also resembles the Frost Bell example closely. Eleven of fifteen upgrade-operation patterns match after normalizing identifiers. Its resource cap, gain per hit, activation cost and cooldown match too. This is evidence of example anchoring, not proof that every reused mechanic is inappropriate.

## Research and planning experiments

The initial research reduced a captured 59,949-character Wikipedia source to nine mainly biographical claims. The research prompt saw only the first 12,000 characters. The Haki section fell outside that excerpt, although ranged attacks and Gears already appeared inside it and were still omitted.

A character-neutral research experiment supplied the whole captured source and requested a factual inventory of attacks, reach, power families, forms and limitations. It explicitly prohibited designing upgrade paths during research. The result contained 43 claims, including all three Haki and Gears Second through Fifth.

| Experiment                                       | Observed result                                                               | Limit                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Default research and draft                       | Valid short-range rubber brawler; no Haki or Gears                            | Weak adaptation despite mechanical acceptance                                                                              |
| Broader factual research, same drafting strategy | Elastic Barrage, Haki Conqueror and Gear Tempo; Gear Second and Third attacks | Failed after repair because of cost-band and status-stacking errors; still no forms, Observation path or Gear Fourth/Fifth |
| Two alternative concepts before drafting         | Concepts included Haki and Gear ideas                                         | Two attempts failed during draft transport; no completed unit supports a quality claim                                     |

A separate manual correction of only the second experiment's cost and stacking values passed CLI validation. That corrected artifact is a mechanical probe, not an accepted model-generated result. Its prose also describes pushing enemies backward while its signed displacement moves them toward the exit in the simulator.

The research improvement is promising, but this small sample does not establish reliable generation gains. Extra planning calls did not demonstrate a completed improvement.

## What the classic definition can represent

A direct strike with range 60 passes the current checks, so long-range melee is expressible. Path names do not prevent the three Haki specializations, and upgrades can unlock named attacks.

Forms are a larger constraint. The default permits only three prominent mechanics and counts each declared ability and form, including locked declarations, plus control and damage-over-time categories. Five forms cannot fit. Forms currently describe externally selected encounter configurations. They do not support switching during combat and are not mutually exclusive modes. Merely raising the cap can allow form stacking, conflicting operations and excessive build enumeration.

For source terminology, distinguish Luffy's base state, Gears Second through Fifth and Gear Fourth variants. Do not invent a named Gear First just to fill five slots.

## Actual BTD6 variation

The inspection used the local BTD6 56.3 capture, Steam build 24829026, snapshot `btd6-steam-56.3-build-24829026-f5f975f753b1c578`. It is a draft snapshot, not a qualified gold reference set. Raw captured game files remain outside Git.

| Family           | Upgrade variation observed in the capture                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ninja Monkey     | Top path grows projectile counts from Double Shot through Bloonjitsu and Grandmaster. Middle adds distraction, detection removal, Shinobi support and sabotage. Bottom adds seeking, caltrops, stun and sticky explosives. |
| Sniper Monkey    | Top develops damage and MOAB control. Middle adds detection, shrapnel, bouncing, income and ally support. Bottom develops attack rate and reactive behavior.                                                               |
| Wizard Monkey    | Middle adds Fireball, Wall of Fire, Dragon's Breath and Phoenix behavior, including temporary runtime transformation at its capstone. Bottom develops detection removal and necromancy.                                    |
| Boomerang Monkey | Top develops ricochets and orbiting damage. Middle develops speed and an activated boost. Bottom develops reach, a different projectile behavior and MOAB displacement.                                                    |

Numerical improvements belong in this baseline. The useful distinction is what each branch lets a player accomplish and how its purchases contribute. A different operation at every tier is not a requirement.

The capture also exposes mismatches with our representation. Sniper declares global range while its numeric range field is 20. Wizard legitimately combines range changes from two paths, where our property-ownership restriction can reject shared changes. Wizard's temporary transformation is not equivalent to an externally chosen form.

## Why the old score was misleading

The old optional scorer reported 83.197687 out of 100 for the baseline Luffy across 22 representative builds and six scenarios. It measured structural heuristics and simulated behavior, with no source-fidelity input. Replacing all names, summaries and cosmetic tags left every metric and the total unchanged.

That same report contained ten low-gain or regressing upgrade edges out of 21 and eight dominated crosspath comparisons out of 21. Six edges had exactly zero observed gain. A reporting defect counted those zero-gain edges as useful because their normalized metric value exceeded a threshold. The weighted average concealed these findings.

The revised diagnostic contract removes the public overall quality number, preserves the measured evidence and reports review findings directly. Source fidelity, gameplay quality and competitive balance remain explicitly unassessed. The synthetic benchmark retains a diagnostic index only for checking known perturbations and exploring calibration. See [Unit diagnostics](unit-diagnostics-v0.2.md).

## Revised assessment on the saved unit

The saved baseline was rerun after the diagnostic changes. Symmetric crosspath sampling now covers 28 builds across the same six scenarios, including both secondary paths for each completed main path.

Strict mechanical acceptance still passes. The assessment is `needs-review`, with general quality unrated. Of 27 measured upgrade transitions, seven show exactly zero utility gain, five show positive gain of at most 1%, and one regresses. Fifteen of 45 comparable crosspath pairs show dominance on the measured observables and costs. These are scenario observations, not claims that the affected upgrades never help.

The manually corrected broader-research candidate also needs review. It has four zero-gain transitions, six low-gain transitions and one regression, with no observed dominated pair. This does not establish that it is the better design overall.

The synthetic benchmark still passes its 15 ordering checks and 18 invalid-corruption rejection checks. Renaming the baseline's presentation still leaves mechanical metrics unchanged; source fidelity remains unassessed rather than receiving an implied high rating.

## Recommended next work

1. Improve research coverage and diversify drafting examples. Preserve source power families, reach, transformations and limitations as facts, then require the design to explain its adaptations and omissions. Keep this character-neutral; do not hardcode Luffy's preferred paths.
2. Extend the classic definition only where the intended game needs it. Runtime forms need explicit activation, duration, reversion and mutual-exclusion rules, plus compiler and simulator behavior. Raising a mechanic limit alone is insufficient.
3. Build a narrow BTD6 reference translator before tuning a quality model. Start with understood attack, damage, rate, range, pierce and emission behavior. Compile each selected pure-path and crosspath build and compare it with the corresponding captured model. Treat the captured variants as a translation check, not as an automatic score of 100.

The third option should track DSL support, simulator support and generation-profile compatibility separately. Retained opaque JSON is not executable support. Unsupported mechanics need explicit gaps rather than placeholder attacks. The existing Reference Corpus export emits `reference.unit`; Unit Lab expects executable `mardwerk.unit-spec` and reference sidecars. A shared manifest does not make those payloads interchangeable.

Assign development, calibration and holdout partitions by whole tower family before reference-guided translator development. The four inspected families are development evidence for decisions they have informed. Process holdout families through a fixed, isolated procedure, collect independent comparison judgments and tune only on calibration families. Keep holdout families out of prompts and tuning decisions. Report agreement and coverage on those unseen families. Existing synthetic corruption tests remain regression checks; they do not establish general design quality.
