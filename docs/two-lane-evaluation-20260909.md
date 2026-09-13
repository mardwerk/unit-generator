# Two-lane implementation and Luffy evaluation

The two game contracts are separate executable candidates. `manga-mayhem/0.1.0` represents the approved Luffy design's runtime forms and resource lifecycle. `btd6-derived/0.1.0` represents a bounded set of three-path tower mechanics. Both are available through the CLI and playground. `classic-three-path` remains the default while the candidates are evaluated.

## Fresh BTD6 capture

The manual GLOBAL export was accepted from BTD6 56.3, Steam build 24829026, exporter 0.3.1. The game was closed before the corpus manager completed cleanup and import. No further map capture was needed.

Snapshot `btd6-steam-56.3-build-24829026-9a488f4440e9253f` passes integrity verification with 8,822 source artifacts. It is untainted and remains an incomplete draft. It preserves 40 maps, 26 regular unit families, 18 heroes, one progression artifact and 49 shared artifacts. Canonical data and reports match the previous same-build snapshot; bundle manifests record the fresh import.

Reference Corpus now exports versioned field projections into the Unit Generator-owned BTD6 model contract. Ninja 000, 100 and 200 and Sniper 000 produce validated models with explicit gaps. Their scoped two-second stationary probes yield 8, 10, 15 and 4 damage respectively. These checks establish field mapping and behavior in our probe. They do not establish parity with live BTD6 combat.

Wizard 050 produces an envelope with a null model and eight Phoenix lifecycle gaps. Substituting guessed damage for its summoned behavior would hide the contract's limitation. The exporter retains that missing support.

Ninja, Sniper, Wizard and Boomerang are exposed development families. The remaining family identifiers were assigned to 11 calibration and 11 holdout families before further mechanics inspection. Captured designs, translated execution and balance evidence retain separate qualifications.

## Implemented scopes

| Lane         | Executes                                                                                                                                                                                                  | Material limits                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MangaMayhem  | Direct contact attacks, reach and obstacles, Haki purchase effects, runtime attack replacement, Gear variants, stamina, contextual Techniques, shared cooldowns, recovery, concealment, armor and control | No general projectile, summon, support or income system. Movement is supplied by the caller. The Luffy fixture's numerical balance is provisional.                     |
| BTD6-derived | All 64 legal three-path builds, ordered composition, endpoint overrides, radius/global reach, walls, camo, immunity, automatic attacks, activated hits, temporary exclusive transformations and control   | No projectile travel/collision, Phoenix lifecycle, general summons, support, income, Paragon creation or full-game parity. Missing captured endpoints fail explicitly. |

Independent review found a Technique recovery exploit and unchanged-purchase acceptance. Both were fixed before the run. Returning to base or purchasing an Observation upgrade no longer shortens Technique recovery. Validation rejects purchases that leave every tested legal resolved model unchanged; conditional and numeric improvements remain valid. This does not prove gameplay usefulness. A display-only change or an attack replacement that masks another path still needs behavioral review.

The workspace check passed, including 249 package tests, typechecks, lint, builds and the public-data boundary check. All 12 browser tests passed. Two targeted browser tests passed again after a small form-summary display correction. The independent lifecycle review passed 47 checks, including all 15 authored Luffy purchases and 36 form/Technique combinations across six completed crosspaths.

## Comparison protocol

Run `luffy-two-lane-20260909` follows the [registered study](../experiments/model-comparison-preparation/README.md) through the [live runner](../experiments/two-lane-comparison/README.md). The matrix contains two lanes, explicit and withheld direction, three repeats and two workflows, for 24 planned slots.

One Astra Low agent researches and creates each candidate. The standard workflow uses Luna High for factual research and creation. The workflows have equal permitted source tools but different research context handling. Luna retains the existing first-12,000-character excerpt; Astra can request later source sections. Results therefore compare whole workflows, not author models in isolation.

Each prototype has a $30 conservative API-equivalent allowance across its entire matrix, including repairs and failed calls. Unknown usage retains its reservation. Standard estimates use the verified input/output rates of $10/$50 per million tokens for Astra and $0.20/$1.20 for Luna. Conservative reservations cover documented surcharges. Neither figure is a subscription invoice. Development and independent review agents are outside the execution runner's measured usage.

Content reviewers receive opaque candidate IDs, the selected lane, supplied brief, source evidence, validation and probes. Model identity and accounting stay separate until judgments are recorded. Generator self-assessments are revealed in a second phase. The withheld track is judged against its actual brief; matching the private Haki/Gear preference is an exploratory observation. Luffy remains development evidence in both tracks.

Schema acceptance, required behavior, source fidelity, description agreement, purchase usefulness and lifecycle coverage are separate findings. There is no overall quality score. Stationary probes do not establish balance.

## Completed results

