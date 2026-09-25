# Unit pipeline evaluation

This is the evidence ledger for maintainers comparing recorded runs. Sections describe their dated runtime and inputs; historical fixes, test totals and next-step recommendations are not current acceptance claims. [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) owns pending work, [REFINEMENT.md](REFINEMENT.md) owns study design, and [LOCAL-ARTIFACTS.md](LOCAL-ARTIFACTS.md) explains evidence restoration.

## Concept development smoke, September 22, 2026

Four retained attempts in `.runs/concept-smoke-2026-09-22/` used original Iona and Rowan briefs under the public three-path and synthetic two-path rulesets. The frozen plan selected `nvidia/nemotron-3-super-120b-a12b:free`, reasoning `none`, a 120-second deadline, zero repairs and no separate model-review call. Catalogue prices were checked before dispatch; the adapter enforced zero-price routing. This diagnosis inspects the saved inputs, assembled prompts, original responses, checks and observations. It makes no new provider calls and does not alter the samples.

| Attempt | Generation completion | Deterministic checks | Separate model review | Development inspection | Project Acceptance |
| --- | --- | --- | --- | --- | --- |
| `iona-public` | Returned, `stop`, 42.7 s | Ran; 7 failures | Not run | Assistant declined the candidate | Not performed |
| `iona-two-path` | Returned, `stop`, 49.5 s | Ran; 25 failures | Not run | Assistant declined the candidate | Not performed |
| `rowan-public` | Local timeout, 120.0 s; no candidate | Not run | Not run | No design available to inspect | Not performed |
| `rowan-two-path` | Returned, `stop`, 107.1 s | Ran; 38 failures | Not run | Assistant declined the candidate | Not performed |

Completion means the adapter returned a parseable candidate, not that it passed checks or was accepted. The three originals match their retained checked-artifact candidates exactly. Their path/tier and required crosspath coverage checks did not fail. Failure counts include repeated consequences of the same mistake and are not counts of independent design defects. The recorded inspection was by the coding assistant, not the owner, a blinded reviewer or a player study.

Every recorded prompt contains the same complete 364-line `concept-design-v1` guidance, including preservation, finite pierce, crosspaths, support/control limits, prose editing and silent review. The embedded Request exactly matches its retained input: `deliverable: concept`, no numerical `mechanicsDefinition`, supplied source documents, progression and `conceptRules`. Required directional coverage is six pairs for the public profile and two for the synthetic profile. All four requests have empty binding-constraint lists and no decisions documents.

Comparison with the owner's locally retained prototype skill found deliberate policy parameterization and separation of player prose from structured evidence, not an omitted design section. Fixed path counts, tier milestones, activation placement and early-support policy became request fields. Public manual activation is optional and restricted to `path-2` tiers 4 and 5; the synthetic rules require a manual ability on `reach` tier 2 or 3. Those are different supplied policies. This smoke is not a reproduction of the owner's positive example: its character packet, producing model and settings differ or are unknown. No character-specific prototype content was copied into the repository.

| Failure class | Evidence and diagnosis |
| --- | --- |
| Operational | The `rowan-public` attempt's `001-outcome.json` records `LOCAL_TIMEOUT`, 120,006 ms, unavailable raw output and usage, and no HTTP status. No finish reason, partial answer or output length was retained. This establishes deadline exhaustion only. It does not establish token exhaustion, truncation, refusal or a weak design. The three returned responses all have `finishReason: stop`; no output-limit termination was observed. |
| Input | The intended mode, full guidance and applicable rules reached all four requests. No missing-skill or wrong-route explanation was found. Synthetic character briefs leave implementation details to design, deliberately. They are not evidence that those invented mechanics already exist. |
| Structural | Iona public has four ability-placement/join failures. Iona synthetic has 17 source/rules IDs used as decision references and six placement/join failures. Rowan synthetic repeats the invented `/rowan-source` ID in 24 references and has 12 placement/join failures. The actual source ID is `rowan-source`. With no binding constraints or decisions documents, `decisionRefs` should be empty. The wire schema nevertheless allowed arbitrary nonempty reference strings. |
| Supplied rules | Iona public grants a manual tether at tier 2, outside its permitted slots, and includes illegal `0,5,5` and `3,3,2` builds. Both synthetic candidates include illegal `reach:2, hold:2` builds. Their required-manual failures are eligibility cascades: abilities exist in prose but are declared `reserved`, so they are not granted by their own metadata. Iona also grants a manual control on forbidden `hold` tier 2; Rowan grants controls on forbidden `reach` tier 1 and `hold` tier 3. Merely changing `reserved` to `upgrade` would expose those remaining violations. |
| Checker scope | The recorded reference, assignment and build failures agree with the retained declarations; this audit found no demonstrated false positive among them. Repeated findings and the missing-eligible-manual messages can obscure their shared cause. Empty-constraint coverage passes prove no design preservation. `proposed_extension` findings and missing gameplay evidence are expected scope limits for concepts, not independent concept-quality failures. Prose equivalence, usefulness and control behavior were explicitly not checked. |
| Design inspection | Iona public promises a ricochet after spending maximum pierce while claiming to use remaining pierce, leaving no capacity for its promised extra hit. Iona synthetic describes mirror redirection that changes no direction, and its `reach` crosspath restores ordinary piercing language after tier 2 replaced the disc with first-impact shards. Rowan synthetic reuses a spent pod while promising seed release on another impact without explaining the remaining seed budget. These are assistant-observed contradictions or missing behavior, not executed gameplay results or automated check findings. |

