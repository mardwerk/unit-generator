# Shared mechanics and two game contracts

The user revised the architecture on 2026-09-09. The generalized BTD6 contract is the intended default, and MangaMayhem extends the same executable mechanics. Attacks, projectiles, statuses, actors, income, support and event reactions share operation schemas and runtime code in `packages/definitions/src/mechanics`. Game adapters retain their progression, resource and form rules. [ADR 0002](adr/0002-shared-unit-mechanics.md) records the decision.

The complete captured inventory is available for development, including regular towers, heroes, subtowers, powers, upgrades and Paragon facts. Captured full Units and generated Units use the same versioned contract. An unresolved captured model is stored as null with explicit reasons, and cannot pass executable qualification. All-source availability, successful field mapping and actual game behavior remain separate claims.

The current generalized Definition is `tower-defense`, using the [0.2 contract](btd6-derived-0.2.md). Its common operations have declared normalized behavior. Native parity requires separate observations of the source game; neither complete source inventory nor a partial operation mapping supplies that proof. `btd6-derived` 0.1 remains available for historical replay.

The material below records the earlier two-lane study and its historical 0.1 contracts. Its exposure partitions, results and costs remain unchanged; the new development work does not turn those captures into independent holdouts.

## Historical study

Agreed with the user on 2026-09-09. At the study checkpoint, both lanes had executable candidate contracts and independent behavioral checks. The user's fresh GLOBAL export was accepted into an untainted draft snapshot while retaining the existing map captures. Neither contract was declared stable or a complete implementation of its source game.

## Decisions made upfront

| Decision           | Agreement                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract structure | Two separately versioned game DSLs using the existing Definition mechanism. Reuse implementation only where the semantics agree.                                                                                          |
| MangaMayhem target | The user-approved [Luffy design](references/luffy-unit-design-v0.1.md), including runtime Gears, Haki paths and stamina. Numerical tuning remains provisional.                                                            |
| Future default     | A BTD6-derived unit DSL grounded in qualified captured behavior. Preserve the current classic default until the replacement qualifies.                                                                                    |
| Initial BTD6 scope | Regular tower progression, three paths, crosspaths, automatic attacks, activated abilities and temporary transformations. This is a scope to investigate, not a claim that every regular tower behavior already executes. |
| Later BTD6 scope   | Paragon creation as a separate extension. Heroes, powers and map-generation semantics are outside the first unit contract. Preserve their source evidence in the corpus.                                                  |
| Model comparison   | One Astra Low agent researching and authoring, compared with the standard workflow using Luna High for creation. Evaluate both DSL lanes and both explicit-direction and withheld-direction tracks.                       |
| Budget             | At most $30 theoretical API-equivalent per prototype, including research, creation, repair and metered model review. No live comparison calls during preparation. Unverified model rates block paid execution.            |
| Character images   | Later research collects 2–6 sourced images with at least one usable full-body reference. Image generation and 3D modeling remain separate work.                                                                           |

The study used Definition IDs `manga-mayhem` and `btd6-derived`, both version `0.1.0`. The [MangaMayhem contract](manga-mayhem-contract-0.1.md) and [historical BTD6-derived contract](btd6-derived-0.1.md) describe those game rules. `classic-three-path` remained the default during the comparison.

## Responsibilities and boundaries

Reference Corpus owns captured game data, provenance, source normalization, qualification and source-to-export mappings. Unit Generator owns each executable game contract, validation, compilation and Unit Lab simulation. Foundation owns shared product vocabulary, UI and cross-generator infrastructure. The two game DSLs should not be moved into Foundation merely because they share code.

Corpus exports must identify both the source schema and the target contract. Retained source behavior, translated behavior and measured runtime parity are different levels of evidence. A consumer must reject an unsupported target version rather than guessing from matching field names. Public tests use synthetic fixtures and require no game installation or private corpus checkout.

No universal form count follows from BTD6's Paragon system. A temporary activated transformation changes an existing unit during combat. Paragon creation consumes or replaces eligible units under separate progression rules. Exact Paragon prerequisites, investment and degree rules need capture-backed research before the extension is implemented.

## MangaMayhem capability requirements

These requirements express the approved reference's behavior without inventing a second speculative JSON schema.

| Requirement            | Evidence the implementation must provide                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long-range melee       | Direct stretched contact with explicit reach and obstacles; it must not become a projectile to satisfy the schema.                                            |
| Haki progression       | All 15 purchases have reachable effects; all six completed main-path/crosspath combinations compile. Conditional benefits are checked in relevant encounters. |
| Shared Gear unlocks    | Highest purchased tier unlocks Second, Third, Fourth and Fifth independently of Haki path.                                                                    |
| Runtime forms          | Base, Second, Third, Fourth variants and Fifth have explicit activation, attack replacement, exclusion, exit and recovery semantics.                          |
| Controlled composition | Second's Third-inflated Technique works without allowing arbitrary simultaneous forms.                                                                        |
| Resource lifecycle     | Stamina drain/recovery, encounter reset, queued activation checks and exhaustion behave as described. No dead purchase introduces an unusable resource.       |
| Contextual Technique   | One active Technique changes with the form, retains its shared cooldown, replaces a primary cycle and cannot be used as an attack-reset exploit.              |
| Modifier composition   | Apply flat changes, multipliers, armor handling and cycle effects exactly once to the intended primary or Technique.                                          |
| Target eligibility     | Concealment, obstacles, target loss, control immunity, retargeting and collateral caps have explicit effects.                                                 |

