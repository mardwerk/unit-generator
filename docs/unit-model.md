# Unit model

This content model belongs only to the bundled classic definition. Other definitions replace it with their own output schema.

`UnitSpec` version `0.1` is the engine-neutral finished-unit contract exported by
`@mardwerk/unit-definitions/classic`. The generator reuses it for fixtures, model drafts, editing, compilation, and
validation. See [the detailed schema](unit-spec-v0.1.md) for field definitions.

A unit contains identity and summary, roles/tags, placement geometry, credit costs, base stats,
resources, states, statuses, actions, abilities, summons, upgrades, forms, and visual/audio
requirements. Stable IDs connect those structures. Unknown fields are rejected; namespaced
`extensions` provide the controlled metadata seam and do not change generic mechanics.

Actions separate triggers, acquisition/targeting, delivery, timing, emitters, and effects. Fields name
units such as seconds, world units, hit points, and credits. Aggregate and per-emitter attack rates
are distinct. Resources and secondary mechanics declare finite caps, activation, consumption,
recovery, expiry, ownership, and replacement behavior as applicable. Typed conditions are data;
executable code and arbitrary evaluated expressions are not supported.

Upgrades form a directed acyclic graph. Nodes contain prerequisites, exclusions, cost, and typed
operations that alter or add mechanics. `compileUnit(unit, selection)` applies purchased nodes to
produce a `UnitBuild`; upgrades do not duplicate complete units. Forms are separate encounter
selections and use the bounded activation rules of the selected profile.

Generation uses a separate strict `GenerationRequest`:

```json
{
  "schemaVersion": "0.1",
  "concept": "Clockwork falcon",
  "sourceNotes": "A scouting machine with a folding wing assembly.",
  "designNotes": "Emphasize precision and temporary slowing.",
  "profile": "classic-three-path",
  "seed": 42,
  "constraints": { "desiredRoles": ["damage", "control"] },
  "options": { "provider": "fixture", "repairAttempts": 2, "includePreview": true }
}
```

Concepts are limited to 512 characters, each notes field to 8000, and seeds to unsigned 32-bit
integers. Optional `sourceUrls` accepts up to three HTTP(S) URLs, each at most 2048 characters.
Model providers also recognize URLs in caller-supplied source notes and read them within
[source limits](providers.md#source-pages). `/v1/capabilities` exposes current request and options schemas. The [profile](profile-classic-three-path.md) defines topology and numeric bands.

Portable output separates data by purpose:

| File                         | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `artifacts/unit.json`        | Editable UnitSpec                                                     |
| `reports/validation.json`    | Validation, audit, balance estimates, quality diagnostics             |
| `request.json`               | Normalized source concept, URLs, notes, constraints, options, seed    |
| `generation.json`            | Versions, provider, prompt, repair count, source records, determinism |
| `previews/unit-summary.json` | Optional compact presentation data                                    |
| `manifest.json`              | Artifact kinds, paths, byte counts, SHA-256 checksums                 |

The manifest uses Foundation `0.1`. Generated artifact kinds are `mardwerk.unit-spec`,
`mardwerk.unit-validation-report`, `mardwerk.unit-preview`, `mardwerk.unit-generation`, and
`mardwerk.unit-generation-request`. Generation metadata remains outside UnitSpec. Job IDs and creation
times belong to the returned execution metadata.
