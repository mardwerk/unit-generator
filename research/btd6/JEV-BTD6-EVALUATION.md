# BTD6 description classification with Jev

On September 20, 2026, `jev-1.13.0` agreed with 39 of 56 supplied AI-generated editorial build labels (69.6%). Agreement was 21/26 for base units (80.8%) and 18/30 for selected mature paths (60.0%). This is agreement between two AI labeling approaches, not measured accuracy. The user prefers Jev's choices and accepts overlapping roles for a build.

The completed batch used 29,736 input tokens and 5,454 output tokens in seven sequential HTTP requests, taking 3.1 seconds overall. The estimated input charge is $0.001248912 at the [published rate](https://docs.typesafe.ai/models) of $0.042 per million input tokens, checked September 20, 2026. Output is free at that rate. The API returned usage, not a billed charge or remaining account balance. The documented 64,000 token limit across each of seven requests gives a conservative rate-based input charge ceiling of $0.018816. No retries or additional paid tuning runs were made.

## Reproduce and inspect

Run from the repository root with Node.js 24 or newer and installed project dependencies:

```sh
node scripts/evaluate-btd6-roles.mjs research/btd6/raw/btd6_towers.json
node scripts/evaluate-btd6-roles.mjs research/btd6/raw/btd6_towers.json --live
```

The first command builds the cases and requests without calling the provider. The second loads the authorized `TYPESAFE_API_KEY` from the local environment or ignored `.env`. The script uses the documented [HTTP API](https://docs.typesafe.ai/api) and [Choice](https://docs.typesafe.ai/primitives/choice) response contract. It stops on a provider error without retrying and does not print credentials, headers or provider error bodies. A partial report retains completed validated rows and usage if a later request fails or returns malformed output. Usage from an unvalidated failed response is unknown. A local mocked second-response failure verified that eight prior rows and their token counts survive; that check made no network calls.

Each run writes a manifest with source hash, editorial labels and selection policy, all outgoing requests, validated responses with model, probabilities, confidence, usage and latency, and a final comparison report under ignored `.runs/jev-btd6/`. This live run is `1789862142246-live`. Request and response filenames share their zero-based batch index. The response's question IDs determine row identity, independent of response property order. The supplied dataset is now preserved byte for byte in [raw/btd6_towers.json](raw/btd6_towers.json); [provenance.json](provenance.json) records the consolidation. The checked-in [reference candidates](btd6-reference-candidates.json) retain its SHA-256 and source qualifications.

The batch covers every one of the 26 base units, plus all three tier-five bare paths of Dart Monkey, Bomb Shooter, Ice Monkey, Glue Gunner, Sniper Monkey, Monkey Buccaneer, Wizard Monkey, Ninja Monkey, Monkey Village and Engineer Monkey. These 30 mature builds were chosen before inference for role contrasts and hybrids. This is a diagnostic sample, not a random sample of 390 upgrades. Each mature input includes its base behavior and all five purchased descriptions in order. It has no crosspath. It evaluates the resulting build, not an isolated upgrade effect.

Expected labels, secondary roles, original classes, IDs, names as separate fields, prices and numeric stat tables are absent from model state. Criteria are exactly the dataset's ten-category definitions. First sentences of tower descriptions supply base behavior; later sentences advertise paths and are excluded. The question explicitly distinguishes purchased effects from future upgrades and asks for the main deployment contribution. Source descriptions still contain occasional tower names and prospective wording, so this is not a complete anonymization or a test against model memorization. Every request holds eight independent builds; batching interference was not separately tested.

## Agreement and disagreements

The following denominators are counts of editorial expected roles, not predicted roles. Some classes have only two examples, so differences between classes do not establish reliable comparative performance.

| Editorial role | Agreements / cases |
| --- | --- |
| basic_dps | 9 / 12 |
| sniper | 2 / 2 |
| rapid_fire | 3 / 4 |
| splash | 6 / 7 |
| slow | 1 / 4 |
| support | 4 / 6 |
| economy | 3 / 5 |
| tank_killer | 3 / 4 |
| status | 5 / 7 |
| summoner | 3 / 5 |

All 17 disagreements are listed below. Confidence is reported by the provider; it is not a measured probability that the selected role is correct.

| Build | Editorial role | Jev choice | Confidence |
| --- | --- | --- | --- |
| Boomerang 000 | basic_dps | splash | 0.96 |
| Ace 000 | splash | basic_dps | 0.53 |
| Dartling 000 | rapid_fire | basic_dps | 0.48 |
| Ninja 000 | basic_dps | support | 0.45 |
| Beast Handler 000 | basic_dps | summoner | 0.98 |
| Bomb 500 | status | splash | 0.72 |
| Ice 005 | slow | status | 0.81 |
| Glue 050 | support | status | 0.93 |
| Glue 005 | slow | status | 0.73 |
| Sniper 500 | status | sniper | 0.34 |
| Sniper 050 | economy | sniper | 0.67 |
| Buccaneer 500 | summoner | support | 0.43 |
| Buccaneer 050 | tank_killer | splash | 0.59 |
| Wizard 050 | summoner | splash | 0.45 |
| Ninja 050 | slow | support | 0.83 |
| Engineer 050 | support | tank_killer | 0.67 |
| Engineer 005 | economy | status | 0.82 |

Role overlap is expected. The user's interpretation accepts Boomerang as splash, Beast Handler as summoner and Bomb as splash; Ace varies by path, Dartling remains rapid fire, Ninja can be basic DPS or support, and Ice can be slow or status. These preferences guide interpretation without changing the original labels, choices or measured agreement above. A disagreement with the AI-generated editorial label is not an error.

The same overlap appears in mature builds: Glue combines status and support, Sniper combines precision, control and income, and Ninja combines sabotage with allied support. Single-choice classification picks one contribution from a broader build. Retaining alternatives makes that choice inspectable. Provider confidence and the selected role's probability are separate response fields. Neither measures agreement with verified ground truth.

The base extraction retains some prospective wording, notably Beast Handler's phrase "before commanding a beast". Inputs should make purchased behavior and personal versus allied scope explicit. No follow-up input experiment or confidence threshold was fitted in this run.

## Five fixed catalogue patterns

On September 21, 2026, `jev-1.13.0` completed all 20 advisory rankings for the [five implemented mechanical recipes](REFERENCE-PATTERNS.md): each base and its three pure tier-five builds, without crosspaths. The retained report is `.runs/logic-tuning/jev-patterns/report.json`, completed at `2026-09-21T10:15:04.509Z`. This checks classification of proposed mechanics, not character canon or gameplay balance, and is separate from the 56-case agreement measurement above. Proposals and reserved techniques were excluded from ranking inputs.

Each cell shows the chosen role and provider-reported confidence. Confidence is distinct from the role probabilities and is not calibrated correctness.

| Recipe | Base 000 | Path1 500 | Path2 050 | Path3 005 |
| --- | --- | --- | --- | --- |
| `piercing-projectile-v1` | basic_dps 1.00 | sniper 0.46 | rapid_fire 0.70 | splash 0.50 |
| `close-area-control-v1` | splash 0.61 | splash 0.81 | slow 0.92 | tank_killer 0.57 |
| `pulsed-energy-pressure-v1` | basic_dps 1.00 | status 0.93 | sniper 0.69 | rapid_fire 1.00 |
| `kinetic-striker-v1` | basic_dps 1.00 | basic_dps 0.41 | rapid_fire 0.87 | slow 0.57 |
| `pulsed-energy-impact-v1` | basic_dps 1.00 | sniper 0.47 | rapid_fire 0.54 | splash 0.76 |

The mixed choices are useful evidence rather than failures to match the declared specialties. Kinetic path1 has probabilities 0.47 basic_dps, 0.39 tank_killer and 0.14 sniper; a mature heavy-hit build can legitimately remain a generalist. Its control path splits between slow at 0.62 and status at 0.38. Projectile and nonburn energy group paths receive the broad editorial splash label despite having zero mechanical splash radius. That label does not grant an explosion or change their target-capacity operator. Likewise, a sniper label does not change targeting or range. Do not tune recipes merely to force a preferred category.

The run asserted that each candidate was unchanged before and after ranking, and all five report `unchanged: true`. With or without Jev, the numerical mechanics and purchased behavior were identical; Jev added advisory labels only. This verifies nonmutation for this check, not a causal improvement in generated units. The five responses used 19,621 input and 1,933 output tokens. Their estimated Typesafe charge totals $0.000824082; the reported billed charge is unavailable. No additional provider calls were made to prepare this documentation.

## Reference value for Unit Generator

The dataset contributes 26 tower families, 390 regular upgrade names and effect summaries, 71 ability/control records and ten reusable editorial roles. It is useful for progression examples, mechanic requirement discovery and source-linked role vocabulary. It is not a complete or single-patch-certified combat database: patch and source commits are unpinned, only six ability cooldowns are numerically verified, full upgrade combat stats and crosspath behavior are absent, and missing values do not mean zero. The 13 Paragon records are an export inventory, not proof that all are released.

The [candidate configuration vocabulary](btd6-reference-candidates.json) copies the role question and classification rules and provides 16 source-linked examples with explicit support status. It is reference data, not a loadable Game Definition or a blueprint that has passed the Engine's checks. The existing [mechanics DSL](../../docs/MECHANICS.md) remains the authority for current implementation.

Damage, interval, range, pierce, personal Camo and paired slow parameters map to existing operations when values and scope are supplied. Three darts per attack can inform projectile count, but a fan or spread is not the DSL's same-primary-target volley. Acid damage over time can inform an explicitly approved adaptation of the existing burn fields; naming it acid does not establish exact source stacking or layer behavior. A temporary self boost has a supported shape, while transforming nearby allies does not.

Useful new-mechanic candidates include independent attack components and clocks, bouncing or branching projectiles, conditional critical hits, per-attack target exceptions, damage vulnerability, ally-targeted buffs, persistent traps, summons, income and conditional purchase prices. Each needs a precise Definition and Engine implementation before generated content can claim support. A broader class label cannot supply those contracts. Monkeyopolis must preserve its conditional price rather than importing the raw 5,000 source value as a universal fixed cost.

Keep source values attached to their measured attack component, patch uncertainty and units. Placement cost, incremental upgrade cost and cumulative bare-path cost are separate concepts. Crosspath prices can be added, but crosspath combat effects cannot be assumed additive. These references should help a caller choose and specify a Profile, not silently replace the generator's experimental scale with purportedly verified BTD6 balance.

A separate September 20 integration check used the new TypeSafe adapter once on a retained Luffy Unit. `.runs/current-refinement/luffy-role-ranking.json` records base `basic_dps` at confidence 1.00, path 1 `splash` at 0.33, path 2 `sniper` at 0.47 and path 3 `status` at 0.97. Usage was 3,958 input and 386 output tokens, with an estimated $0.000166236 charge and unknown billed cost. This checks the live protocol and usage retention; it is not independent design-quality evidence or part of the 56-case agreement measurement above.

A separate OpenRouter transport check on September 20 sent exactly one small choice question to the [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request) using [`~typesafe/jev-latest`](https://openrouter.ai/~typesafe/jev-latest). This is a latest-family alias, not an account preset. HTTP 200 returned `typesafe/jev-1.13-20260917`, provider TypeSafe, 325 input tokens, 31 output tokens and a reported charge of $0.00001365. The one-sentence tower attack was classified as damage rather than support. This verifies routing and the decision protocol only, not classification quality. No new Unit or image was generated. The local ranking configuration was then restored to TypesafeAI with the existing key; the independent generation model and key were preserved.