At this diagnosis, the smallest proposed representation fix was to constrain known document and decision references to the actual Request and make ability placement/purchase relationships explicit. The finite-ID portion is now implemented in [concept-output.ts](../src/core/concept-output.ts); the following exact-skill run records the remaining placement and dependency failures. That can remove bookkeeping failures without narrowing qualitative mechanics. Keep rule checks intact and review the remaining interactions separately; do not silently relabel these outputs or treat fewer findings as better design. Any changed generation protocol should retain a new version and all attempts. The timeout needs a separately declared operational test before attributing it to output length or choosing a larger allowance.

The three returned calls reported zero cost and 24,558 total tokens. The timeout supplied no usage or charge report. Zero-price routing and missing provider usage are separate facts. No scenario, gameplay evaluation or human preference study ran. The assistant recorded zero development acceptances; project Acceptance remains unperformed, and cost per accepted design is undefined. The batch demonstrates working retention and check execution, but does not establish repeatable acceptable generation or justify changing the default route.

A local combined inspection page at `.runs/concept-smoke-2026-09-22/inspection.html` places each raw answer beside its findings and exposes the effective Request, Prompt/schema and termination record. Original attempt files remain unchanged.

## Exact-skill debugging invocation, September 22, 2026

After the diagnosis and finite-ID schema correction, one external development invocation used the exact full Skill and character brief supplied with the known-good concept. The provider/model remained `nvidia/nemotron-3-super-120b-a12b:free`, with reasoning `none` and a 120-second deadline. No retrieval, image, ranking, interpretation, compact-generation or repair stage ran. The source packet, exact guidance and all outputs remain in the external validation directory, not this public repository. The original successful result's model/settings are unknown, so this cannot isolate a model or representation effect.

The operation completed and reported zero cost and 16,955 tokens. It had no unknown evidence, decision or path references, but ten deterministic failures: eight purchased-ability placement/join errors and two mechanic dependencies using ability IDs. Successful reference grounding does not establish a better whole concept. Blind relabeling is inappropriate because some unavailable records also grant forbidden controls in their prose.

Coding-assistant inspection separately found numerical balance values in the qualitative output, extra manual controls, contradictory single-target/pierce descriptions, crosspaths that omit later replacements and a removed effect reappearing through inheritance. These are rule and design observations, not runtime measurements or owner preference. The response remains uncorrected for inspection. Project Acceptance was not performed, and useful repeatable live generation is not established.

The next narrow representation investigation is the ambiguity between acquisition placement and conditional activation, including the separate namespaces for mechanic and ability dependencies. A proposed fix must preserve the actual behavior and be tested with a valid control; it must not remove a control or rewrite an independent attack merely to pass the schema. Do not promote either optional experiment or change the default based on this one run.

## Numerical and branch history

September 22 branch update: the completed PR 6 experiment at `3e5d73b` is assessed in [PR6-REVIEW.md](PR6-REVIEW.md). Its reported live successes are separate from the main-branch batches below. This review reproduced 30 focused offline tests and four simulator probes, with no live generation. The probes exposed ignored follow-up behavior and active cadence, so simulator passes are not general runtime validation.

Historical local batch paths may need restoring from the [verified local archive](LOCAL-ARTIFACTS.md). The latest failure batch remains expanded.

The current [v9 starter profile](../src/core/default-profile.ts) uses `planned-v1`: a compact source-backed purchase plan, followed by numerical mechanics authoring. The [generation foundation](GENERATION-FOUNDATION.md) describes the research-derived contract, preflight feasibility and code-generated purchase evidence. Edited requirements and revisions use this route too. The plan is retained in `run.designPlan`, and planning calls use attempt purpose `plan`. With one repair per stage, the runner budgets at most four draft calls per sample, plus an optional review call. The default preserves early attack identity and legal crosspaths without demanding unique role labels, a new T3 operator or a universal 3x capstone gain.

