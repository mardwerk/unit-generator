# Interpretation record (experimental)

The default planned-v1 route runs unchanged without this. A request can
optionally pin an interpretation: a reference pack plus a layout plan that
maps reference concepts onto the ruleset. The planner must honor the
bindings, and the checker re-validates the retained copy.

These helpers are experimental. Import them by path, for example
`src/core/design.ts`. They are not part of the public API in
`src/core/index.ts`.

## Components

| Component | Module | Responsibility |
| --- | --- | --- |
| Domain backend | `src/core/mechanics/*` | Executable operations, resolution, build legality. |
| RulePack | `src/core/rulepack.ts` | Versioned pack descriptors, registry, immutability. |
| ReferencePack | `src/core/reference.ts` | Source concept, relationships, evidence vs interpretation. |
| Interpretation | `src/core/design.ts` | Candidate selection, layout plans, validation, capabilities. |

## What the pack descriptors do and do not do

`rulePackSchema` defines `id`, `version`, `domain`, `normal_progression`,
`apex` and `shared_form_progression`. Bundled descriptors:

- `td-three-path@1.0.0`: matches the numerical backend. Three paths, five
  tiers, explicit-synthesis apex, no shared-form progression.
- `td-four-path@1.0.0`: a probe that shows layout validation works with no
  generator change. It is layout-only. Numerical build resolution,
  purchase legality and presentation stay on the 3-by-5
  MechanicsDefinition, so the optional route accepts 3-by-5 packs only.

A plan never edits its pack. `assertPackImmutable` compares resolved pack
content, so the same id and version with edited rules still fails. A pack
that asks for an unavailable system produces an explicit incompatibility
instead of a silent substitution:

```text
Unsupported design binding: shared_forms

Active pack: td-three-path@1.0.0
Required module: shared-forms@1.0.0

Regenerate the layout using available systems,
or select a pack that provides this module.
```

## ReferencePack and selection

`referencePackSchema` knows general relationships such as `develops_into`,
`can_coexist_with` and `limited_by`. Sourced descriptions and inferred
design groupings carry different `status` values. Coherence checks cover
duplicate concept ids, dangling relationship endpoints and evidence ids
that resolve to no retained span or source document. Character entries are
request inputs or test fixtures, never framework code.

Layout candidates arrive from the caller with an explicit selection.
`selectLayout` checks that every candidate binds known concepts, matches
the pack path count and differs genuinely from the rest. The same paths
under a new label are one layout, not an alternative. There is no
automatic comparison and no built-in recipe.

`planFromLayout` records the mapping as a `DesignLayoutPlan`: subject,
`base_identity`, `specialization_paths`, `shared_forms`, apex policies and
invariants. Unsupported proposals stay in the plan so validation can
report them. Slots sort alphabetically onto path1 and up.

`validateLayoutPlan` checks the subject, the pack ref, known concepts,
the path count, disabled apex bindings and disabled shared forms.

`assertSupportedBehavior` follows the active Definition. Base behaviors
are always available. `distinct-volley` and follow-ups need their attack
extensions enabled. Anything else is a reserved technique or an
unapproved extension proposal until a reviewed backend module implements
it.

## Optional route

Set `request.interpretation` with a reference pack and a layout plan.
Prepare validates it: planned-v1 mode, a known 3-by-5 pack, a clean
layout check and resolved evidence. The planner receives the pinned
bindings and each branch must cite its bound concept or the base
identity. The decoded plan retains the record, and the checker fails the
draft when the retained copy differs from the request or no longer
validates. Revisions resupply the record as request input. No field
means the default route runs exactly as before.

## Validation

`examples/luffy.request.json` runs locally through the existing author
route and stays out of version control per `README.md`. It shows
existing-route behavior: Armament, Observation and Conqueror paths over a
stretching-punch base, with shared Gear progression reserved. It does not
exercise the new helpers. Those are covered offline in
`tests/rulepack-layout.test.ts`, including a form-less reference with
conflicting groupings on the same interface.
