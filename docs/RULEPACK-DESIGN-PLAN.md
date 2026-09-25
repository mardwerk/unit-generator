# Interpretation record (experimental)

Default `planned-v1` runs unchanged without an interpretation. A request can
optionally pin an interpretation: a reference pack plus a layout plan that
maps reference concepts onto the ruleset. The planner receives the intended
bindings and their meaning. Checks establish retention, layout validity and
exact citation coverage; they do not establish that the generated design
follows the supplied interpretation.

These helpers are experimental. Import them by path, for example
`src/core/design.ts`. They remain outside the public API in
`src/core/index.ts`.

## Components

| Component | Module | Responsibility |
| --- | --- | --- |
| Domain backend | `src/core/mechanics/*` | Executable operations, resolution, build legality. |
| RulePack | `src/core/rulepack.ts` | Versioned pack descriptors, registry, immutability. |
| ReferencePack | `src/core/reference.ts` | Source concept, relationships, evidence vs interpretation. |
| Interpretation | `src/core/design.ts` | Candidate selection, layout plans, validation, capabilities. |

## Pack descriptor scope

`rulePackSchema` defines `id`, `version`, `domain`, `normal_progression`,
`apex` and `shared_form_progression`. Bundled descriptors:

- `td-three-path@1.0.0`: matches the numerical backend's three paths and five
  tiers. It declares an explicit-synthesis Apex and no shared-form progression.
  The Apex declaration does not implement acquisition, synthesis or runtime behavior.
- `td-four-path@1.0.0`: a probe that shows layout validation works with no
  generator change. It is layout-only. Numerical build resolution,
  purchase legality and presentation stay on 3-by-5
  MechanicsDefinition, so the optional route accepts 3-by-5 packs only.

Plans never edit their pack. `assertPackImmutable` compares resolved pack
content, so same id and version with edited rules still fails. A pack
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
the pack path count and has different bindings from the rest. The same paths
and shared forms under a new label are one layout, not an alternative. There is no automatic comparison or built-in recipe.

`planFromLayout` records the mapping as a `DesignLayoutPlan`: subject,
`base_identity`, `specialization_paths`, `shared_forms`, apex policies and
invariants. Unsupported proposals stay in the plan so validation can
report them. Slots sort alphabetically onto path1 and up.

The helper chooses the base from the source of the first `expresses_identity`
relationship, falling back to the first concept. It inserts three fixed
invariants: preserve base fighting identity, preserve shared form access
when purchasing a specialization, and prevent forms from granting unpurchased
specialization effects. These helper defaults are not derived from
the source or active pack. Callers can edit the returned base identity and
invariants before supplying the record.

`validateLayoutPlan` checks subject, pack ref, known concepts,
path count, disabled apex bindings and disabled shared forms.

`assertSupportedBehavior` uses the active Definition for extension checks. Base behaviors
are always available. `distinct-volley` and follow-ups need their attack
extensions enabled. Anything else is a reserved technique or an
unapproved extension proposal until a reviewed backend module implements
it.

## Optional route

Set `request.interpretation` with a reference pack and a layout plan.
Preparation validates it: `planned-v1` mode, a known 3-by-5 pack, a clean
layout check and resolved evidence. The planner receives concept labels,
descriptions, evidence/interpretation status, relationships and bindings.
Source evidence and proposed grouping remain distinct.

Provider output schemas exclude `interpretation`. Decoder ignores a
model-supplied copy, including unsolicited copies from providers that do not
enforce the schema, and binds the retained record only from the request.
Revisions explicitly resupply that record. Omitting `request.interpretation`
preserves the default route.

Each branch must cite an exact retained evidence span allowed by its bound
concept or base identity. A concept that explicitly cites a source document
allows that document's retained spans. A concept citing one span does not allow
an unrelated span from the same document. Base-identity fallback is deliberate:
it establishes coarse citation coverage, not specialization fidelity. A branch
can pass while ignoring its specialization, so semantic review and controlled
design comparison remain necessary.

Checking repeats record equality, layout, evidence resolution and branch
citation coverage after reload. `render --details` displays the retained
interpretation separately from the unit sheet. A successful check does not
prove that prose honors relationships or invariants, nor that a Consumer
implements them. External caller-supplied pack registration, concept mode,
shared-form execution and arbitrary numerical topologies remain outside this
experiment.

## Validation

`examples/iona.two-path.concept.request.json` is a public example with
an explicit external configuration. From the repository root, install dependencies and run
`pnpm build` first. Prepare it offline with the following command; use a new output
path if the destination already exists:

```sh
node dist/cli.js prepare examples/iona.two-path.concept.request.json --preset btd6 --output .runs/iona-two-path.prepared.json
```

Authoring that request with the same preset calls the configured model. No live
generation of this example is claimed here. The supplied record separates the original fictional brief from
proposed gameplay groupings.

Layout helpers are covered offline in `tests/rulepack-layout.test.ts`,
including a reference with no forms and conflicting groupings on the same
interface. Tests use original public reference fixtures.

The September 22, 2026 correction adds opaque-ID prompt regressions,
same-document wrong-span cases including base fallback, unsolicited model
interpretation cases and a provider-schema comparison against pre-PR revision
`b54822c6d7ff7f77d542ecc4a47f5cabd4b881e7`. An original Mira model double
exercises generation, file save/reload, revision, checking and rendering with
an interpretation supplied. These offline tests establish application behavior,
not live interpretation fidelity, design preference or gameplay quality.

Historical verification of the September 22 correction: all 408 branch tests passed, with production
and test TypeScript compilation, build, formatting and whitespace checks.
After replacing PR-added character fixtures with original public examples,
11 affected layout tests and test compilation passed again. Documented
Mira preparation command was executed offline. No model was called.