Fixed recipe selection remains available through `--authoring reference-patterns-v1`; use `--authoring planned-v1` for the current route. Keep the runtime, sources and rubric fixed when comparing them. A structural pass does not establish a coherent design.

The [September 22 test audit](TESTING.md) identifies obsolete recipe assertions and a questionable runtime change-count ceiling. Workflow comparisons must separate game legality, route-specific contract checks and qualitative judgments. Main is not an accepted quality baseline merely because its checker runs.

## Foundation development results

The [approach comparison](PIPELINE-APPROACHES.md) evaluates PR5 through PR8 and the separate anime-to-BTD6 pitch. None has a matched benchmark establishing better character quality. The three foundation batches below used `nex-agi/nex-n2.5-mini:free`, no reasoning, provider-default sampling, a 16,000-token output limit and one correction per stage. Rimuru, Luffy and Goku ran sequentially; outputs were inspected only after each complete batch. These are reused development cases, not held-out tests. No additional provider call was used for review.

| Frozen batch in `.runs/unit-pipeline/` | Completed drafts | Calls and tokens | Whole-sample time | Reported charge |
| --- | --- | --- | --- | --- |
| `final-benchmark-2026-09-21T21-21-44-006Z` | 0/3 | 6 calls; 51,382 input, 9,528 output | Rimuru 23.8s; Luffy 32.7s; Goku 29.3s | $0, no unavailable charges |
| `final-benchmark-2026-09-21T21-28-47-940Z` | 0/3 | 9 calls; 82,729 input, 30,917 output | Rimuru 55.7s; Luffy 45.0s; Goku 140.5s | $0, no unavailable charges |
| `final-benchmark-2026-09-21T21-50-33-334Z` | 0/3 | 10 calls; 96,801 input, 22,485 output | Rimuru 59.8s; Luffy 65.3s; Goku 40.2s | $0, no unavailable charges |

The first stopped during planning. Rimuru and Luffy exceeded an unnecessarily small citation limit; Goku repeatedly promised T3 active follow-ups. The second followed evidence-capacity and planner-enum fixes. Rimuru's numerical repair introduced active follow-ups on forbidden paths and before the boost tier. Luffy's repair returned an active follow-up with radius zero. Goku exhausted the output allowance. No invalid Unit was published. Faster rejection is not faster successful generation.

Independent reading of the second batch's plans found unresolved semantic defects. Rimuru reserved much of its defining repertoire and described a same-primary follow-up that the supported operator excludes. Luffy had recognizable Pistol and Gear references but promised an automatic burst absent from its typed intent. Goku incorrectly excluded Super Saiyan and Kaiō-ken as outside an excerpt that includes them, promised detection without its typed unlock, and referred to another incompatible advanced path's active. Several descriptions promised a slower attack while their typed intentions required faster attacks. Structural planning acceptance does not prove prose fidelity or character identity.

The third batch followed Definition-aware numerical grammar narrowing in authoring and targeted repairs, plus the user's concrete character-design guidance. Its corpus and Definition hashes match the second batch. The earlier forbidden-path active effects did not recur, but all three samples still failed. Rimuru retained missing promised range and ordinary attack-rate improvements after repair. Luffy exceeded an effect budget and replaced its planned distinct volley with a different follow-up. Goku repeatedly authored zero-radius active follow-ups. Ten calls had complete reported usage. The updated code passed 398 offline tests, type checking, build, formatting and link checks; none of those checks changes the live outcome.

Postbatch reading also rejected the proposals independently of their mechanics failures. All three copied the Dart base price and complete price curve across every path, with the same early pierce/cadence/range arrangement. Rimuru used only Water Blade despite supplied Black Flame behavior under the same historical qualification. Goku described a "concave" beam where the source says "concussive" and incorrectly treated supplied later-story techniques as outside the requested period. Luffy claimed the evidence did not document removal of Gear 3's drawback, although its actual prompt included that exception. All three used ordinary improvement dimensions for temporary boost prose despite available active dimensions. The observed remaining problems are source interpretation, progression choice and translation of intentions into scoped mechanics. Another prompt or a structural pass alone would not establish their resolution.

Keep the grammar correction as a tested representation fix. The foundation does not yet meet the quality, speed or reliability target. Analytical crosspath reports now cover T3/T4/T5, and copied or altered reports are checked independently of object key order. Those comparisons support inspection rather than scoring a kit's appeal. No failed draft was published, no checks were relaxed and no paid or Typesafe calls were added in this foundation pass.

For each further experiment, retain one short trial record alongside the existing report:

