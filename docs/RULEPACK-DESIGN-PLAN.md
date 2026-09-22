# RulePack and DesignPlan framework

The generator framework loads inputs, proposes layouts, compares candidates,
requests revisions, runs validation and saves results. It holds no
three-path rule. Path counts, purchase restrictions and apex policy arrive
through a versioned `RulePack`.

The domain backend in `src/core/mechanics` defines executable game
operations, their semantics and how to resolve them. A rule file can
authorize a behavior, but only the backend can execute it. Adding
teleportation to a pack without a movement-changing operation is a proposal,
not an implementation.

## Components

| Component | Module | Responsibility |
| --- | --- | --- |
| Generator framework | `src/core/draft.ts`, `src/core/blueprint/*` | Propose layouts, implement mechanics, compare candidates, repair, validate. |
| Domain backend | `src/core/mechanics/*` | Executable operations, resolution, build legality. |
| RulePack | `src/core/rulepack.ts` | Permitted systems, progression, purchase restrictions, apex policy. |
| ReferencePack | `src/core/reference.ts` | Source concept, relationships, evidence vs interpretation. |
| DesignProfile, DesignPlan | `src/core/design.ts` | Taste examples, layout comparison, reference to ruleset mapping. |

## RulePack

`rulePackSchema` defines `id`, `version`, `domain`, `normal_progression`,
`apex` and `shared_form_progression`. Bundled packs:

- `td-three-path@1.0.0`: the default. Three paths, five tiers, crosspath
  caps, explicit-synthesis apex, no shared-form progression.
- `td-four-path@1.0.0`: a probe that shows layout search works with no
  generator change. The current backend implements 3-by-5, so other counts
  are layout-valid only.

A plan never edits its pack. `assertPackImmutable` rejects revisions that
change the governing pack ref, and `validateLayoutPlan` reports an explicit
incompatibility instead of silently adding unavailable systems:

```text
Unsupported design binding: shared_forms

Active pack: td-three-path@1.0.0
Required module: shared-forms@1.0.0

Regenerate the layout using available systems,
or select a pack that provides this module.
```

## ReferencePack and taste

`referencePackSchema` knows general relationships such as `develops_into`,
`can_coexist_with` and `limited_by`. Sourced descriptions and inferred
design groupings carry different `status` values. Character entries are
request inputs or test fixtures, never framework code.

`compareLayouts` proposes coherent-mastery, combat-role and competing-form
candidates, then selects under a `DesignProfile`. The default profile
prefers parallel mastery kept apart from shared transformation
progression, with the reason attached to each example.

`planFromLayout` records the mapping as a `DesignLayoutPlan`: subject,
`base_identity`, `specialization_paths`, optional `shared_forms`, apex
policies and invariants. Base identity stays, specialization purchases keep
form access, and forms grant no unpurchased effects.

## Validation

The Luffy check in `examples/luffy.request.json` runs locally and stays
out of version control per `README.md`. It produces Armament, Observation
and Conqueror paths over a stretching-punch base, reserves shared Gear
progression under the public pack, and passes all deterministic build
checks. Replaceability cases live in `tests/rulepack-layout.test.ts`.
