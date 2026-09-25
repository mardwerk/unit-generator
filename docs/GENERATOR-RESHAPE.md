# Replaceable rule implementations and character interpretation

As of September 22, 2026, concept authoring and configurable concept rules exist through the original workflow. See [API](API.md#data-contract), [CLI](CLI.md#qualitative-concepts) and current [next work](NEXT-EXPERIMENT.md). `planned-v1` remains the default; outputs remain checked drafts, not playable units. Executable rule replacement and automatic interpretation selection remain proposals.

[PR 10](PR10-REVIEW.md) merged as an optional caller-supplied interpretation. Review at `c97fdad` found default-schema leakage, widened evidence joins and lost concept semantics; correction `2064b6b` addressed them before merge. [PR 6](PR6-REVIEW.md) merged a separately selected compact experiment, excluding automatic name recipes and incomplete simulator. Its `3e5d73b` branch review remains historical.

The numerical audit below records commit `b54822c` and the September 22 conversation. Proposed boundaries are requirements, not new implemented APIs. The target is a character name as normal input and a complete unit under a previously selected game configuration. Remaining work includes inspectable character organization, a replaceable executable Definition, and repeatable diagnosis and improvement. [REFINEMENT.md](REFINEMENT.md) owns experiments; this document owns boundaries and later migration order.

The inspected local handoff `2026-09-22T12-56-06Z-unit-generation-next-experiment.md` and [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) retain free-model priority, current UI, source ownership, bounded repairs and explicit inputs. The user subsequently identified PR 6's completed experiment; its review supersedes the handoff's pending status. Structural work does not establish that more model stages or a new core fix recorded failures.

## Requirements established by the conversation

The framework must select a coherent interpretation before filling upgrade slots. Parallel mastery, successive forms, persistent traits and restrictions are different source relationships. They must not all be flattened into damage, range and speed. Selection of their game representation should normally be generated, with optional user-pinned choices, rather than a prerequisite the user supplies for every character.

The public default is intended to follow BTD6 progression, including a Paragon equivalent. Current implementation is only a restricted BTD6-inspired starter. Exact compatibility requires an explicit source version, supported tower/mode scope, prices, exceptions, acquisition and ownership policies. Early auxiliary upgrades and T3 specialization are authoring conventions, not a verified universal description of BTD6. Do not advertise exact compatibility before that contract and its checks exist.

External projects own their rules, preferred character mappings and acceptance examples. Supply those explicitly at request time and keep their source material, outputs and detailed planning outside this public repository. A private preference must not become a mandatory public interpretation.

An Apex, when a ruleset defines one, needs an explicit acquisition and synthesis contract outside ordinary crosspath purchases. It is not an accidentally legal `5-5-5` build. Resource cycles, activation timing and purchase-time transitions need declared semantics before implementation. None is established by a descriptive form name or by a layout descriptor.

## Numerical audit at `b54822c`

| Finding | Code evidence | Consequence |
| --- | --- | --- |
| Model transport already has a small seam | [ModelClient](../src/core/model.ts) accepts explicit structured requests and returns output/usage | Keep it; provider replacement is not the main core problem |
| General prose authoring accepts variable paths | [schemas.ts](../src/core/schemas.ts) uses arrays for draft paths and supplied progression | This does not make numerical mechanics variable |
| Numerical progression is fixed | [mechanics/schemas.ts](../src/core/mechanics/schemas.ts) declares fixed `pathKeys`, `tierKeys`, `pathCount: 3`, `tiersPerPath: 5` | A four-path Definition fails before generation |
| Resolution assumes that shape | [resolve.ts](../src/core/mechanics/resolve.ts) checks three tiers and enumerates three nested loops through five | Configurable numeric limits alone cannot replace progression semantics |
| Preparation repeats it | [definition.ts](../src/core/blueprint/definition.ts) builds paths 1 to 3 and tiers 1 to 5; [prepare.ts](../src/core/prepare.ts) requires that progression | A new pack must drive request preparation too |
| Planning already exists, but at purchase level | [plan-schema.ts](../src/core/blueprint/plan-schema.ts) and [purchase-plan.ts](../src/core/blueprint/purchase-plan.ts) retain a repertoire and one fixed tree | There is no explicit retained comparison of alternative source organizations |
| Creative instructions encourage role-first structure | [design-guidance.ts](../src/core/blueprint/design-guidance.ts) lists tactical specialization enums; [draft.ts](../src/core/blueprint/draft.ts) requests an automatic attack and three tactical specializations | These are plausible contributors to generic kits, not an experimentally isolated cause |
| Behavior vocabulary is narrower than the proposed game | [mechanics/schemas.ts](../src/core/mechanics/schemas.ts) models one base attack, modifiers, statuses, limited follow-ups and boosts | Shared forms, stamina, integrated Apex and a general actor/event system are not implemented by descriptive names |
| Presentation knows the numerical pack | [kit-stats.ts](../src/presentation/kit-stats.ts) imports fixed path/tier keys | Replaceability must reach render, build inspection and Lab, not only generation prompts |
| Repair is bounded and partially targeted | [repair.ts](../src/core/blueprint/repair.ts) preserves untouched fields and requests affected tiers | Retain the mechanism, but verify that fixes preserve promised behavior |
| Evaluation is analytical | [design-evaluation.ts](../src/core/blueprint/design-evaluation.ts) and [MECHANICS.md](MECHANICS.md) describe resolved comparisons | No evidence of map/wave play, stamina execution, economy tuning or player preference follows |

The retained report was inspected locally, not rerun. Its plan pins `planned-v1`, Definition v9, three character samples, one repair per stage and no model review. [PIPELINE-EVALUATION.md](PIPELINE-EVALUATION.md) records zero published drafts and stage-specific human reading. Findings concern reliability and semantic fidelity, not proof that plugins improve output.

There are already useful foundations: explicit Requests, retained source passages, constraints and revision feedback, immutable Definition evidence, code-owned joins, deterministic arithmetic, scoped inheritance and legal-build enumeration. Preserve these. Avoid replacing the existing application with an unrelated universal framework.

## Proposed boundaries

Use the existing Definition, Profile, Request and Result vocabulary. The conversation's `RulePack` is a distribution/configuration unit that would resolve to a Game Definition, its Profile, design guidance and an implementation identity. It is not a second competing source of rules. A `ReferencePack` maps to the retained source documents and evidence. A proposed interpretation artifact extends the existing design-plan responsibility rather than introducing a second tree that must remain manually synchronized.

| Responsibility | Owns | Does not own |
| --- | --- | --- |
| Generation workflow | Stage budgets, candidate selection, repair routing, immutable inputs and Result assembly | Path counts, specific mechanics, prices or private character mappings |
| Rule implementation in the Engine | Schemas, capabilities, legal purchases, compilation/resolution, scoped checks and presentation projection | Network retrieval, provider selection or project history |
| Definition and Profile | Enabled capabilities, progression, numeric bounds, costs, authoring conventions and policy | Implementation of an otherwise absent operator |
| Source interpretation | Evidence-backed relationships, chosen grouping, omissions, alternatives and invariants | Canon claims inferred from a game effect |
| CLI and UnitLab | Resolve project selections into explicit inputs and display results | Hidden rules or a separate generation implementation |
| Consumer and caller evaluation | Runtime execution, scenario traces, wave economy and playtests; Towerright retains wider acceptance/history | Redefining a candidate's governing rules during evaluation |

Start with one in-process rule implementation interface, not services or an arbitrary plugin loader. Its small public contract should describe available design slots and provider schemas, compile/check a proposal, inspect a selected build, and project a unit sheet. Keep the substantial rule implementation behind it. Inject the resolved implementation into the generation workflow; do not scatter `if packId` switches across callers.

Use the current numerical implementation as the first adapter, honestly named for its restricted capabilities. A second independently authored four-path test Definition proves topology variation. A separately scoped behavior implementation would later test variation beyond topology. Four paths alone do not prove that the core can replace attack/resource semantics. Do not use a hypothetical card backend to expand the first milestone.

Initially resolve pack IDs through a trusted local registry. Unknown IDs, unsupported versions and conflicting overrides must fail before a model call. Record exact resolved Definition, Profile, implementation and schema revisions or hashes with the Result. Keep old v1 artifacts readable through their old decoder and projection. Do not rewrite saved artifacts in place or silently resolve them with today's default pack.

Keep Zod and JSON authoring for the first iteration. The project already uses Zod and provider-facing JSON Schema. Schema validity is not semantic validity. CEL is a researched option for future configurable expressions, not a selected dependency; first prove the need with an expression that cannot be represented adequately by existing declarative fields. If introduced, define types, available functions, bounded evaluation and versioned host bindings. No `eval` or generated unrestricted JavaScript is needed for pack configuration.

## Interpretation before detailed purchases

A compact interpretation record should retain the persistent identity, source relationships, chosen progression bindings, omissions, alternatives considered and reasons, and invariants that detailed generation must preserve. Claims cite exact source passages; inferred relationships and game adaptations have separate status. A source with four disciplines must be grouped, partially omitted or mapped elsewhere honestly, not described as canonically three-part.

Use original public examples to test preservation of parallel capabilities, shared development and mutually exclusive alternatives. Bind these relationships only to behavior permitted by the selected rules. A layout can preserve an unsupported proposal without claiming executable support.

Retain each caller preference with its scope and reason in that caller's project. Do not create character-name lookup tables or tests that always expect a particular source label. Include references without transformations and with an awkward path-count fit to detect overgeneralization.

This artifact does not require a mandatory extra model call. Compare an enriched existing plan response with a bounded layout-only experiment after a separately planned route comparison. The immediate concept work remains in [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md). Candidate counts such as six layouts/two finalists are untested suggestions. Free-model reliability, token limits and latency remain constraints. Keep selection reasons visible; a model's private deliberation or enthusiasm is not a retained comparison.

## Completion and portability

The current deliverable is a proposed unit with structural and analytical evidence. The intended playable deliverable additionally needs a compatible Consumer, implemented behavior, independently defined acceptance scenarios, reference maps/waves/enemies/economy and an exporter. A Definition with prices and damage constants is not that reference world.

Represent completion dimensions independently: definition complete, scoped checks passed, runtime tested, benchmark tested, human playtested and production assets complete. Each true claim needs evidence and versioned test conditions. “Not checked” must remain distinct from failure. Placeholder graphics can support a playable prototype but do not mean production assets exist.

The long-term name-only flow uses project configuration selected once. It resolves identity and continuity, researches evidence, chooses an interpretation, produces mechanics, checks/repairs within budget and exports a Result. Ambiguity can require resolution; unsupported mechanics produce a revised adaptation or an explicit failure with retained drafts. The system must not weaken its governing Definition to manufacture completion.

The public pack's Paragon equivalent, difficulty pricing and private forms are separate missing capabilities. For pricing, specify multipliers and tie-breaking, round each purchase under the selected policy and sum those purchases. Illustrative thread multipliers are not BTD6 facts. For forms, define event ordering, transition behavior, modifier inheritance, activation eligibility, exhaustion, recovery and purchase-time effects before runtime work. For permanent Apex forms, specify how entry-triggered effects behave without repeated entry. No visual change grants unpurchased mastery.

## Later numerical reshape and acceptance

The September 22 concept-first decision supersedes this immediate implementation order. Concept operations exist; pending quality and study acceptance are tracked in [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md). The stages below propose later numerical portability and runtime evaluation, not concept prerequisites.

| Stage | Bounded change | Evidence required before proceeding |
| --- | --- | --- |
| 1. Validate evidence and any future evaluator | PR 6 merge corrected evidence joins and revision context, excluding its simulator. Address remaining scenario defects before reusing that evaluator | Supported-effect sensitivity, supplied-Definition use and per-case trace; branch results distinguished from matched comparisons |
| 2. Extract the current rule implementation | Move fixed numerical schemas, prompts, resolution/checking and projection behind the Engine seam | Existing public outputs and legal builds remain equivalent offline; old artifacts render; no live quality claim |
| 3. Prove topology replacement | Supply a second four-path Definition and project it through CLI/API/Lab | Preparation, provider schema, validation, purchase/build inspection and rendering change without workflow edits; invalid combinations rejected |
| 4. Test character organization | Retain alternative groupings and chosen invariants in a bounded optional route | Pairwise source-grounded review and preservation through mechanics/repair; held-out references before default promotion |
| 5. Specify and implement missing pack capabilities | Public Apex/pricing, then private form/resource semantics with a compatible Consumer | Contract tests on transitions, inheritance and ownership; public pack rejects private capabilities; no hardcoded character names |
| 6. Evaluate playable output | Add the caller's small versioned reference world and runtime adapter | Purchase sequences, equal-budget alternatives, competent policies, rule-removal comparisons and later human playtests |

Stages 2 and 3 are structural work; stage 1 and stage 4 measure generation quality. Freeze whichever axis is not being tested. Never change the model, prompt, Definition and evaluator in the same comparison and then attribute improvement to one of them. Runtime ownership remains with the Consumer; a small headless reference Consumer can be a separate deliverable without turning Unit Generator into Towerright.

For numerical reshape, separately address remaining PR 6 evaluator defects or extract existing rule implementation offline with unchanged behavior. Do not begin with simulator rewrite, arbitrary plugin execution, fine-tuning or multi-agent service. Exact public BTD6 compatibility and private transitions remain open requirements for later stages.