- Hypothesis and the concrete failed purchase or representation it addresses.
- Candidate commit or diff, runtime hash, Definition hash, source hashes, model, endpoint and sampling settings.
- Development cases and untouched holdout IDs, fixed review criteria, maximum calls, time/token limits and remaining authorized spend including unknown-charge reservations.
- Completed-batch results: first-pass drafts, repaired drafts, failures, wall time, tokens, reported charges and unavailable usage. Inspect source identity, purchase choices, progression, inheritance and unsupported claims separately.
- Keep/drop decision and remaining failures. Record a human judgment with the exact candidate and reason; do not turn it into a universal quality score.

This is an evaluation protocol, not an executable autonomous optimizer. The current runner bounds calls and per-request tokens/time; it does not enforce a global token or wall-time budget or maintain a protected holdout split. Unimplemented limits need an explicit caller-controlled stop. Existing policy counterexamples and legal but weak reference recipes are useful controls, not evidence of general quality.

## Planning-route development results

These sequential batches generated every selected sample before running model reviews. They reuse the exact sources retained with the user's September 21 Rimuru generation, plus the existing Luffy and Goku excerpts. Original library artifacts were not changed. Directory names below are under ignored `.runs/unit-pipeline/`.

| Batch | Observed outcome | Reported charge |
| --- | --- | --- |
| `final-benchmark-2026-09-21T12-17-14-852Z`, free Nex Pro | Rimuru upstream failure. Luffy passed mechanics without repair; Goku passed after one repair. Independent reading rejected both designs. Eight calls; 61,963 input and 14,041 output tokens. | $0 for reported calls; failed-call usage unavailable. |
| `final-benchmark-2026-09-21T12-27-54-423Z`, DeepSeek V4 Flash 0731 through DeepInfra | Rimuru passed mechanics after one effect-budget repair. Its model review identified missing plan behavior and contradictory promises. Four calls; 45,809 input and 6,837 output tokens. | $0.0039792 including review. |
| `final-benchmark-2026-09-21T12-40-54-014Z`, free Nex Pro with medium reasoning | All three planning requests exceeded the 120-second local deadline. No drafts returned. | Usage and charges unavailable; zero-price routing was enforced. |
| `final-benchmark-2026-09-21T12-47-41-653Z`, GPT-5.4 Mini with low reasoning | All three failed after bounded repairs. Ten calls; 132,134 input and 32,378 output tokens. Responses exposed planning-admissibility and repair-scope defects described below. | $0.2380623. |

The free samples exposed concrete failures: Goku's fifteen milestones contained `:0`, Luffy had a punctuation-only milestone, and capstone explanations ended mid-sentence at the schema's text limit. Goku's burst capstone promised stronger sustained and active attacks but implemented only eight extra range for 15,000 Gold. Crosspath prose incorrectly attributed a T3 follow-up to T2. Both samples copied the same Dart price curve across every path. These are failed design samples despite their mechanical legality.

DeepInfra returned a complete Rimuru plan, but it promised unsupported instant kills, mimicry and obstacle bypass. Compilation silently replaced some promises with ordinary stat changes. Its successful provider response therefore does not establish a usable default design. The review is retained with the result rather than presenting the structural pass as success.

Earlier planning attempts are retained at `12-00-14-416Z` (Nex Mini Free), `12-06-40-579Z` (DeepSeek endpoint 404s) and `12-08-59-949Z` (OpenInference timeout and invalid evidence IDs), each prefixed `final-benchmark-2026-09-21T`. The Nex Mini Free batch also exposed an evaluation-only request-size limit and insufficient output-token allowance, both since corrected. Endpoint selection now verifies structured-output support and price caps. Timeouts and missing reported charges retain conservative budget reservations.

The source selection now permits 96 exact passages and 18,000 characters for planning. Source IDs are constrained in the provider schema and independently joined against retained evidence. New plan authoring rejects punctuation/numeric placeholders, allows complete explanations, and preserves old saved plans for inspection. Each tier also declares supported improvement dimensions and unlocks; code checks those promises across legal purchases before publishing a draft. Range cannot substitute for promised damage. These changes address observed representation failures; they do not certify character fidelity, purchasing value or balance.

The GPT batch exposed two implementation defects. Planning admitted active-effect promises on a forbidden path or before the active unlock tier; those are now rejected during planning. A duplicate T1 repair also unnecessarily reopened Rimuru's T5 because any design policy triggered a capstone dependency. The repair then added an unrelated slow, creating six actual effects. The corrected repair only includes dependent capstones for applicable custom capstone rules or boost prerequisites. No effects were silently removed and budgets were not relaxed. Independent plan mismatches now accompany other repairable defects in the same correction, provided resolved numeric values are valid. Goku's early slow was a mechanics-authoring mistake, not a promise in its accepted plan.

