# RulePack and DesignPlan framework

The generator framework loads inputs, proposes layouts, compares candidates,
requests revisions, runs validation and saves results. It contains no
hardcoded three-path rule: path counts, purchase restrictions, economy and
design conventions arrive through a versioned `RulePack`.

The domain backend (`src/core/mechanics`) defines executable game operations,
their semantics and how to resolve them. A rule file can authorize a
behavior, but only the backend can execute it. Adding teleportation to a pack
without a movement-changing operation is a proposal, not an implementation.

## Components

| Component | Module | Responsibility |
| --- | --- | --- |
| Generator framework | `src/core/draft.ts`, `src/core/blueprint/*` | Propose layouts, implement mechanics, compare candidates, repair, validate. |
| Domain backend | `src/core/mechanics/*` | Executable operations, resolution, build legality. |
| RulePack | `src/core/rulepack/*` | Permitted systems, progression, purchase restrictions, economy, conventions. |
| ReferencePack | `src/core/reference/*` | Source concept, relationships, evidence vs interpretation. |
| DesignProfile | `src/core/design/profile.ts` | Criteria plus accepted/rejected layout examples with reasons. |
| DesignPlan | `src/core/design/layout.ts` | Mapping from reference concepts to pack systems, with invariants. |
| Compiler boundary | `src/core/design/compiler.ts` | Missing-capability diagnostics for unexecutable behavior names. |

## RulePack

`rulePackSchema` (`src/core/rulepack/schemas.ts`) defines `id`, `version`,
`domain`, `normal_progression`, `design_conventions`, `apex`, `economy` and
`shared_form_progression`. Bundled packs (`src/core/rulepack/packs.ts`):

- `td-three-path@1.0.0`: public default. Three paths, five tiers, crosspath
  caps, explicit-synthesis apex, no shared-form progression.
- `private-td@1.0.0`: extends the public pack. Adds stamina-limited shared
  forms with unlock thresholds `[3, 4, 6, 7]` and a
  `permanent_highest_form_when_present` apex form policy. It names no
  character, Haki or Gear.
- `td-four-path@1.0.0`: proves layout search works without generator code
  changes. The current `td-combat` backend implements 3x5; other counts are
  layout-valid (see `backendSupportsPack`).

Pack inheritance rejects silent merges: `assertCompatibleExtension` requires
an explicit `extends` declaration when structural fields change.

A plan never edits its pack. `assertPackImmutable` rejects revisions that
change the governing pack ref, and `validateLayoutPlan` reports an explicit
incompatibility instead of silently adding private mechanics:

```text
Unsupported design binding: shared_forms

Active pack: td-three-path@1.0.0
Required module: shared-forms@1.0.0

Regenerate the layout using available systems,
or select a pack that provides this module.
```

## ReferencePack and taste

`referencePackSchema` (`src/core/reference/relationships.ts`) understands
general relationships (`belongs_to_family`, `develops_into`,
`can_coexist_with`, `replaces`, `requires`, `expresses_identity`,
`limited_by`). Sourced descriptions and inferred design groupings carry
different `status` values. Character-specific entries are request inputs or
test fixtures, never framework code.

`compareLayouts` proposes coherent-mastery, combat-role and competing-form
candidates, then selects under a `DesignProfile`. The default profile
(`coherent-mastery@1.0.0`) prefers parallel mastery separated from shared
transformation progression, with the reason attached to each example.

`planFromLayout` records the mapping as a `DesignLayoutPlan`: subject,
`base_identity`, `specialization_paths`, optional `shared_forms`, apex
policies and invariants (base identity retained, specialization purchases
keep form access, forms grant no unpurchased effects).

## Validation

The Luffy check (`examples/luffy.request.json`, generated locally and kept
out of version control per `README.md`) produces Armament, Observation and
Conqueror paths over a stretching-punch base, reserves shared Gear
progression under the public pack, and passes all deterministic build
checks. Replaceability cases live in `tests/rulepack-layout.test.ts`.
