# PR 10: optional planning augmentation

[PR 10](https://github.com/mardwerk/unit-generator/pull/10) merged September 22, 2026 at `1263bb32b20abb7fae3194e67641e3e2f34cd687` as an opt-in experiment. The combined concept and experiment tree passed all 436 tests, TypeScript, build, formatting and whitespace checks.

The corrected experiment at `2064b6b` addresses the three integration findings below. Provider schemas exclude interpretation; decoding retains only the caller's record; the planner receives concept meaning and relationships; citation joins retain exact spans. Original public fixtures cover the full generation, file reload, revision, checking and rendering cycle. The 408-test branch suite passed, followed by the affected layout tests after fixture replacement. No live interpretation benefit is claimed.

The experiment remains optional on the bundled three-path `planned-v1` backend. Base-identity citation fallback establishes coverage, not specialization fidelity. Helper defaults remain explicit limitations. The reviews below are historical assessments of their named commits.

## Historical review of c97fdad

Re-reviewed September 22, 2026 at `c97fdad8cb052bafa37f6dc92de3179f8ba2f3d3`. The revised PR now integrates an optional interpretation into prepare, planning, retained output and checking. The earlier standalone-only assessment below applies to the old head. At that head, the PR remained open and unmerged because three integration problems were reproducible. The correction and merge above supersede that disposition.

1. **P1: the supposedly unchanged default route exposes a model-owned interpretation.** Adding `interpretation` to `designPlanSchema` also adds it to `purchasePlanSchema`, which omits only `upgradeIntents` (`src/core/blueprint/purchase-plan.ts:20`). Consequently `designPlanRequest` exposes the new object in its provider schema even when the request has no interpretation. A direct probe also supplied an otherwise valid Mira plan with an interpretation absent from its request: `decodeDesignPlan` retained it at `src/core/blueprint/plan.ts:274`. The new checker then treats such an unsolicited record as a conflict. Keep interpretation exclusively in the retained schema, omit it from model output schemas, and bind it only from the request. Test the absent-input provider schema against the base revision as well as unsolicited model output.

2. **P2: concept citations are widened from individual spans to whole documents.** `interpretationCitationIssues` maps both allowed evidence and actual citations to document IDs (`src/core/blueprint/plan.ts:350` and `:371`). The offline probe used two paragraphs in one source: `Armament hardens fists.` and `Cooking soup is unrelated to these powers.` Armament and base concepts bound only the first span, `source1:0`. Every branch cited the unrelated second span, `source1:1`. The function returned `[]`. Preserve exact span IDs; expand to a document's retained spans only when the concept explicitly cites that document ID. Add a same-document wrong-span regression, including the base-identity fallback.

3. **P2: the pinned prompt discards the interpretation's meaning.** `pinnedInterpretationPrompt` passes only concept IDs and evidence IDs, omitting concept labels, descriptions, status and all relationships (`src/core/blueprint/plan.ts:322`). The test request's `Perception discipline.` description and `can_coexist_with` relationship were absent from the generated prompt. With opaque IDs or competing interpretations of the same source, the model cannot recover the selected grouping from this mapping. Supply the semantic concept records and relevant relationships as reference data. Test opaque IDs with different descriptions and relationships over the same evidence, so changing the interpretation actually changes the planner's context.

Several earlier blockers are fixed: caller-supplied selection replaces built-in comparison recipes; extension checks read the Definition; layout validation rejects disabled Apex bindings and mismatched reference subjects; unsupported forms survive construction; pack comparison uses parsed content; and duplicate concepts and unresolved evidence are checked. Documentation now limits the four-path descriptor to layout work and distinguishes the existing-route Luffy sample from integration evidence. These improvements do not resolve the three issues above.

Verification on this exact head: all 403 tests passed, along with typecheck, build, formatting and `git diff --check`. The additional probes ran offline against the compiled source. The new tests do not cover the reproduced default-schema leak, same-document evidence mismatch or loss of concept semantics. No provider calls or remote comments were made. The review worktree was updated to this head; the existing main checkout and pending documentation were preserved.

Disposition at that head: keep PR 10 unmerged until those three boundaries are corrected. Its optional-record direction fits the requested augmentation. Passing tests do not yet establish the claimed unchanged default behavior or enforcement of the supplied interpretation.

## Historical review of c7216f3

Reviewed September 22, 2026 at `c7216f3b0824b3630dec1199fa479be66e720df2`. [PR 10](https://github.com/mardwerk/unit-generator/pull/10) was open and mergeable on GitHub, but is not ready to merge on technical grounds. The existing generation route should remain the default. The user authorized merging only if the contribution was suitable and preferred augmentation over replacement.

A clean detached review checkout was created at `.worktrees/unit-generator-pr10-review` in the workspace. Main and its pending documentation were preserved. No PR comment, provider call, merge or remote modification was made.

## What c7216f3 added

Relative to main, the PR adds three standalone core files (`rulepack.ts`, `reference.ts`, `design.ts`), exports, tests, an example request and documentation. It does not modify production planning, drafting, compilation or the CLI/Lab flow. It therefore does not override the current implementation. It also does not yet augment normal generation: the new helpers have no production callers beyond their exports.

That head removed the private pack and consolidated earlier modules. The PR body still claims private forms, inheritance checks and six new cases. That head has two public pack descriptors and five tests. The branch's recorded live Luffy generation uses the existing `author` route; that route does not call the new layout helpers. Its successful result cannot demonstrate that these helpers selected the layout or enforced its pack.

Useful ideas are an explicit reference relationship record, a retained layout binding, versioned configuration and separate source/adaptation status. They are compatible with an optional planning layer. A second independent rule authority and fixed character-shaped selection algorithm are not necessary to retain those ideas.

## Verified blockers at c7216f3

TypeScript test compilation and all five current `rulepack-layout.test` cases passed. Additional offline probes against that exact compiled head established:

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Candidate comparison does not compare different organizations | `compareLayouts` gives coherent-mastery, combat-role and competing-Gear candidates the identical `paths` array; default selection takes the first non-rejected ID | Different labels do not demonstrate taste or alternative layouts. The four-path fallback takes the first concepts in source order. |
| Capability checks ignore enabled extensions | With `definition.rules.attackExtensions = []`, `assertSupportedBehavior('follow-up', definition)` succeeds | The exported guard can certify a capability absent from the selected Definition. Its static set duplicates the existing vocabulary and uses the Definition only in an error message. |
| Apex policy is not enforced | Set `pack.apex.enabled = false`; a plan containing `integrate_all_paths` still returns no validation issues | The active pack does not determine valid Apex bindings as documented. |
| Unsupported forms are silently discarded | Pass a layout with `sharedForms` to `planFromLayout` under the public pack; output contains `shared_forms: null` | Construction hides the incompatibility before validation. Preserve the proposal and report the unsupported binding instead. |
| Subject identity is not checked | Change a valid plan's subject to another character; validation returns no issues | A plan can be associated with the wrong reference subject. |

Further code inspection shows that `assertPackImmutable` compares only reference strings, so it cannot detect changed content under the same ID/version. Frozen bundled constants protect those objects, but not arbitrary caller-supplied packs. `state_constraints` are stored strings, not evaluated purchase rules. Reference validation checks relationship endpoints but not unique concept IDs or whether evidence IDs resolve to retained source passages. These APIs need narrower claims or stronger contracts before becoming public validation boundaries.

The four-path test establishes only that a standalone binding map can contain four keys. Numerical generation, build resolution and presentation remain three-by-five. The documentation's statement that the generator holds no three-path rule is consequently incorrect. Neither this PR nor its live sample establishes runtime forms or an executable Apex.

## Augmentation proposed at c7216f3

Keep the current Definition/Profile and `planned-v1` flow authoritative. Add an optional interpretation record to the existing plan rather than replacing generation or creating a parallel compiler. Map its bindings to the active Definition's actual capabilities; reserve broader future capabilities explicitly.

An interpretation record can retain source relationships, candidate organizations, a selected grouping, omissions and user-confirmed invariants. Require genuinely different bindings or grouping rationales before calling objects alternatives. A project preference can favor preserving parallel mastery, but the default must not contain a universal “gears-as-competing-paths” recipe or always select the first candidate. Caller-provided candidate layouts with an explicit selection are a more honest initial boundary than a pretend automatic comparison.

Use existing evidence IDs and validate identity and joins. Preserve unsupported requested bindings as findings. Check disabled Apex/forms and per-Definition extensions. Compare resolved configuration content or hashes, not only ID strings, when checking immutability. Until integrated, label any descriptors and helpers experimental and keep them out of the main public API.

Before merging a revised augmentation, require: unchanged default-route behavior; an explicit optional route consuming the interpretation record; preservation through mechanics and revision; rejection of the counterexamples above; and accurate docs separating layout validation from numerical/runtime support. Do not hardcode Haki output as the acceptance test. A character without forms and a conflicting source grouping should exercise the same interface.

Disposition at that head: do not merge this head. Preserve it as a reference for a smaller opt-in interpretation addition. This complements the [reshape plan](GENERATOR-RESHAPE.md) and [PR 6 review](PR6-REVIEW.md); it does not justify replacing either current generation or the existing mechanics validator.