A follow-up GPT Mini Rimuru sample, `final-benchmark-2026-09-21T12-58-12-701Z`, cost $0.04423695 across three calls and failed the bounded repair. An oversized T5 stopped decoding before an independent missing T2 damage improvement could reach the correction. The collecting decoder now defers only effect-count checks during diagnosis, retains every effect, and reports independent mechanics and plan defects together. Public decoding and publication remain strict. A regression reproduces both defects and corrects them in one repair. The complete suite passed 362 tests after this fix.

Gemini 3.8 Flash attempts did not return content. The first selected a flex endpoint under ordinary request routing and returned 404; the evaluator now excludes such service tiers. A standard endpoint then returned generic HTTP 400 `INVALID_ARGUMENT`, which did not identify a field. Public documentation suggests schema complexity as a possibility, but no cause or compatibility fix was established. These failed requests retain conservative charge reservations.

A single Sonnet 5 diagnostic (`final-benchmark-2026-09-21T13-11-20-882Z`) was rejected before generation. Anthropic explicitly reported that the compiled grammar was too large. Unlike the earlier generic Gemini rejection, this identifies a provider compatibility problem. Provider schemas now omit text-length and nonempty-array size bounds while retaining strict shapes, types and citation enums. Local decoding still enforces all bounds and citations. This is a grammar simplification, not proof that the Anthropic endpoint now accepts it. No second Anthropic call was made. Nested provider errors now produce a specific, sanitized explanation when the output format is rejected as too complex. The complete suite passed 367 tests, plus type checking, build, formatting and diff checks.

Planning and mechanics prompts now share concrete retained Dart Crossbow and Boomerang middle-path progressions. Their numerical values are attributed to the September 20 wiki snapshots, with conflicting historical sections and unsupported mechanics identified. These examples explain combined purchase benefits and conditional crosspath value; they do not impose fixed price curves or universal multipliers.

Current-model preflight on September 21 verified `z-ai/glm-5.3-flash` (catalogue date August 26) and `meta/muse-spark-1.3-contributor` (September 2). The exact model endpoint catalogue supplies current rate caps and required structured-output/reasoning support. GLM's DeepInfra endpoint listed $0.075/M input and $0.25/M output but returned one upstream shared-pool 429; that batch stopped. The separately selected Morph endpoint listed $0.08/M and $0.28/M. Muse's Meta endpoint listed $0.10/M and $0.20/M. These are captured endpoint rates, not permanent price guarantees. The user explicitly permitted the Contributor endpoint's retention/training use for this public character and BTD6 source corpus.

The frozen free Mini low-reasoning batch, `final-benchmark-2026-09-21T13-15-46-522Z`, completed all three attempts with no drafts. Each consumed its 16,000-token completion allowance during reasoning and returned empty final content. Total reported usage was 25,716 input and 48,000 output tokens at $0. This does not establish free-model reliability, and the configured default remains unchanged.

The current-model Muse Contributor batch, `final-benchmark-2026-09-21T13-21-30-806Z`, returned Rimuru after one plan and one mechanics call with no repairs, taking 179 seconds. Luffy and Goku each hit the 120-second local planning deadline. The two completed calls reported 40,006 input and 16,287 output tokens at $0.007258; timed-out charges remain unavailable and reserved separately. This is not reliable or fast enough for the intended default.

Independent reading found that Rimuru's historical Water Blade subset passed structural checks but did not represent its broader supplied repertoire well. Crucially, the actual prompt omitted the Black Flame behavior article: 86 of 96 selected spans came from a repetitive skill inventory, and only 3,190 of the available 18,000 characters were used. Black Flame received its URL, period heading and caveat, while its behavior and exceptions were dropped. The model's statement about missing behavior in its selected evidence was therefore accurate; the final explanation about the full supplied references was misleading. This is a deterministic selection defect, not proof that the model ignored behavior it received. Other concerns remain: unimplemented projectile-persistence prose, a crosspath description referring to an inaccessible T4 splinter, and expensive capstones without an established purchasing advantage.

The selector now reserves complete compact retrieved technique articles before filling the remaining budget, and repeated passages rank last. Original source IDs and exact text remain unchanged. Offline replay retains all Black Flame behavior and limitations within 96 passages and 8,183 characters. A regression exercises repetitive inventories beside a short technique article. The full suite passed 368 tests; type checking, build, formatting, diff checks and the local HTTP check also passed.

The user clarified that free-model performance, fast generation and a simple architecture are the priorities. The verified GLM Morph preflight was not dispatched, and its unused allocation was released. The [archived generator survey](../research/archive/GENERATOR-SURVEY-2026-09-21.md) informed the proposals at that time; the [current research index](../research/README.md) prioritizes later, better-fitting papers. A four-call decomposition remains a proposal, not an implemented default.