Use direct synthetic tests for each lifecycle and timing rule before generating examples. Support defensive damage or arbitrary terrain changes only when a separately approved design needs them. The Luffy reference deliberately bounds those features.

## BTD6-derived capability investigation

Ninja, Sniper, Wizard and Boomerang are already exposed development families. Their captured behavior may shape the contract. They are not independent holdouts for decisions made from that inspection.

| Capability                        | First evidence and check                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal progression                 | Distinct captured endpoint builds, costs and prerequisites; ordered purchase routes checked separately for unintended order dependence.                                    |
| Primary attacks                   | Damage, attack period, projectiles/emissions, pierce and target eligibility from understood nested graphs.                                                                 |
| Reach and obstacles               | Sniper's global targeting differs from its displayed numeric tower range and does not automatically ignore walls.                                                          |
| Crosspath composition             | Wizard's captured 000/002/400/402 range changes demonstrate two paths changing one property. Compare actual endpoints instead of assuming commutative addition everywhere. |
| Abilities and transformations     | Activation gates, durations, temporary attack replacement, dependencies and reversion. Wizard Phoenix exposes lifecycle and subordinate-model requirements.                |
| Additional regular-tower behavior | Support, income, summons, targeting and immunity interactions need declared support or explicit omissions. A regular-tower label does not prove a complete translation.    |
| Paragon extension                 | Preserve source links and prerequisites now; defer executable group investment and degree behavior until qualified.                                                        |

Qualify the smallest understood subset first. Unsupported behavior must remain in gap reports. Do not replace summons, support or income with guessed personal damage. A one-click export captures source material; it cannot prove live behavior or simulator fidelity.

## Comparison protocol

The [comparison preparation](../experiments/model-comparison-preparation/README.md) records the agreed study and frozen briefs. The [comparison runner](../experiments/two-lane-comparison/README.md) implements the matrix, current verified prices, budget accounting and readiness checks. Those checks passed before live execution started on 2026-09-09. Neither lane is qualified as a complete game implementation.

Run integrated research plus creation as the main comparison. Attribute differences to complete workflows, since changing research and creation together does not isolate author-model quality. A follow-up using identical saved research can isolate creation if the first results justify it.

Keep the explicit and withheld tracks separate. The explicit track receives long-range melee, Haki paths and Gear direction. The withheld track receives only character identity and normal neutral task constraints. Never retrieve this approved Luffy reference into the withheld prompt. Luffy is development evidence in both tracks, so neither becomes a generalization benchmark merely because one preference is hidden.

Judge BTD6 Luffy against its declared BTD6 contract first. Then compare the adaptation with the MangaMayhem reference and report retained, adapted and unsupported features. A deliberate adaptation to a stricter contract is different from an author ignoring available capabilities. An unsupported required feature must be disclosed, not quietly erased to improve acceptance rate.

Record validity, source fidelity, explicit requirement coverage, working behavior, purchase usefulness, repairs, latency and cost separately. Source claims need passages and locators. Behavioral findings need runnable evidence. Independent reviewers should see anonymized candidates before model identities or costs.

## Later visual-reference research

For an identified existing character, record the selected continuity and form before choosing images. Aim for 2–6 distinct useful images, including at least one full-body view with visible silhouette and limbs. Keep the source page, original image URL, retrieval date, credit or usage information when available, depicted form, framing, dimensions and local artifact hash. Do not mix Luffy's Gears into an unlabeled identity sheet.

If a usable full-body image is missing, record that gap and the best available sources; do not claim the 3D input requirement passed. For original concepts, do not manufacture source provenance. Generating a consolidated model reference later would create a derived asset with its own source links and review, rather than replacing the originals or claiming to be canonical art.

No image download, image generation or 3D pipeline is required for the manual game-export handoff.

## Completed export and comparison

The study's fresh export, scoped translations, both candidate Definitions and registered comparison completed. The [evaluation](two-lane-evaluation-20260909.md) records failures, costs, blind reviews and generated Luffy examples. Astra produced the stronger explicit MangaMayhem results in this study; neither workflow produced an accepted explicit BTD6 candidate. These results describe the frozen study contracts, not the later generalized 0.2 contract.

The sequence below records the agreed handoff process. It is not a request to rerun the completed paid comparison.

## Manual export sequence

The corpus manager's [manual export handoff](../../reference-corpus/docs/operations/prepare-unit-dsl-capture.md) contains the checked installation state and exact button sequence. Its [BTD6 capability evidence](../../reference-corpus/docs/research/btd6-unit-dsl-evidence.md) records what the current capture can establish. These are developer coordination links, not runtime or CI dependencies.

1. Import the new export into a new snapshot or staging record. Verify file completion, build/exporter identity, source hashes and declared scope. Preserve the existing capture.
2. Compare inventories and dependencies against the existing draft; retain prior captures where provenance permits, with differences reported. Do not reinterpret an incomplete snapshot as globally complete.
3. Agree the first translated BTD6 subset from the capability evidence and preserve family exposure boundaries. Implement versioned exports and parity checks for that subset.
4. Implement the MangaMayhem lifecycle requirements through its separate Definition. Reuse proven common behavior where it fits.
5. Once both tested contract versions and price estimates are ready, run the registered comparison. Inspect and present BTD6 Luffy alongside the approved MangaMayhem design.

The manual export is a handoff point. It does not finalize the schema, make every captured unit executable or automatically start paid model calls.