The run finished in 75.6 minutes. Of 24 planned slots, 23 made model calls. There were 60 calls, including eight repairs. Final outcomes were 11 accepted, four invalid candidates, one research failure, six transport failures and two budget-limited slots. One budget-limited slot completed two research calls before creation was refused; the other never started. All six calls with unknown token usage retain their conservative reservations. Ledger reconciliation passed without warnings or orphan charges. No further live calls were made.

Here, accepted means the candidate passed the registered mechanical checks. It does not mean its prose is accurate, its purchases are useful, or its balance is good.

| Lane and supplied direction | Astra Low integrated, three slots                              | Luna High standard, three slots                               | Blind content preference                 |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| MangaMayhem, explicit       | 3 accepted, each after repair                                  | 1 accepted, 2 invalid                                         | Astra in all three pairs                 |
| MangaMayhem, withheld       | 3 accepted                                                     | 2 accepted, 1 invalid                                         | Astra twice, one tie                     |
| BTD6-derived, explicit      | 2 output-limit failures, 1 partly researched budget stop       | 1 invalid, 2 invalid-JSON failures                            | No accepted candidate or reviewable pair |
| BTD6-derived, withheld      | 1 accepted, 1 provider-stream failure, 1 unstarted budget slot | 1 accepted, 1 research failure, 1 invalid-JSON repair failure | Astra in the only complete pair          |

Four independent Astra High reviewers completed content judgments before identities and costs were revealed. All 16 retained candidate objects received review: 11 accepted and five rejected. The fifth rejected object is a retained draft from the failed Luna repair, not an extra successful output. Reviewers recorded initial content judgments before reading generator self-assessments, then saved corrections and supplementary evidence as addenda. The explicit and withheld reviews had separate contexts.

These are seven pair comparisons, including pairs with invalid candidates. They do not support a general model ranking. In particular, the three explicit Manga Astra candidates all needed their allowed repair, while none of Luna's five repairs produced an accepted final candidate. BTD6 explicit has no successful output to recommend.

## Cost and speed

| Workflow             | Accepted / planned | Calls / repairs | Known standard API estimate | Retained unknown allowance | Total committed conservative allowance |
| -------------------- | ------------------ | --------------- | --------------------------- | -------------------------- | -------------------------------------- |
| Astra Low integrated | 7 / 12             | 32 / 3          | $5.44945                    | $12.29690 across 3 calls   | $26.242975                             |
| Luna High standard   | 4 / 12             | 28 / 5          | $0.1662236                  | $0.23159785 across 3 calls | $0.61601243                            |

Known conservative usage is $13.946075 for Astra and $0.38441458 for Luna. The final column adds retained unknown reservations to that usage; it is neither measured cost nor the known standard estimate plus reservations. Each workflow stayed within its $30 allowance. Reservations prevented two Astra slots from completing even though known standard estimates were much lower. Do not release those reservations or reset the ledger to retry.

The explicit Manga comparison has complete token accounting. Astra used $2.77788 for three attempted flows, about $0.93 each; Luna used $0.0616288, about $0.021 each. Median attempt duration was 303.9 seconds for Astra and 286.9 seconds for Luna. In withheld Manga, medians were 88.0 and 171.1 seconds respectively. Duration includes failures where present. Three repeats are too few for a stable latency claim, and different source coverage prevents attributing the result solely to the author model.

Unknown usage prevents a precise total cost ratio. Provider failures, JSON failures and budget stops also make aggregate cost per accepted unit misleading without the corresponding failure counts.

## Actual generated Luffy examples

The reviewers selected unchanged generated candidates before unblinding. Both selected examples came from Astra Low, but from different tracks. The [example guide](../experiments/two-lane-comparison/examples/README.md) links the full JSON and records provenance and caveats.

| Approved reference feature | Selected MangaMayhem explicit output                                                   | Selected BTD6 withheld output                                                     |
| -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Long-range melee           | Stationary direct stretched contacts                                                   | Radius-36 contact attacks                                                         |
| Three Haki specialties     | Conqueror's, Observation and Armament paths                                            | Elastic Force, Haki and Gear Evolution paths                                      |
| Shared Gears               | Second, Third, bounded Second+Third, Fourth variants and Fifth unlock through any path | Third belongs to Elastic Force; Second, Fourth and Fifth belong to Gear Evolution |
| Contextual attacks         | One Technique action changes with active form                                          | Separate activated abilities and temporary attack snapshots                       |
| Resource and exit          | Stamina, exhaustion, Base recovery and shared cooldown                                 | Timed transformations; no stamina contract                                        |
| Qualification              | Closest generated illustration of the approved direction, with provisional values      | Bounded tower adaptation with known claim/effect errors                           |