The next frozen free Mini batch used the repaired source selection and disabled reasoning, matching the local configuration: `final-benchmark-2026-09-21T13-46-22-379Z`. All three failed bounded validation. Rimuru stopped on a nine-entry repertoire against the eight-entry contract even after repair; Luffy retained an inadmissible T3 active follow-up and excess effects; Goku retained duplicate early purchases, a no-op crosspath purchase, missing promised detection and an oversized capstone. Nine calls reported 97,157 input and 24,103 output tokens at $0. Whole-sample times were 89.5, 140.5 and 80.3 seconds. These failures do not justify calling the free route fast, consistent or ready. The next design should reduce redundant model-authored structure and bookkeeping instead of merely selecting a stronger model or adding more stages.

## Historical reference-route evidence

All paths below are retained under ignored `.runs/`. The two N2.5 Mini batches used the candidate contract under v6 before default promotion. The Dots batch used v7. All three were sequential, allowed one repair, used explicit free model IDs and disabled model semantic review. Every returned Unit passed on its first call; no repair was used.

| Completed live batch | Structural results and input coverage | Usage and reported charge |
| --- | --- | --- |
| `unit-pipeline/final-benchmark-2026-09-21T10-30-38-932Z/`, N2.5 Mini | 9/9 expected positive drafts, three attempts each for Luffy, Goku and rich Rimuru. Six sparse Rimuru/Kakashi attempts blocked by code before generation. | 9 provider calls; 42,858 input / 424 output tokens; $0 |
| `unit-pipeline/final-benchmark-2026-09-21T10-32-11-351Z/`, N2.5 Mini | 8/8 structural passes, two attempts each for Kakashi, Miyuki, Gojo and Rimuru using freshly enriched sources. | 8 provider calls; 54,634 input / 239 output tokens; $0 |
| `unit-pipeline/final-benchmark-2026-09-21T10-40-31-545Z/`, Dots 3 Note Preview | 3/3 expected positive drafts on the development corpus; two sparse cases blocked by code. Independent reading found supported attack/modality fits. | 3 provider calls; 14,499 input / 97 output tokens; $0 |

The sparse outcomes measure deterministic source-filter rejection, not model refusal quality. Nine and eight attempts are repeated samples across seven positive source cases, including two different Rimuru sources, not 17 independent characters. The enriched four-character batch was held out from the initial candidate experiment; its review then informed presentation fixes, so it is no longer an untouched holdout for those fixes.

Independent reading of all eight enriched outputs found supported physical or nonburn lightning subsets for Kakashi, freezing area control without burn for Miyuki, and a physical Black Flash subset for Gojo. Kakashi's clause-shaped motif still needs polish. Both Rimuru outputs selected a supported historical fire skill but initially omitted its explicit Former/absorbed qualification from the visible design. These were structural passes with a source-period presentation blocker, not eight clean semantic successes.

The then-current code was applied offline to all 17 retained positive selections. `.runs/logic-tuning/rechecked-sheets/report.json` records zero network calls. This replay added exact Former-section evidence, a visible historical-skill limitation and an actionable source-period question to both Rimuru sheets. Independent inspection confirmed those blockers resolved. It also removed misleading character-name and same-modality reserves from Luffy. Replay verifies decoding, compilation and presentation of retained selections; it does not provide 17 new model successes or test how a model responds to a changed prompt.

Independent reading of the Dots batch found no blocking source/modality mismatch. Goku selected childhood Jan ken ahead of the documented signature Kamehameha and honestly reserved the latter. This is weak representativeness, and it gives Goku and Luffy the same fixed mechanics, not a unique kit per character. That batch's Rimuru uses the curated season-three source, so it does not test the live Former-skill restriction.

Historical v7 CLI verification finished with a successful Luffy generation, check, render and 5,2,0 build, followed by two successful fresh-retrieval Rimuru generations under the final filter. The retained v7 Rimuru artifacts are `logic-tuning/cli-final/1/` and `/2/`; generation took 9.30 and 10.49 seconds. Each used 8,657 input tokens, with 21 and 26 output tokens respectively, and reported $0. Both also passed actual CLI check, render and 5,2,0 build. Independent inspection verified exact fire-behavior evidence, a visible historical-skill limitation, the Former-section quotation and an actionable source-period decision. T1 choices remain distinct burn, range and cadence purchases; T5 respectively quadruples burn, triples active damage and triples attack frequency. No flame-resistance or nullification entry is labeled as an attack. The second motif, "produce Veldora's Black Flames", is awkward prose but describes the sourced ability and grants no extra actor.

