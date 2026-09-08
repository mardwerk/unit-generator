# Classic three-path definition

`classic-three-path` definition `0.2.0` produces the classic UnitSpec `0.1` shape. Its authoritative game semantics are in [the bundled rules](../packages/definitions/definitions/classic-three-path/rules.md); its editable generation schema and instructions live beside those rules.

A legal build has one primary path through tier 5 and at most one crosspath through tier 2, with no more than seven purchased nodes. Every path has five cumulative tiers. Prerequisites remain internal to their path. Prices are positive and increase within each path.

The ordinary validator checks every legal selection, reference integrity, ownership of upgrade writes, path independence, supported mechanics and numeric bounds. It does not simulate combat or require a progression-quality score.

| Quantity                   | Default band        |
| -------------------------- | ------------------- |
| Placement cost, low        | 200 to 400 credits  |
| Placement cost, medium     | 450 to 750 credits  |
| Placement cost, high       | 800 to 1200 credits |
| Range                      | 8 to 80 world units |
| Self-targeted range        | 0 to 80 world units |
| Effective interval cadence | 0.15 to 30 seconds  |
| Effect duration            | 0.1 to 60 seconds   |

Effective cadence respects both interval and cooldown. Empty enemy `includeTags` means unrestricted eligible enemies. The contract does not assume an implicit `enemy` tag.

The default configuration allows one manual active ability and three prominent mechanics under its declared counting rule. Edit `maxRange`, `maxManualAbilities` and `maxProminentMechanics` in the definition configuration. The same resolved settings supply prompt guidance and validation, including validation without an original request.

Creative requests can specify `noManualAbilities`, `excludedMechanics`, `allowedMechanics`, `requiredRoles`, `placementCostBand` and `maxProminentMechanics`. Unknown fields or mechanics fail. Preferences belong in `intent`. Legacy `complexity`, `nativeActiveLimit` and preferred-mechanic request fields are not part of the new input contract.

The role vocabulary is damage, control, burst, support and economy. Role checks use structural indicators and do not prove effective performance. Fixtures cover damage and control; a model supplies creative drafts for the other supported roles.

Forms are explicit encounter configurations, granted by an upgrade or selected after external unlocking. Runtime transformations, healing, shields and general stat modifiers are unsupported by this definition. A different game can define them in its own schema and implementation.

Simulation, numerical scoring and synthetic reference comparisons remain optional default-system developer diagnostics through `@mardwerk/unit-definitions/diagnostics`. They do not determine generation success or establish competitive balance.