The BTD6 example was never given the preferred Haki/Gear layout. Its alternative paths are therefore a design comparison, not an instruction failure. Neither generated file replaces the [approved manual reference](references/luffy-unit-design-v0.1.md). In particular, the examples do not prove that BTD6 requires only one temporary form. Paragon creation is a separate deferred capability.

## What review caught

- **Text can promise behavior that the model does not execute.** The selected BTD6 example advertises a 40-target Conqueror stun, but its instant effect selects one target. Both dense probes stun one target for three seconds.
- **A purchase can change data while losing its advertised purpose.** The other accepted BTD6 example changes display range without increasing attack radius. That upgrade also adds useful emissions, so the whole purchase is not useless. Its final attack replacement separately masks 105 and 205 crosspath purchases, leaving identical models and output at higher costs.
- **Forms need explicit inheritance.** BTD6 attack snapshots can drop purchased detection and other base modifiers. The selected example cannot hit concealed targets during those transformations after buying Observation. These semantics need capture-backed qualification.
- **Timing rules need validation beyond JSON shape.** Rejected Manga candidates used invalid multi-hit schedules or area shapes where a locked target was required. Passing candidates can still have Techniques that reduce sustained damage because of cycle and stamina costs. Control or early burst may justify that tradeoff, but the probe must test that purpose.
- **Source acquisition differs from source visibility.** A 59,949-character captured page did not mean an author received all of it. Some excerpts ended at 12,000 characters before detailed Haki text; others reached 24,000 or 40,000. Review addenda corrected claims that honest excerpt-limit disclosures were fabricated. Future comparisons must preserve both acquired and author-visible evidence.
- **An encounter must offer a usable target.** The original near target at distance 15 missed low-reach Manga attacks. Separate exploratory probes moved targets inside half the smallest positive reach and kept the same position across a candidate's 28 builds. Accepted units then exercised their contact attacks. Dense targets were deliberately colocated. Those idealized results cannot rank different candidates by raw damage or establish balance.

Generated-candidate coverage still lacks several moving-target, retargeting, purchase, switching and cooldown boundaries. Synthetic lane regression tests cover some of those mechanics, but that is different from checking every generated design. Range upgrades require targets at the old/new reach boundary, not just a close target.

## Changes after the frozen comparison

After all live calls and supplementary probes finished, BTD6 union diagnostics were improved to report matching-branch leaf errors with full JSON pointers and allowed discriminator values. This changes repair feedback only; schemas, accepted content and runtime behavior remain unchanged. The original compiled runtime and hashes were saved separately before the patch. Definitions typecheck, build and all 13 BTD6 tests passed, including four new diagnostic cases. A post-patch comparison preserved acceptance for all 16 retained candidates, and both formatted examples remain data-identical to their original final candidates.

A separate offline transport experiment showed that 15,011 bytes of JSON can occupy 2,957,412 bytes of framed streaming data. A two-million-byte wire limit failed while an eight-million-byte limit passed. It used zero network calls. This demonstrates a possible failure mechanism, not the cause of an unavailable live response. A future provider change should distinguish wire bytes from content bytes and retain usage when JSON parsing fails. The study's provider configuration was not changed mid-run.

## Recommended next pipeline

Use a single author with evidence gathered against the requested capabilities, deterministic validation, and one bounded repair with exact errors. Keep validity, requirement coverage, source fidelity, claim/effect agreement, purchase usefulness and lifecycle coverage separate. Do not turn them into another reassuring overall score.

The next controlled comparison should give Luna High and Astra Low the same complete saved evidence. Luna's cost makes it worth testing after fixing the evidence truncation and repair diagnostics. Until then, Astra Low is the better-supported choice for an explicit MangaMayhem draft that needs the full approved kit. That is a workflow recommendation for this study, not proof of model superiority.

Before promoting BTD6-derived to the shared default, qualify translated endpoints and crosspaths against captured models, then test temporary-form inheritance, activation, expiry and restoration against game observations. Phoenix, summons, support and income must remain declared gaps until implemented. Use the development families to improve the contract, calibration families to tune checks, and untouched holdouts only after freezing those decisions. Four bounded numeric projections are insufficient gold executable references.

There is no final schema or optimal pipeline yet. The implemented candidates and completed comparison identify concrete work needed to reach them. Image collection remains the agreed later stage.

## Evidence locations

The local run is `experiments/two-lane-comparison/runs/luffy-two-lane-20260909/`. Raw source captures, model calls and ledger remain ignored. Public examples contain generated candidate data only, without raw game exports or source pages.

Local audit files include `.scratch/two-lane-operations.json`, `.scratch/two-lane-review-coverage.json`, `.scratch/two-lane-peer-synthesis.md`, the four `.scratch/review-*` report trees, and `.scratch/two-lane-frozen-runtime-20260909/receipt.json`. The coverage receipt maps all retained candidates to saved review reports after unblinding. These local paths are audit aids, not checkout or CI dependencies.