Two earlier fresh-retrieval Rimuru CLI attempts refused after dispatched model calls, including one after the historical-subset prompt clarification. They used 8,633 and 8,712 tokens respectively and reported $0. Preserve those failures separately from the final two successes; this small, changing sequence is not a measured reliability rate. The clarification permits historical subsets only when no period is requested and preserves explicit period restrictions. Its frozen-source follow-up, `unit-pipeline/final-benchmark-2026-09-21T10-47-44-603Z/`, returned two independently reviewed first-call passes using 17,414 input / 42 output tokens at reported $0. These targeted checks are not untouched holdouts.

A four-call frozen-input diagnostic in `logic-tuning/production-parity/` returned valid primary Black Flame selections under both production and evaluation sampling. Its initial harness forgot to await checking; `rechecked.json` and offline sheets correct that diagnostic without additional calls. No sampling cause for the earlier refusals was established. One response also selected bare flame-resistance/nullification entries, exposing a lexical bug; the corrected historical filter requires production or emission behavior and its regression tests now exclude those inventories. Two `logic-tuning/cli-recorded/` failures arose from recorder Request reuse before dispatch and are not provider outcomes. Final CLI artifacts above use the corrected recorder and filter.

The historical catalogue's offline tests resolve all 64 legal selections for each of five recipes, including boosted attacks, for 320 builds. Separate tests cover candidate IDs, code-owned source text, custom-task/rule routing and immutable starter constants. These checks establish declared mechanical consistency. Those v7 source constants are deeply frozen; callers edit cloned requests. That historical verification passed all 300 tests plus formatting, type checking, build and diff checks. No wave, map, economy or gameplay balance simulation was performed. The former 3x capstone specialty gate was an authored convention, and 3x active peak is not 3x average combat output.

Optional Jev ranking also completed all 20 base/pure-path classifications for the five recipes without changing any candidate. Roles are advisory, including mixed generalist, sniper and tank-killer choices. The estimated Typesafe charge was $0.000824082; billed charge was unavailable. The [Jev evaluation](../research/btd6/JEV-BTD6-EVALUATION.md) retains the table and earlier 26-tower evidence. It is not a character-canon or quality score.

## Earlier experiments and limits

Earlier failures remain part of the evidence. Direct authoring under v5/v6 repeatedly failed current capstone and effect checks after repair, across free Mini, Dots and paid DeepSeek probes. Retained reports are in `logic-tuning/baseline-v5-free/`, `baseline-v5-deepseek/`, `v6-json-mini/` and `v6-dots/`. Their prompts, transports and policies varied, so they do not isolate model effects or provide a matched performance comparison.

The first complete-recipe experiment, `logic-tuning/reference-mini-first/`, returned three structurally valid Units but swapped source names between mechanical paths and invented a beam for sparse Rimuru. The grounded follow-up `unit-pipeline/final-benchmark-2026-09-21T09-59-07-480Z/` returned only Luffy, with false refusals on supported positive sources. Later model-written exact-quote extraction still failed: `unit-pipeline/final-benchmark-2026-09-21T10-22-37-564Z/` accepted a Kakashi voice credit as energy and altered Japanese quotation text for Luffy. Its six structural passes included a false fit. A paid DeepSeek probe in `logic-tuning/evidence-deepseek/` also accepted sparse Rimuru. A more expensive model alone did not solve the evidence boundary. These failures motivated candidate IDs and code-owned text, not weaker checks.

The September 19/20 direct-authoring benchmarks remain archived as `unit-pipeline/final-benchmark-2026-09-19T23-30-20-433Z/`, `2026-09-19T23-48-21-152Z/` and `2026-09-20T00-01-01-445Z/`. Their frozen outcomes were respectively three of six structural passes, two of six with four HTTP 413 failures, and five of six before a later splash guard rejected one retained Goku. Weak capstones, misleading reserves and mismatched themes persisted. These older scales and checks are not current recommendations.

The historical CLI run `cli-pipeline/default-free-2026-09-20T08-12-15Z/` completed Luffy on its first call, then actual CLI check, render and 5,2,0 build. It used `openrouter/free`, routed to Dots, and reported $0 for 4,587 input / 1,653 output tokens. Its old Ink scale is superseded. Earlier recorder defects, timeouts and model-unavailable responses remain in `cli-pipeline/`; failed transport usage is unknown, not observed zero. A large wall-clock discontinuity makes one archived timeout unsuitable for latency comparison. The v4 Miyuki smoke in `current-refinement/` verified generation/ranking integration but still mislabeled a damage path as control. None of these integration successes proves semantic quality.

## Reproduction

Run from the unit-generator directory with Node.js 24 or newer, installed dependencies and the retained ignored corpus artifacts or an equivalent version-1 manifest. The first command only prints a plan. The second dispatches provider calls and requires `OPENROUTER_API_KEY`, model availability and authorization under [OPENROUTER.md](OPENROUTER.md). Review the printed call budget before executing it:

```sh
node scripts/evaluate-unit-pipeline.mjs --corpus .runs/logic-tuning/corpus-five.json --authoring planned-v1 --repetitions 3 --skip-review
node scripts/evaluate-unit-pipeline.mjs --corpus .runs/logic-tuning/corpus-five.json --authoring planned-v1 --repetitions 3 --skip-review --run
```

The first command prints a plan without provider calls. The second executes it using the configured explicit free model. `--model <provider/model:free>` changes that model, `--authoring direct` selects single-stage authoring, `--authoring reference-patterns-v1` selects the optional legacy benchmark, `--snapshot <run-directory>` reuses a frozen runtime, and `--characters` selects corpus IDs. Keep model, runtime, sources and rubric fixed within a comparison. The runner records sampling settings, source and runtime hashes, bounded attempts, usage, checks and rendered outputs. Current defaults are reasoning none, temperature 0.7, top-p 0.95, 16000 output tokens and a 120-second request timeout. There is no fixed seed, automatic transport retry or paid fallback.

Another checkout needs the ignored corpus artifacts or an equivalent version-1 manifest. Fresh retrieval is a new input corpus. Credentials load locally and are excluded from reports. Keep live generation, deterministic replay, model critique and human reading separate. Generalization, source-period ambiguity, unsupported mechanics and balance remain unresolved by these small development samples; expanding one demonstrated gap is more useful than claiming broad reliability from structural pass counts.

For an explicitly authorized paid benchmark, pass `--model provider/model --max-cost-usd 0.20`. The runner checks endpoint support and prices before generation, caps provider rates, and reserves a conservative cost before each call. Missing usage does not release a reservation. `--provider` can pin an endpoint tag. Ordinary requests exclude flex, priority and batch service endpoints; routing uses the selected exact tag. `--sampling provider-default` omits temperature and top-p, matching production behavior and supporting reasoning models that reject those parameters. Record this difference when comparing batches. `--max-tokens` controls the output bound. Free-only routing remains the default; no paid fallback is automatic.

## Interpretation record validation (2026-09-22)

- Hypothesis: an optional pinned interpretation constrains the planned-v1
  route without changing default behavior. See [Interpretation
  record](RULEPACK-DESIGN-PLAN.md).
- Historical setup at [c97fdad](https://github.com/mardwerk/unit-generator/commit/c97fdad8cb052bafa37f6dc92de3179f8ba2f3d3):
  the then-present `examples/luffy.request.json` supplied an author-written
  elastic-character brief plus public three-path rules and 3x5 progression.
  No path mapping
  is pinned and no interpretation is supplied, so the default route runs.
  Command:
  `node dist/cli.js author examples/luffy.request.json --preset btd6 --provider codex --timeout 590`.
  Provider: local Codex configuration. The adapter reports no usage.
  Offline helper cases: `tests/rulepack-layout.test.ts`.
- Outcome: one successful draft with no repair. Paths are Armament
  Hardening, Observation and Elastic Reach, and Conqueror's Group Pressure
  over a Stretching Punch base. Unsupported progression is reserved, not
  granted; all deterministic build checks pass with 0 failed findings, 3
  unresolved extension proposals and 1 not-checked scope note. This sample
  used the existing author route, so it shows existing-route behavior and
  does not exercise the new helpers. Those are covered offline. Full suite:
  403/403 tests pass, covering explicit caller selection with duplicate
  rejection, preserved unsupported bindings, apex and subject checks,
  per-definition capabilities, content-based pack immutability, reference
  evidence resolution, prepare-time interpretation validation, planner
  pinning with citation checks, and a form-less reference with conflicting
  groupings on the same interface.
- Historical judgment at that review: keep as an experimental opt-in, preserve
  the default route, keep helpers out of the public API, and separate layout
  validation from numerical/runtime support. The exposed helpers at that head
  and default-schema defects are assessed in [PR10-REVIEW.md](PR10-REVIEW.md);
  this recorded recommendation is not evidence that isolation was achieved. Apex synthesis
  beyond T5 capstones, unsupported runtime behavior and balance remain
  unvalidated; generated artifacts stay in ignored `.runs/` and are not
  committed.


The September 22 correction replaces the PR-added Luffy fixture and request
with original public fixtures and `examples/mira-interpretation.request.json`.
The earlier run remains historical evidence of the unpinned route, not a
published source packet or interpretation experiment. The new example marks
impact, reach and capacity as proposed groupings rather than source facts.
No new live result is reported. Offline regression results are recorded in
[RULEPACK-DESIGN-PLAN.md](RULEPACK-DESIGN-PLAN.md).
